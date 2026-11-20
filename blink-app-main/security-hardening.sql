-- =====================================================================
-- B-Link — security hardening (additive, safe to run more than once)
-- Run LAST, after all other scripts. It never deletes data, tables or
-- columns, and never renames anything. Every step is wrapped so one
-- failure cannot stop the rest; read the "Messages" panel afterwards.
--
-- ROLLBACK for any trigger below:  drop trigger <name> on <table>;
-- ROLLBACK for a policy below:     drop policy "<name>" on <table>;
-- =====================================================================

-- 0. helpers (identical to earlier scripts) ------------------------------------------------
create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

-- 1. FUNCTION PERMISSIONS ---------------------------------------------------------------------
-- New functions must not be callable by the public / signed-out visitors by default.
do $$ begin
  alter default privileges in schema public revoke execute on functions from public, anon;
exception when others then raise notice 'default privileges: %', sqlerrm; end $$;

-- 1a. Internal helpers must NEVER be callable from the app (this includes _cascade_delete)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_cascade_delete', '_comment_json', '_story_chat_message', '_admin_guard', '_valid_username', '_purge_user_core')
  loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    exception when others then raise notice 'revoke % failed: %', f.sig, sqlerrm; end;
  end loop;
end $$;

-- 1b. Trigger functions are not meant to be called at all
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prorettype = 'trigger'::regtype
  loop
    begin execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    exception when others then null; end;
  end loop;
end $$;

-- 1c. Every other SECURITY DEFINER function: signed-in app users only (signed-out visitors may only
--     check whether a username is free). service_role and the database owner keep access.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and p.prorettype <> 'trigger'::regtype
       and p.proname not in ('_cascade_delete', '_comment_json', '_story_chat_message', '_admin_guard', '_valid_username', '_purge_user_core', 'blink_access_token_hook')
  loop
    begin
      execute format('revoke execute on function %s from public, anon', f.sig);
      if f.proname <> 'username_available' then
        execute format('grant execute on function %s to authenticated, service_role', f.sig);
      else
        execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
      end if;
    exception when others then raise notice 'permissions for % failed: %', f.sig, sqlerrm; end;
  end loop;
end $$;

-- 1d. Jobs that only the database scheduler should run
do $$
declare f text;
begin
  foreach f in array array['purge_unconfirmed_accounts(integer)', 'purge_expired_stories()', 'mark_stale_offline()'] loop
    begin execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    exception when others then null; end;
  end loop;
end $$;
-- (the owner can still run purge_unconfirmed_accounts from the admin tools through service_role / SQL editor)

-- 1e. Pin the search path of every SECURITY DEFINER function that has none (prevents hijacking)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    begin execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
    exception when others then raise notice 'search_path for % failed: %', f.sig, sqlerrm; end;
  end loop;
end $$;

-- 1f. Friendship checks can only be asked about yourself (no probing other people's friends)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when a is null or b is null or a = b then false
    when auth.uid() not in (a, b) and public._role_rank(public._my_role()) < 2 then false
    else exists (select 1 from public.follows where follower_id = a and following_id = b)
     and exists (select 1 from public.follows where follower_id = b and following_id = a)
  end
$$;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;

-- 2. USERS TABLE ---------------------------------------------------------------------------------
-- 2a. Restrictive policies are ANDed with the existing ones, so they tighten access
--     whatever broad policies already exist (nothing is dropped).
do $$ begin
  drop policy if exists "hardening: no direct profile inserts" on public.users;
  create policy "hardening: no direct profile inserts" on public.users as restrictive for insert
    with check (public._role_rank(public._my_role()) >= 4);       -- profiles are created by the server (verified sign-up)

  drop policy if exists "hardening: edit only your own profile" on public.users;
  create policy "hardening: edit only your own profile" on public.users as restrictive for update
    using (id = (select auth.uid()) or public._role_rank(public._my_role()) >= 3)
    with check (id = (select auth.uid()) or public._role_rank(public._my_role()) >= 3);

  drop policy if exists "hardening: only the owner deletes profiles" on public.users;
  create policy "hardening: only the owner deletes profiles" on public.users as restrictive for delete
    using (public._role_rank(public._my_role()) >= 4);
exception when others then raise notice 'users policies: %', sqlerrm; end $$;

-- 2b. Money, status and moderation columns cannot be changed from the browser by ordinary users.
--     (Server functions and administrators are unaffected.)
create or replace function public.zz_users_privileged_guard()
returns trigger language plpgsql as $$
declare o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); k text;
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) >= 3 then return new; end if;
  foreach k in array array['role', 'is_verified', 'verified_at', 'coins_balance', 'subscription_plan', 'subscription_expires_at',
                           'is_banned', 'ban_reason', 'is_restricted', 'restriction_reason', 'suspended_until', 'is_business',
                           'followers_count', 'following_count', 'friends_count', 'posts_count'] loop
    if o ? k and (o -> k) is distinct from (n -> k) then
      raise exception 'You are not allowed to change %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists zz_users_privileged_guard on public.users;
