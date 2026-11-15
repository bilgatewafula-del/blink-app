-- =====================================================================
-- B-Link — FINAL FIXES 2 (from the 12 November audit and your instructions)
-- Safe to run more than once. Run after final-fixes.sql. Deletes no data.
-- The owner (B-Link role) and admins are NEVER restricted by anything below;
-- the only new rule is that a lower role cannot act on a higher one.
-- =====================================================================

create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

-- 1. STAFF CAN SEE PRIVATE ACCOUNT DETAILS WHEN MODERATING --------------------------------------------------
create or replace function public.admin_get_user_private(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public._role_rank(public._my_role()) < 2 then raise exception 'Staff only' using errcode = '42501'; end if;
  return (select jsonb_build_object(
      'email', u.email, 'phone', u.phone, 'phone_number', u.phone_number, 'date_of_birth', u.date_of_birth, 'gender', u.gender,
      'coins_balance', coalesce(u.coins_balance, 0), 'ban_reason', u.ban_reason, 'restriction_reason', u.restriction_reason,
      'subscription_plan', u.subscription_plan, 'subscription_expires_at', u.subscription_expires_at,
      'phone_verified', u.phone_verified, 'auth_provider', u.auth_provider, 'last_seen', u.last_seen, 'created_at', u.created_at,
      'login_email', (select a.email from auth.users a where a.id = u.id),
      'last_sign_in_at', (select a.last_sign_in_at from auth.users a where a.id = u.id),
      'email_confirmed', (select a.email_confirmed_at is not null from auth.users a where a.id = u.id))
    from public.users u where u.id = p_user_id);
end $$;
revoke execute on function public.admin_get_user_private(uuid) from public, anon;
grant execute on function public.admin_get_user_private(uuid) to authenticated, service_role;

-- 2. ROLE HIERARCHY: a lower role can never ban, suspend, restrict or re-role a higher one --------------------------
--    (the owner can act on anyone; nobody is restricted when editing their own account)
create or replace function public.zz_moderation_hierarchy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare me text;
begin
  if auth.uid() is null or auth.uid() = old.id then return new; end if;
  if new.is_banned is not distinct from old.is_banned and new.ban_reason is not distinct from old.ban_reason
     and new.is_restricted is not distinct from old.is_restricted and new.restriction_reason is not distinct from old.restriction_reason
     and new.suspended_until is not distinct from old.suspended_until and new.role is not distinct from old.role then
    return new;
  end if;
  me := public._my_role();
  if me = 'blink' then return new; end if;
  if public._role_rank(coalesce(old.role, 'user')) >= public._role_rank(coalesce(me, 'user')) then
    raise exception 'You cannot take this action on an account with an equal or higher role' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists zz_moderation_hierarchy_guard on public.users;
create trigger zz_moderation_hierarchy_guard before update on public.users
for each row execute function public.zz_moderation_hierarchy_guard();

-- 3. PAYMENTS ------------------------------------------------------------------------------------------------------
-- 3a. rejecting a payment used the status "rejected", which the table did not allow
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.payments'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%' and pg_get_constraintdef(oid) ilike '%pending%' loop
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;
  alter table public.payments add constraint payments_status_check
    check (status in ('pending', 'confirmed', 'failed', 'refunded', 'rejected'));
exception when others then raise notice 'payments status rule: %', sqlerrm; end $$;

-- 3b. only the five real payment kinds are accepted (unknown kinds used to pass)
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
    else false
  end
$$;

-- 3c. confirming an unsupported payment type now stops with a clear message instead of "confirming" it with no service
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

  else
    raise exception 'This payment type cannot be confirmed automatically: %', p.payment_type;
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
revoke execute on function public.admin_confirm_payment(uuid) from public, anon;
grant execute on function public.admin_confirm_payment(uuid) to authenticated, service_role;

-- 4. USERNAME CHECK: limited to 40 requests a minute per visitor address ---------------------------------------------
create table if not exists public.api_rate_limits (
  bucket text not null, window_start timestamptz not null, hits int not null default 0, primary key (bucket, window_start));
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated, public;

create or replace function public._rate_limit(p_bucket text, p_max int)
returns void language plpgsql security definer set search_path = public as $$
declare w timestamptz := date_trunc('minute', now()); n int;
begin
  insert into public.api_rate_limits (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = public.api_rate_limits.hits + 1
  returning hits into n;
  if n > p_max then raise exception 'Too many requests. Please slow down.' using errcode = '54000'; end if;
  if random() < 0.02 then delete from public.api_rate_limits where window_start < now() - interval '1 hour'; end if;
end $$;
revoke execute on function public._rate_limit(text, int) from public, anon, authenticated;

create or replace function public.username_available(p_username text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ip text; u text := lower(btrim(coalesce(p_username, '')));
begin
  begin ip := btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', 'unknown'), ',', 1));
  exception when others then ip := 'unknown'; end;
  perform public._rate_limit('ua:' || ip, 40);
  return public._valid_username(u) and not exists (select 1 from public.users x where lower(x.username) = u);
end $$;
grant execute on function public.username_available(text) to anon, authenticated, service_role;

-- 5. BLOCKING NOW REALLY BLOCKS ----------------------------------------------------------------------------------------
-- block_user() only removed follows; it never recorded the block (its own comment says so)
do $do$ begin
  execute $fn$
    create or replace function public.block_user(p_target_id uuid)
    returns void language plpgsql security definer set search_path = public as $b$
    begin
      if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
      if p_target_id = auth.uid() then raise exception 'Cannot block yourself'; end if;
      delete from public.follows
       where (follower_id = auth.uid() and following_id = p_target_id) or (follower_id = p_target_id and following_id = auth.uid());
      insert into public.blocks (blocker_id, blocked_id)
      select auth.uid(), p_target_id
       where not exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = p_target_id);
    end $b$ $fn$;
exception when others then raise notice 'block_user kept as it was: %', sqlerrm;
end $do$;

-- a block stops messages, new follows and comments in both directions
create or replace function public.zz_messages_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare other uuid; pref text;
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid() then return new; end if;
  if public._role_rank(public._my_role()) >= 2 then return new; end if;

  select p into other from public.chats c, unnest(c.participants) p where c.id = new.chat_id and p <> new.sender_id limit 1;
  if other is null then return new; end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = other and b.blocked_id = new.sender_id) or (b.blocker_id = new.sender_id and b.blocked_id = other)) then
    raise exception 'You cannot message this person' using errcode = '42501';
  end if;

  select who_can_message into pref from public.user_settings where user_id = other;
  if pref = 'nobody' then
    raise exception 'This person is not accepting messages' using errcode = '42501';
  elsif pref = 'followers' and not exists (select 1 from public.follows where follower_id = new.sender_id and following_id = other) then
    raise exception 'Only people who follow this account can message them' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.zz_follows_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pref text;
