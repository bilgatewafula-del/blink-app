-- =====================================================================
-- B-Link — security hardening, round 2 (from your audit results)
-- Additive and safe to run more than once. Deletes no data, tables or columns.
-- Each step is wrapped: if one cannot apply, it prints a note and the rest continue.
-- =====================================================================

-- 1. Signed-out visitors get NO direct table access at all -------------------------------------
-- (the app never reads or writes tables before sign-in; the username check at sign-up is a function)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    begin execute format('revoke all on public.%I from anon', t.tablename);
    exception when others then raise notice 'anon revoke on % failed: %', t.tablename, sqlerrm; end;
  end loop;
  begin revoke all on all sequences in schema public from anon; exception when others then null; end;
  begin alter default privileges in schema public revoke all on tables from anon; exception when others then null; end;
  begin alter default privileges in schema public revoke all on sequences from anon; exception when others then null; end;
end $$;

-- 2. Policies that let the wrong people write ---------------------------------------------------------
-- 2a. notifications: signed-in only (it was open to everyone, including signed-out visitors)
do $$ begin
  drop policy if exists system_insert_notifications on public.notifications;
  drop policy if exists notifications_insert_signed_in on public.notifications;
  create policy notifications_insert_signed_in on public.notifications for insert to authenticated
    with check ((select auth.uid()) is not null
                and (from_user_id = (select auth.uid()) or public._role_rank(public._my_role()) >= 3));
exception when others then raise notice 'notifications policy: %', sqlerrm; end $$;

-- 2b. analytics and stickers were open to everyone
do $$ begin
  drop policy if exists "Anyone can insert media analytics" on public.media_analytics;
  drop policy if exists media_analytics_insert_signed_in on public.media_analytics;
  create policy media_analytics_insert_signed_in on public.media_analytics for insert to authenticated
    with check ((select auth.uid()) is not null);
exception when others then raise notice 'media_analytics policy: %', sqlerrm; end $$;

do $$ begin
  drop policy if exists "Anyone can insert stickers" on public.stickers;
  drop policy if exists stickers_insert_staff on public.stickers;
  create policy stickers_insert_staff on public.stickers for insert to authenticated
    with check (public._role_rank(public._my_role()) >= 3);
exception when others then raise notice 'stickers policy: %', sqlerrm; end $$;

-- 2c. profiles are created by the server only; coin records only by administrators
do $$ begin
  drop policy if exists "Users can insert own profile" on public.users;
  drop policy if exists users_insert_own on public.users;
  drop policy if exists coin_tx_insert on public.coin_transactions;
  drop policy if exists coin_tx_insert_admin on public.coin_transactions;      -- administrators keep access through "admins_coin_tx"
exception when others then raise notice 'policy clean-up: %', sqlerrm; end $$;

-- 2d. comment deletion: "user_or_blink_can_delete_comments" already covers "own comment"
do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'user_or_blink_can_delete_comments') then
    drop policy if exists comments_delete_own on public.comments;
  end if;
exception when others then raise notice 'comments policy: %', sqlerrm; end $$;

-- 3. Remove policies that are exact copies of another policy (no behaviour change) ----------------------------
do $$
declare g record; i int; n int := 0;
begin
  for g in
    select schemaname, tablename, cmd, roles::text as r, coalesce(qual, '') as q, coalesce(with_check, '') as w,
           array_agg(policyname order by policyname) as names
      from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
     group by schemaname, tablename, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')
    having count(*) > 1
  loop
    for i in 2..array_length(g.names, 1) loop
      begin
        execute format('drop policy %I on %I.%I', g.names[i], g.schemaname, g.tablename);
        n := n + 1;
      exception when others then raise notice 'could not drop duplicate policy %: %', g.names[i], sqlerrm; end;
    end loop;
  end loop;
  raise notice 'duplicate policies removed: %', n;
end $$;

-- 4. Remove duplicate indexes (never one that backs a constraint, always keeps one) --------------------------------
do $$
declare g record; j int; n int := 0; ix oid;
begin
  for g in
    select i.indrelid,
           array_agg(i.indexrelid order by exists (select 1 from pg_constraint c where c.conindid = i.indexrelid) desc,
                                           i.indisprimary desc, i.indexrelid) as idx
      from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and i.indisvalid
     group by i.indrelid, i.indkey::text, i.indclass::text, i.indisunique,
              coalesce(pg_get_expr(i.indpred, i.indrelid), ''), coalesce(pg_get_expr(i.indexprs, i.indrelid), '')
    having count(*) > 1
  loop
    for j in 2..array_length(g.idx, 1) loop
      ix := g.idx[j];
      if not exists (select 1 from pg_constraint where conindid = ix) then
        begin execute format('drop index %s', ix::regclass); n := n + 1;
        exception when others then raise notice 'could not drop index %: %', ix::regclass, sqlerrm; end;
      end if;
    end loop;
  end loop;
  raise notice 'duplicate indexes removed: %', n;
end $$;

-- 5. Old functions nobody should call any more -------------------------------------------------------------------
--    increment_post_shares: anyone could inflate any post's share count (replaced by record_post_share)
--    update_user_last_seen: anyone could set another person's "last seen" (replaced by set_presence)
do $$ begin
  revoke execute on function public.increment_post_shares(uuid) from public, anon, authenticated;
exception when others then raise notice 'increment_post_shares: %', sqlerrm; end $$;
do $$ begin
  revoke execute on function public.update_user_last_seen(uuid) from public, anon, authenticated;
exception when others then raise notice 'update_user_last_seen: %', sqlerrm; end $$;
