-- =====================================================================
-- B-Link — FINAL FIXES (one script, built from your two audit reports)
-- Safe to run more than once. Deletes no user data or financial records.
-- ORDER: 1) deploy the new app version FIRST, 2) then run this script.
-- Every step is wrapped: if one cannot apply it prints a notice and the rest continue.
-- =====================================================================

create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

-- 1. Internal helper that anyone could call to write admin-log entries and send "official" notices -----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = '_admin_log_and_notify' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
exception when others then raise notice '_admin_log_and_notify: %', sqlerrm; end $$;

-- 2. The old sign-up trigger made a profile for every sign-up (verified or not, unchecked username).
--    It is replaced by the verified-account trigger from auth-system.sql, so it is removed.
do $$ begin
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_confirmed')
     and exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created') then
    drop trigger if exists trg_handle_new_auth_user on auth.users;
    begin revoke execute on function public.handle_new_auth_user() from public, anon, authenticated; exception when others then null; end;
  else
    raise notice 'sign-up trigger kept: run auth-system.sql first, then run this script again';
  end if;
exception when others then raise notice 'sign-up trigger: %', sqlerrm; end $$;

-- 3. PRIVATE PROFILE DETAILS ----------------------------------------------------------------------------------
create or replace function public.get_my_private_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
      'email', u.email, 'phone', u.phone, 'phone_number', u.phone_number, 'date_of_birth', u.date_of_birth, 'gender', u.gender,
      'coins_balance', coalesce(u.coins_balance, 0), 'ban_reason', u.ban_reason, 'restriction_reason', u.restriction_reason,
      'subscription_expires_at', u.subscription_expires_at, 'phone_verified', u.phone_verified,
      'posts_today', u.posts_today, 'posts_today_date', u.posts_today_date,
      'username_changed_at', u.username_changed_at, 'display_name_changed_at', u.display_name_changed_at)
    from public.users u where u.id = auth.uid()), '{}'::jsonb)
$$;

create or replace function public.admin_user_reasons()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public._role_rank(public._my_role()) < 2 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ban_reason', ban_reason, 'restriction_reason', restriction_reason)), '[]'::jsonb)
            from public.users where ban_reason is not null or restriction_reason is not null);
end $$;

revoke execute on function public.get_my_private_profile() from public, anon;
revoke execute on function public.admin_user_reasons() from public, anon;
grant execute on function public.get_my_private_profile() to authenticated, service_role;
grant execute on function public.admin_user_reasons() to authenticated, service_role;

-- 3b. live updates of the profile table no longer carry private columns
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users') then
    alter publication supabase_realtime drop table public.users;
  end if;
  alter publication supabase_realtime add table public.users
    (id, username, display_name, avatar_url, is_verified, last_seen, is_online, role, is_banned, is_restricted,
     followers_count, following_count, posts_count, friends_count);
exception when others then raise notice 'realtime column list: %', sqlerrm; end $$;

-- 3c. other signed-in users can read only the public columns of a profile
--     (email, phone, birthday, gender, coin balance, ban reasons... are owner-only through get_my_private_profile)
do $$
declare cols text;
  priv text[] := array['email', 'phone', 'phone_number', 'date_of_birth', 'gender', 'coins_balance', 'ban_reason', 'restriction_reason',
                       'subscription_expires_at', 'phone_verified', 'auth_provider', 'posts_today', 'posts_today_date',
                       'username_changed_at', 'display_name_changed_at'];
begin
  if to_regprocedure('public.get_my_private_profile()') is null then raise notice 'column privileges skipped'; return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name <> all (priv);
  revoke select on public.users from authenticated;
  execute format('grant select (%s) on public.users to authenticated', cols);
exception when others then raise notice 'users column privileges not applied: %', sqlerrm; end $$;

-- 4. POSTS: the "true" policy defeated every audience rule -------------------------------------------------------
do $$ begin
  drop policy if exists "Anyone can view public posts" on public.posts;
  drop policy if exists posts_select_public on public.posts;
  create policy posts_select_public on public.posts for select to authenticated using (
    (coalesce(is_draft, false) = false or user_id = (select auth.uid()) or public._role_rank(public._my_role()) >= 2)
    and (
      coalesce(audience, 'public') = 'public'
      or user_id = (select auth.uid())
      or public._role_rank(public._my_role()) >= 2
      or (audience = 'followers' and exists (select 1 from public.follows f where f.follower_id = (select auth.uid()) and f.following_id = posts.user_id))
      or (audience = 'close_friends' and public.are_friends((select auth.uid()), posts.user_id))
    ));