create trigger zz_users_privileged_guard before update on public.users
for each row execute function public.zz_users_privileged_guard();

-- 3. PAYMENTS & COINS (manual verification stays exactly as it is) ------------------------------------
-- 3a. the official price list in one place
create or replace function public._payment_price_ok(p_type text, p_plan text, p_days int, p_coins int, p_amount numeric)
returns boolean language sql immutable as $$
  select case p_type
    when 'subscription'  then p_amount = case p_plan when 'pro' then 299 when 'creator' then 599 when 'business' then 1499 end
    when 'boost'         then p_amount = case p_days when 1 then 200 when 3 then 500 when 7 then 999 when 30 then 2999 end
    when 'coins'         then (p_amount = 50  and p_coins in (100))
                           or (p_amount = 100 and p_coins in (250))
                           or (p_amount = 200 and p_coins in (600, 650))
                           or (p_amount = 500 and p_coins in (1500, 1700))
    when 'verification'  then p_amount = 500
    when 'business_page' then p_amount = 2000
    else true                                              -- unknown kinds are accepted but can never grant anything
  end
$$;

-- 3b. a user can only ever create a PENDING payment for themselves, at a real price
create or replace function public.zz_payments_insert_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) >= 3 then return new; end if;
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    raise exception 'Invalid payment' using errcode = '42501';
  end if;
  if not coalesce(public._payment_price_ok(new.payment_type, new.plan, new.boost_days, new.coins_amount, new.amount_kes), false) then
    raise exception 'Payment details do not match the price list' using errcode = '22023';
  end if;
  new.status := 'pending';
  new.service_active := false;
  new.verified_by := null; new.verified_at := null; new.service_activated_at := null; new.service_expires_at := null;
  new.rejection_reason := null;
  return new;
end $$;
drop trigger if exists zz_payments_insert_guard on public.payments;
create trigger zz_payments_insert_guard before insert on public.payments
for each row execute function public.zz_payments_insert_guard();

-- 3c. only administrators change or remove payments; only administrators write coin records
do $$ begin
  drop policy if exists "hardening: staff change payments" on public.payments;
  create policy "hardening: staff change payments" on public.payments as restrictive for update
    using (public._role_rank(public._my_role()) >= 3) with check (public._role_rank(public._my_role()) >= 3);
  drop policy if exists "hardening: staff delete payments" on public.payments;
  create policy "hardening: staff delete payments" on public.payments as restrictive for delete
    using (public._role_rank(public._my_role()) >= 3);
  drop policy if exists "hardening: own payment inserts" on public.payments;
  create policy "hardening: own payment inserts" on public.payments as restrictive for insert
    with check (user_id = (select auth.uid()) or public._role_rank(public._my_role()) >= 3);
exception when others then raise notice 'payments policies: %', sqlerrm; end $$;

do $$ begin
  drop policy if exists "hardening: staff write coin records" on public.coin_transactions;
  create policy "hardening: staff write coin records" on public.coin_transactions as restrictive for insert
    with check (public._role_rank(public._my_role()) >= 3);
  drop policy if exists "hardening: staff change coin records" on public.coin_transactions;
  create policy "hardening: staff change coin records" on public.coin_transactions as restrictive for update
    using (public._role_rank(public._my_role()) >= 3) with check (public._role_rank(public._my_role()) >= 3);
  drop policy if exists "hardening: staff remove coin records" on public.coin_transactions;
  create policy "hardening: staff remove coin records" on public.coin_transactions as restrictive for delete
    using (public._role_rank(public._my_role()) >= 3);
exception when others then raise notice 'coin_transactions policies: %', sqlerrm; end $$;

-- 3d. a boost request always starts pending
create or replace function public.zz_boosts_insert_guard()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) >= 3 then return new; end if;
  if new.user_id is distinct from auth.uid() then raise exception 'Invalid boost' using errcode = '42501'; end if;
  new.status := 'pending';
  return new;