begin
  if auth.uid() is null or new.follower_id is distinct from auth.uid() then return new; end if;
  if exists (select 1 from public.blocks b where b.blocker_id = new.following_id and b.blocked_id = new.follower_id) then
    raise exception 'This account is not accepting new followers' using errcode = '42501';
  end if;
  select who_can_follow into pref from public.user_settings where user_id = new.following_id;
  if pref = 'nobody' then raise exception 'This account is not accepting new followers' using errcode = '42501'; end if;
  return new;
end $$;

create or replace function public.zz_comments_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; pref text;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then return new; end if;
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is null or owner_id = auth.uid() then return new; end if;
  if exists (select 1 from public.blocks b where b.blocker_id = owner_id and b.blocked_id = auth.uid()) then
    raise exception 'You cannot comment on this post' using errcode = '42501';
  end if;
  select who_can_comment into pref from public.user_settings where user_id = owner_id;
  if pref = 'nobody' then raise exception 'The author has turned off comments' using errcode = '42501';
  elsif pref = 'followers' and not exists (select 1 from public.follows where follower_id = auth.uid() and following_id = owner_id) then
    raise exception 'Only followers can comment on this account''s posts' using errcode = '42501';
  end if;
  return new;
end $$;

-- the old status functions had no "friends only" check (the app uses story_record_view / story_react instead)
do $$ begin revoke execute on function public.record_story_view(uuid) from public, anon, authenticated;
exception when others then raise notice 'record_story_view: %', sqlerrm; end $$;
do $$ begin revoke execute on function public.toggle_story_reaction(uuid, text) from public, anon, authenticated;
exception when others then raise notice 'toggle_story_reaction: %', sqlerrm; end $$;

-- 6. ONE POLICY PER ACTION (the remaining overlapping pairs) ------------------------------------------------------------
do $$ begin
  drop policy if exists admins_delete_any_comment on public.comments;
  drop policy if exists user_or_blink_can_delete_comments on public.comments;
  drop policy if exists comments_delete_author_or_staff on public.comments;
  create policy comments_delete_author_or_staff on public.comments for delete to authenticated
    using (user_id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 2);

  drop policy if exists admins_update_any_comment on public.comments;
  drop policy if exists comments_update_own on public.comments;
  drop policy if exists comments_update_author_or_staff on public.comments;
  create policy comments_update_author_or_staff on public.comments for update to authenticated
    using (user_id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 2)
    with check (user_id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 2);

  drop policy if exists admins_delete_any_post on public.posts;
  drop policy if exists posts_delete_own on public.posts;
  drop policy if exists posts_delete_owner_or_staff on public.posts;
  create policy posts_delete_owner_or_staff on public.posts for delete to authenticated
    using (user_id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 2);

  drop policy if exists admins_update_any_user on public.users;
  drop policy if exists users_update_own on public.users;
  drop policy if exists users_update_self_or_admin on public.users;
  create policy users_update_self_or_admin on public.users for update to authenticated
    using (id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 3)
    with check (id = (select auth.uid()) or (select public._role_rank(public._my_role())) >= 3);
exception when others then raise notice 'policy consolidation: %', sqlerrm; end $$;

notify pgrst, 'reload schema';