exception when others then raise notice 'posts policy: %', sqlerrm; end $$;

-- comments and likes follow the visibility of their post
do $$ begin
  drop policy if exists "Anyone can view comments" on public.comments;
  drop policy if exists comments_select_all on public.comments;
  drop policy if exists comments_select_visible on public.comments;
  create policy comments_select_visible on public.comments for select to authenticated
    using (exists (select 1 from public.posts p where p.id = comments.post_id));
  drop policy if exists "Anyone can view likes" on public.likes;
  drop policy if exists likes_select on public.likes;
  drop policy if exists likes_select_visible on public.likes;
  create policy likes_select_visible on public.likes for select to authenticated
    using (exists (select 1 from public.posts p where p.id = likes.post_id));
exception when others then raise notice 'comments/likes policies: %', sqlerrm; end $$;

-- 5. OVERLAPPING / TOO-WEAK POLICIES (each one verified against the definitions in your audit) --------------------
do $$ begin
  -- anyone could put a message into ANY chat: this policy only checked "sender = me", not "member of the chat"
  drop policy if exists "Users can send messages" on public.messages;
  -- same rule as the stricter "participant" policies that stay
  drop policy if exists "Chat participants can view messages" on public.messages;
  drop policy if exists "Users can view own messages" on public.messages;
  drop policy if exists "Users can update messages" on public.messages;
  drop policy if exists "Users can update own messages" on public.messages;
  drop policy if exists "Users can create chats" on public.chats;
  drop policy if exists "Participants can view chats" on public.chats;
  drop policy if exists "Users can unfollow" on public.follows;                 -- covered by follows_delete
  drop policy if exists "Anyone can view follows" on public.follows;            -- follows_select (signed-in) stays
  drop policy if exists notifs_select_own on public.notifications;
  drop policy if exists admins_update_any_post on public.posts;                 -- covered by posts_update_own (owner or staff)
  drop policy if exists "Users can view own reports" on public.reports;         -- covered by reports_select
  drop policy if exists "Anyone can view profiles" on public.users;             -- users_select_all (signed-in) stays
  drop policy if exists admin_logs_select on public.admin_logs;                 -- covered by admin_logs_select_staff
exception when others then raise notice 'policy clean-up: %', sqlerrm; end $$;

-- 6. VIEWS: signed-out visitors could read them (and they bypassed row security) ------------------------------------------
do $$
declare v record; nm text;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    begin execute format('revoke all on public.%I from anon, public', v.viewname); exception when others then null; end;
  end loop;
  foreach nm in array array['revenue_summary', 'trending_posts'] loop
    begin
      execute format('alter view public.%I set (security_invoker = true)', nm);
      execute format('revoke all on public.%I from authenticated', nm);       -- the app does not use these two views
    exception when others then raise notice 'view %: %', nm, sqlerrm; end;
  end loop;
end $$;

-- 7. PAYMENT / MODERATION RECORDS SURVIVE ACCOUNT DELETION ---------------------------------------------------------------
-- admin_logs is append-only, so a foreign key to users/posts made deleting any moderated account fail.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.admin_logs'::regclass and contype = 'f' loop
    execute format('alter table public.admin_logs drop constraint %I', c.conname);
  end loop;
exception when others then raise notice 'admin_logs keys: %', sqlerrm; end $$;

create table if not exists public.financial_archive (
  id bigserial primary key, source text not null, user_id uuid, row_data jsonb not null, archived_at timestamptz not null default now());
alter table public.financial_archive enable row level security;       -- no policies: readable only by the owner / SQL