end $$;
drop trigger if exists zz_boosts_insert_guard on public.boosts;
create trigger zz_boosts_insert_guard before insert on public.boosts
for each row execute function public.zz_boosts_insert_guard();

do $$ begin
  drop policy if exists "hardening: staff change boosts" on public.boosts;
  create policy "hardening: staff change boosts" on public.boosts as restrictive for update
    using (public._role_rank(public._my_role()) >= 3) with check (public._role_rank(public._my_role()) >= 3);
exception when others then raise notice 'boosts policy: %', sqlerrm; end $$;

-- 3e. ONE safe, atomic server function replaces the step-by-step browser logic
--     (also fixes double-crediting when two clicks / two admins confirm the same payment)
create or replace function public.admin_confirm_payment(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p record; b record; u record; nowts timestamptz := now(); exp timestamptz; coins int; bal_before int; bal_after int; msg text;
begin
  if auth.uid() is null or public._role_rank(public._my_role()) < 3 then
    raise exception 'Only administrators can confirm payments' using errcode = '42501';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'This payment was already processed'; end if;
  if not coalesce(public._payment_price_ok(p.payment_type, p.plan, p.boost_days, p.coins_amount, p.amount_kes), false) then
    raise exception 'Payment details do not match the price list. Reject it or check with the user.';
  end if;

  if p.payment_type = 'subscription' then
    exp := nowts + interval '1 month';
    update public.users set subscription_plan = p.plan, subscription_expires_at = exp,
           is_verified = case when p.plan in ('creator', 'business') then true else is_verified end,
           verified_at = case when p.plan in ('creator', 'business') then nowts else verified_at end,
           is_business = case when p.plan = 'business' then true else is_business end
     where id = p.user_id;
    update public.payments set service_expires_at = exp where id = p.id;
    msg := 'Your ' || initcap(p.plan) || ' subscription is now active. It runs until ' || to_char(exp, 'FMDD FMMonth YYYY') || '.';

  elsif p.payment_type = 'boost' then
    exp := nowts + make_interval(days => coalesce(p.boost_days, 1));
    select * into b from public.boosts where payment_id = p.id limit 1 for update;
    if found then
      if not exists (select 1 from public.posts where id = b.post_id and user_id = p.user_id) then
        raise exception 'The boosted post does not belong to the payer';
      end if;
      update public.boosts set status = 'active', starts_at = nowts, expires_at = exp where id = b.id;
      update public.posts set is_boosted = true, boost_expires_at = exp where id = b.post_id;
    end if;
    msg := 'Your post boost is live for ' || coalesce(p.boost_days, 1) || ' day(s).';

  elsif p.payment_type = 'coins' then
    coins := coalesce(p.coins_amount, 0);
    select coins_balance into bal_before from public.users where id = p.user_id for update;
    bal_before := coalesce(bal_before, 0);
    bal_after := bal_before + coins;
    update public.users set coins_balance = bal_after where id = p.user_id;
    insert into public.coin_transactions (user_id, amount, transaction_type, payment_id, description, balance_before, balance_after)
    values (p.user_id, coins, 'purchase', p.id, 'Purchased ' || coins || ' B-Link Coins', bal_before, bal_after);
    msg := coins || ' coins were added to your wallet. New balance: ' || bal_after || ' coins.';

  elsif p.payment_type = 'verification' then
    update public.users set is_verified = true, verified_at = nowts where id = p.user_id;
    msg := 'Your account is verified. The badge is now live on your profile.';

  elsif p.payment_type = 'business_page' then
    exp := nowts + interval '1 month';
    update public.users set is_business = true, is_verified = true, verified_at = nowts,
           subscription_plan = 'business', subscription_expires_at = exp where id = p.user_id;
    msg := 'Your Business Page is active. Add your contact details in your profile settings.';
  end if;

  update public.payments set status = 'confirmed', service_active = true, service_activated_at = nowts,
         verified_by = auth.uid(), verified_at = nowts where id = p.id;

  if msg is not null then
    insert into public.notifications (user_id, from_user_id, type, message, is_read) values (p.user_id, auth.uid(), 'admin_action', msg, false);
  end if;
  insert into public.admin_logs (admin_id, target_user_id, action, details)
  values (auth.uid(), p.user_id, 'confirm_payment', 'Confirmed ' || p.payment_type || ' - Ref ' || coalesce(p.reference_code, '') || ' - KES ' || p.amount_kes);

  return jsonb_build_object('ok', true, 'type', p.payment_type);
end $$;

create or replace function public.admin_reject_payment(p_payment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; why text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null or public._role_rank(public._my_role()) < 3 then
    raise exception 'Only administrators can reject payments' using errcode = '42501';
  end if;
  if char_length(why) < 3 then raise exception 'A rejection reason is required'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'This payment was already processed'; end if;

  update public.payments set status = 'rejected', rejection_reason = left(why, 300), verified_by = auth.uid(), verified_at = now() where id = p.id;
  insert into public.notifications (user_id, from_user_id, type, message, is_read)
  values (p.user_id, auth.uid(), 'admin_action', 'Your payment (Ref: ' || coalesce(p.reference_code, '') || ') was not verified: ' || left(why, 300) || '. Contact support if you believe this is an error.', false);
  insert into public.admin_logs (admin_id, target_user_id, action, details)
  values (auth.uid(), p.user_id, 'reject_payment', 'Rejected ' || coalesce(p.reference_code, '') || ' - ' || left(why, 200));
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.admin_confirm_payment(uuid) from public, anon;
revoke execute on function public.admin_reject_payment(uuid, text) from public, anon;
grant execute on function public.admin_confirm_payment(uuid) to authenticated, service_role;
grant execute on function public.admin_reject_payment(uuid, text) to authenticated, service_role;

-- 4. NOTIFICATIONS: nobody can pose as someone else or send official notices ------------------------
create or replace function public.zz_notifications_guard()
returns trigger language plpgsql as $$
declare recent int;
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) >= 3 then return new; end if;
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  new.from_user_id := auth.uid();                                  -- cannot impersonate
  if new.type in ('announcement', 'system') then raise exception 'Not allowed' using errcode = '42501'; end if;
  if new.type in ('admin_action', 'verification')                    -- only used to alert the admin team
     and not exists (select 1 from public.users where id = new.user_id and role in ('blink', 'admin', 'moderator')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select count(*) into recent from public.notifications where from_user_id = auth.uid() and created_at > now() - interval '1 minute';
  if recent >= 60 then raise exception 'Too many notifications' using errcode = '54000'; end if;
  if new.message is not null then new.message := left(new.message, 300); end if;
  return new;
end $$;
drop trigger if exists zz_notifications_guard on public.notifications;
create trigger zz_notifications_guard before insert on public.notifications
for each row execute function public.zz_notifications_guard();

-- 5. staff-only tables --------------------------------------------------------------------------------
create or replace function public.zz_staff_only_insert()
returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) < 3 then raise exception 'Not allowed' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists zz_staff_only_insert on public.admin_logs;
create trigger zz_staff_only_insert before insert on public.admin_logs for each row execute function public.zz_staff_only_insert();
do $$ begin
  drop trigger if exists zz_staff_only_insert on public.announcements;
  create trigger zz_staff_only_insert before insert on public.announcements for each row execute function public.zz_staff_only_insert();
exception when others then raise notice 'announcements guard: %', sqlerrm; end $$;

-- 6. PERFORMANCE ---------------------------------------------------------------------------------------
-- 6a. RLS: evaluate auth.uid() once per query instead of once per row (clears the advisor's warnings)
do $$
declare p record; q text; w text; stmt text; n int := 0;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual; w := p.with_check;
    if (q is not null and q ~* '(?<!select )auth\.(uid|role|jwt)\(\)') or (w is not null and w ~* '(?<!select )auth\.(uid|role|jwt)\(\)') then
      if q is not null then q := regexp_replace(q, '(?<!select )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi'); end if;
      if w is not null then w := regexp_replace(w, '(?<!select )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi'); end if;
      stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
              || case when q is not null then ' using (' || q || ')' else '' end
              || case when w is not null then ' with check (' || w || ')' else '' end;
      begin execute stmt; n := n + 1;
      exception when others then raise notice 'policy % on % skipped: %', p.policyname, p.tablename, sqlerrm; end;
    end if;
  end loop;
  raise notice 'RLS policies optimised: %', n;
end $$;

-- 6b. foreign keys without an index (slow joins and slow cascading deletes)
do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, c.conrelid as relid
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    begin
      execute format('create index if not exists %I on %s (%I)', 'idx_' || left(regexp_replace(r.tbl::text, '^public\.', ''), 28) || '_' || left(r.col::text, 26) || '_fk', r.tbl, r.col);
      n := n + 1;
    exception when others then raise notice 'index on %(%) skipped: %', r.tbl, r.col, sqlerrm; end;
  end loop;
  raise notice 'foreign-key indexes created: %', n;
end $$;