create or replace function public._archive_user_finance(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  begin insert into public.financial_archive (source, user_id, row_data) select 'payments', p_uid, to_jsonb(x) from public.payments x where x.user_id = p_uid; exception when others then null; end;
  begin insert into public.financial_archive (source, user_id, row_data) select 'coin_transactions', p_uid, to_jsonb(x) from public.coin_transactions x where x.user_id = p_uid; exception when others then null; end;
  begin insert into public.financial_archive (source, user_id, row_data) select 'boosts', p_uid, to_jsonb(x) from public.boosts x where x.user_id = p_uid; exception when others then null; end;
  begin insert into public.financial_archive (source, user_id, row_data) select 'tips', p_uid, to_jsonb(x) from public.tips x where x.from_user_id = p_uid or x.to_user_id = p_uid; exception when others then null; end;
end $$;
revoke execute on function public._archive_user_finance(uuid) from public, anon, authenticated;

create or replace function public._cascade_delete(
  p_table regclass, p_pk text, p_ids text[], p_depth int default 0, p_counts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fk record; child_pk text; child_ids text[]; pk_type text; del bigint; counts jsonb := p_counts;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or p_depth > 8 then return counts; end if;

  for fk in
    select c.conrelid::regclass::text as child_table, ca.attname::text as child_col,
           format_type(pa.atttypid, pa.atttypmod) as ptype, not ca.attnotnull as nullable
      from pg_constraint c
      join pg_attribute ca on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = p_table and array_length(c.conkey, 1) = 1 and pa.attname = p_pk
  loop
    -- records that only POINT at the deleted account (who verified a payment, who issued a warning, who resolved a
    -- ticket, who sent a notification...) belong to other people: keep them and just remove the link
    if p_table = 'public.users'::regclass and fk.nullable
       and fk.child_col not in ('user_id', 'follower_id', 'following_id', 'sender_id', 'viewer_id', 'reporter_id', 'blocker_id',
                                'blocked_id', 'muter_id', 'muted_id', 'author_id', 'recipient_id') then
      begin
        execute format('update %s set %I = null where %I = any($1::%s[])', fk.child_table, fk.child_col, fk.child_col, fk.ptype) using p_ids;
        continue;
      exception when others then null;
      end;
    end if;

    child_pk := null;
    select a.attname::text into child_pk
      from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = fk.child_table::regclass and i.indisprimary and i.indnatts = 1;

    if child_pk is not null then
      execute format('select array_agg(%I::text) from %s where %I = any($1::%s[])', child_pk, fk.child_table, fk.child_col, fk.ptype)
        into child_ids using p_ids;
      if fk.child_table::regclass = p_table then
        child_ids := array(select x from unnest(child_ids) x where x <> all (p_ids));
      end if;
      if child_ids is not null and coalesce(array_length(child_ids, 1), 0) > 0 then
        counts := public._cascade_delete(fk.child_table::regclass, child_pk, child_ids, p_depth + 1, counts);
      end if;
    else
      execute format('delete from %s where %I = any($1::%s[])', fk.child_table, fk.child_col, fk.ptype) using p_ids;
      get diagnostics del = row_count;
      counts := jsonb_set(counts, array[fk.child_table], to_jsonb(coalesce((counts ->> fk.child_table)::bigint, 0) + del));
    end if;
  end loop;

  select format_type(atttypid, atttypmod) into pk_type from pg_attribute where attrelid = p_table and attname = p_pk;
  execute format('delete from %s where %I = any($1::%s[])', p_table::text, p_pk, pk_type) using p_ids;
  get diagnostics del = row_count;
  counts := jsonb_set(counts, array[p_table::text], to_jsonb(coalesce((counts ->> p_table::text)::bigint, 0) + del));
  return counts;
end $$;
revoke execute on function public._cascade_delete(regclass, text, text[], integer, jsonb) from public, anon, authenticated;

create or replace function public.admin_purge_user(p_target_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  trole text; tname text; tdisp text;
  counts jsonb := '{}'::jsonb;
  chat_ids text[];
  t record; del bigint; sweep jsonb := '{}'::jsonb;
  auth_removed boolean := false;
  pay_rows bigint := 0;
begin
  perform public._admin_guard(p_target_id, 'blink');
  select role, username, display_name into trole, tname, tdisp from public.users where id = p_target_id;
  if trole = 'blink' then raise exception 'B-Link accounts cannot be deleted'; end if;
  perform public._archive_user_finance(p_target_id);

  begin execute 'select count(*) from public.payments where user_id = $1' into pay_rows using p_target_id;
  exception when others then pay_rows := 0; end;

  -- 1) chats are linked through an array, so collect them first
  begin
    select array_agg(id::text) into chat_ids from public.chats where p_target_id = any (participants);
    if chat_ids is not null then
      counts := public._cascade_delete('public.chats'::regclass, 'id', chat_ids, 0, counts);
    end if;
  exception when others then null; end;

  -- 2) the account and everything that references it through a foreign key
  counts := public._cascade_delete('public.users'::regclass, 'id', array[p_target_id::text], 0, counts);

  -- 3) anything left that points at this user by column name (no foreign key)
  for t in
    select c.table_name::text as tbl, c.column_name::text as col
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type = 'uuid'
       and c.column_name in ('user_id','author_id','sender_id','follower_id','following_id','from_user_id',
                             'to_user_id','recipient_id','reporter_id','blocker_id','blocked_id','target_user_id')
       and c.table_name not in ('users','admin_logs','deleted_accounts_log','financial_archive')
  loop
    begin
      execute format('delete from public.%I where %I = $1', t.tbl, t.col) using p_target_id;
      get diagnostics del = row_count;
      if del > 0 then sweep := jsonb_set(sweep, array[t.tbl], to_jsonb(coalesce((sweep ->> t.tbl)::bigint, 0) + del)); end if;
    exception when others then null;
    end;
  end loop;

  -- 4) the login itself (sessions and tokens go with it)
  begin
    delete from auth.users where id = p_target_id;
    auth_removed := true;
  exception when others then
    auth_removed := false;
  end;

  insert into public.deleted_accounts_log (user_id, username, display_name, role, deleted_by, reason, summary)
  values (p_target_id, tname, tdisp, trole, auth.uid(), p_reason,
          jsonb_build_object('deleted_rows', counts, 'extra_rows', sweep, 'payment_rows_removed', pay_rows, 'login_removed', auth_removed));

  begin
    insert into public.admin_logs (admin_id, target_user_id, action, reason)
    values (auth.uid(), null, 'delete_account', coalesce(p_reason, 'No reason provided') || ' (@' || coalesce(tname, '?') || ')');
  exception when others then null; end;

  return jsonb_build_object('deleted', true, 'login_removed', auth_removed, 'rows', counts, 'extra', sweep);
end $$;

create or replace function public.delete_my_account()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); trole text; tname text; tdisp text;
  counts jsonb := '{}'::jsonb; sweep jsonb := '{}'::jsonb; chat_ids text[]; t record; del bigint; auth_removed boolean := false;
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if to_regprocedure('public._cascade_delete(regclass,text,text[],integer,jsonb)') is null then
    raise exception 'Account deletion is not set up yet (run chat-admin-system.sql first)';
  end if;
  select role, username, display_name into trole, tname, tdisp from public.users where id = uid;
  if trole = 'blink' then raise exception 'The owner account cannot be deleted from here'; end if;
  perform public._archive_user_finance(uid);

  begin
    select array_agg(id::text) into chat_ids from public.chats where uid = any (participants);
    if chat_ids is not null then counts := public._cascade_delete('public.chats'::regclass, 'id', chat_ids, 0, counts); end if;
  exception when others then null; end;

  counts := public._cascade_delete('public.users'::regclass, 'id', array[uid::text], 0, counts);

  for t in
    select c.table_name::text as tbl, c.column_name::text as col
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.data_type = 'uuid'
       and c.column_name in ('user_id','author_id','sender_id','follower_id','following_id','from_user_id','to_user_id','recipient_id','reporter_id','blocker_id','blocked_id','target_user_id')
       and c.table_name not in ('users', 'admin_logs', 'deleted_accounts_log', 'financial_archive')
  loop
    begin
      execute format('delete from public.%I where %I = $1', t.tbl, t.col) using uid;
      get diagnostics del = row_count;
      if del > 0 then sweep := jsonb_set(sweep, array[t.tbl], to_jsonb(coalesce((sweep ->> t.tbl)::bigint, 0) + del)); end if;
    exception when others then null; end;
  end loop;

  begin delete from auth.users where id = uid; auth_removed := true; exception when others then auth_removed := false; end;

  begin
    insert into public.deleted_accounts_log (user_id, username, display_name, role, deleted_by, reason, summary)
    values (uid, tname, tdisp, trole, uid, 'Deleted by the account owner', jsonb_build_object('rows', counts, 'extra', sweep, 'login_removed', auth_removed));
  exception when others then null; end;

  return jsonb_build_object('deleted', true, 'login_removed', auth_removed);
end $$;

grant execute on function public.admin_purge_user(uuid, text) to authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated, service_role;
revoke execute on function public.admin_purge_user(uuid, text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

-- 8. COMMENTS: only the author (or a moderator) can delete a comment ----------------------------------------------------
create or replace function public.delete_own_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select id, user_id into c from public.comments where id = p_comment_id and coalesce(status, 'active') <> 'deleted';
  if not found then return; end if;
  if c.user_id <> auth.uid() and public._role_rank(public._my_role()) < 2 then
    raise exception 'You can only delete your own comments' using errcode = '42501';
  end if;
  update public.comments set status = 'deleted' where id = c.id or parent_id = c.id;
end $$;
revoke execute on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated, service_role;
-- the older function also let the post owner delete other people's comments; the app no longer uses it
do $$ begin
  revoke execute on function public.delete_post_comment(uuid) from public, anon, authenticated;
exception when others then raise notice 'delete_post_comment: %', sqlerrm; end $$;

-- 9. SAVING POSTS: the old function referenced saved_posts.collection, a column that does not exist ---------------------------
do $$ begin
  alter table public.saved_posts add column if not exists collection text;
exception when others then raise notice 'saved_posts.collection: %', sqlerrm; end $$;

do $do$ begin
  execute $fn$
    create or replace function public.toggle_post_save(p_post_id uuid)
    returns boolean language plpgsql security definer set search_path = public as $b$
    declare had boolean;
    begin
      if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
      select exists (select 1 from public.saved_posts where post_id = p_post_id and user_id = auth.uid()) into had;
      if had then
        delete from public.saved_posts where post_id = p_post_id and user_id = auth.uid();
        return false;
      end if;
      insert into public.saved_posts (post_id, user_id) values (p_post_id, auth.uid()) on conflict do nothing;
      return true;
    end $b$ $fn$;
  revoke execute on function public.toggle_post_save(uuid) from public, anon;
  grant execute on function public.toggle_post_save(uuid) to authenticated, service_role;
exception when others then raise notice 'toggle_post_save kept as it was (the app falls back to the table): %', sqlerrm;
end $do$;

-- 10. Tables with row security but no policy: say so explicitly (server-only tables) -----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['auth_policy', 'blocked_email_domains', 'post_shares', 'post_views', 'story_replies', 'user_activity', 'financial_archive'] loop
    if to_regclass('public.' || t) is not null and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      begin execute format('create policy "server only" on public.%I for all to authenticated using (false) with check (false)', t);
      exception when others then null; end;
    end if;
  end loop;
end $$;

-- 11. The last three duplicate indexes (each pair is the same unique rule twice) ------------------------------------------------
do $$
declare r record; idx oid;
begin
  for r in select * from (values ('users', 'users_username_unique'), ('likes', 'likes_post_user_unique'), ('follows', 'follows_unique')) v(tbl, nm) loop
    begin
      select i.indexrelid into idx from pg_index i where i.indexrelid = ('public.' || r.nm)::regclass;
      if exists (select 1 from pg_constraint where conindid = idx and contype = 'f') then
        raise notice '% is referenced by a foreign key, kept', r.nm;
      elsif exists (select 1 from pg_constraint where conindid = idx and contype = 'u') then
        execute format('alter table public.%I drop constraint %I', r.tbl, r.nm);
      else
        execute format('drop index public.%I', r.nm);
      end if;
    exception when others then raise notice 'duplicate %: %', r.nm, sqlerrm; end;
  end loop;
end $$;

-- 12. Every function gets a fixed search path (the 35 warnings) ----------------------------------------------------------------
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    begin execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig); n := n + 1;
    exception when others then raise notice 'search_path for % skipped: %', f.sig, sqlerrm; end;
  end loop;
  raise notice 'functions with a fixed search path: %', n;
end $$;

-- 13. Make the API notice the changes
notify pgrst, 'reload schema';
