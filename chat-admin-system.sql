-- =====================================================================
-- B-Link — chat + admin backend (safe to run more than once)
-- Run in: Supabase dashboard -> SQL Editor -> New query -> Run
-- Adds/repairs things only. Existing admin_* and chat functions are kept
-- (missing ones are created). Run follow-system.sql first if you have not.
-- =====================================================================

-- 0. Helpers -------------------------------------------------------------
create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

-- Caller must be at least p_min; target must exist, not be you, and rank below you.
create or replace function public._admin_guard(p_target uuid, p_min text)
returns void language plpgsql stable security definer set search_path = public as $$
declare me text; trole text;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  me := public._my_role();
  if public._role_rank(me) < public._role_rank(p_min) then
    raise exception 'Your role (%) cannot perform this action', coalesce(me, 'user') using errcode = '42501';
  end if;
  if p_target is not null then
    if p_target = auth.uid() then raise exception 'You cannot do this to your own account' using errcode = '42501'; end if;
    select role into trole from public.users where id = p_target;
    if not found then raise exception 'User not found'; end if;
    if public._role_rank(trole) >= public._role_rank(me) then
      raise exception 'You cannot act on an account with an equal or higher role' using errcode = '42501';
    end if;
  end if;
end $$;

-- 1. Presence ------------------------------------------------------------
create or replace function public.set_presence(p_online boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.users set last_seen = now(), is_online = coalesce(p_online, true) where id = auth.uid();
end $$;
grant execute on function public.set_presence(boolean) to authenticated;

create or replace function public.mark_stale_offline()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.users set is_online = false
   where is_online = true and (last_seen is null or last_seen < now() - interval '3 minutes');
  get diagnostics n = row_count;
  return n;
end $$;

-- everyone who was stuck "online" since sign-up is corrected now
do $$ begin
  perform public.mark_stale_offline();
exception when others then raise notice 'stale presence cleanup skipped: %', sqlerrm;
end $$;

-- 2. Messages: columns, indexes, guards ---------------------------------------
alter table public.messages add column if not exists forwarded  boolean not null default false;
alter table public.messages add column if not exists edited     boolean not null default false;
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists is_deleted boolean not null default false;
alter table public.messages add column if not exists is_pinned  boolean not null default false;

create index if not exists messages_chat_created_idx   on public.messages (chat_id, created_at desc);
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);

-- fast "search this chat" (ilike) — best effort, needs the pg_trgm extension
do $$ begin
  begin create extension if not exists pg_trgm with schema extensions; exception when others then null; end;
  begin
    execute 'create index if not exists messages_body_trgm_idx on public.messages using gin (body extensions.gin_trgm_ops)';
  exception when others then
    begin
      execute 'create index if not exists messages_body_trgm_idx on public.messages using gin (body gin_trgm_ops)';
    exception when others then raise notice 'search index skipped: %', sqlerrm; end;
  end;
end $$;

create or replace function public.zz_messages_insert_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare recent int;
begin
  if auth.uid() is not null then
    if new.sender_id is distinct from auth.uid() then
      raise exception 'You can only send messages as yourself' using errcode = '42501';
    end if;
    if exists (select 1 from public.users u
                where u.id = auth.uid()
                  and (u.is_banned = true or (u.suspended_until is not null and u.suspended_until > now()))) then
      raise exception 'Your account cannot send messages right now' using errcode = '42501';
    end if;
    select count(*) into recent from public.messages
     where sender_id = auth.uid() and created_at > now() - interval '10 seconds';
    if recent >= 25 then
      raise exception 'You are sending messages too quickly. Please wait a moment.' using errcode = '54000';
    end if;
  end if;
  if new.body is not null then new.body := left(new.body, 4000); end if;
  return new;
end $$;

drop trigger if exists zz_messages_insert_guard on public.messages;
create trigger zz_messages_insert_guard before insert on public.messages
for each row execute function public.zz_messages_insert_guard();

create or replace function public.zz_messages_update_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                       -- server jobs
  if public._role_rank(public._my_role()) >= 2 then return new; end if; -- staff moderation

  if new.sender_id is distinct from old.sender_id
     or new.chat_id is distinct from old.chat_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Message ownership cannot be changed' using errcode = '42501';
  end if;

  if new.body is distinct from old.body
     or new.media_url is distinct from old.media_url
     or new.message_type is distinct from old.message_type
     or new.is_deleted is distinct from old.is_deleted then
    if old.sender_id is distinct from auth.uid() then
      raise exception 'Only the sender can change a message' using errcode = '42501';
    end if;
    if new.body is distinct from old.body and coalesce(new.is_deleted, false) = false
       and now() - old.created_at > interval '15 minutes' then
      raise exception 'Messages can only be edited for 15 minutes' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists zz_messages_update_guard on public.messages;
create trigger zz_messages_update_guard before update on public.messages
for each row execute function public.zz_messages_update_guard();

-- 3. Scheduled messages ------------------------------------------------------
create table if not exists public.scheduled_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null,
  sender_id  uuid not null default auth.uid(),
  body       text not null check (char_length(body) between 1 and 2000),
  send_at    timestamptz not null,
  status     text not null default 'pending' check (status in ('pending','sent','cancelled','failed')),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists scheduled_due_idx on public.scheduled_messages (status, send_at);
alter table public.scheduled_messages enable row level security;
drop policy if exists "scheduled: owner can read" on public.scheduled_messages;
create policy "scheduled: owner can read" on public.scheduled_messages for select using (sender_id = auth.uid());
-- no insert/update/delete policies on purpose: everything goes through the functions below

create or replace function public.schedule_message(p_chat_id uuid, p_body text, p_send_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then raise exception 'Message is empty'; end if;
  if p_send_at < now() + interval '20 seconds' then raise exception 'Pick a time in the future'; end if;
  if p_send_at > now() + interval '90 days' then raise exception 'That is too far ahead'; end if;
  if not exists (select 1 from public.chats c where c.id = p_chat_id and auth.uid() = any (c.participants)) then
    raise exception 'You are not part of this chat' using errcode = '42501';
  end if;
  if (select count(*) from public.scheduled_messages where sender_id = auth.uid() and status = 'pending') >= 50 then
    raise exception 'You have too many scheduled messages';
  end if;
  insert into public.scheduled_messages (chat_id, sender_id, body, send_at)
  values (p_chat_id, auth.uid(), btrim(p_body), p_send_at) returning id into new_id;
  return new_id;
end $$;

create or replace function public.cancel_scheduled_message(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.scheduled_messages set status = 'cancelled'
   where id = p_id and sender_id = auth.uid() and status = 'pending';
end $$;

create or replace function public.deliver_due_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select * from public.scheduled_messages
     where status = 'pending' and send_at <= now()
       and (auth.uid() is null or sender_id = auth.uid())
     order by send_at limit 100
     for update skip locked
  loop
    begin
      insert into public.messages (chat_id, sender_id, body, message_type, delivered_at)
      values (r.chat_id, r.sender_id, r.body, 'text', now());
      update public.scheduled_messages set status = 'sent', sent_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.scheduled_messages set status = 'failed' where id = r.id;
    end;
  end loop;
  return n;
end $$;

grant execute on function public.schedule_message(uuid, text, timestamptz) to authenticated;
grant execute on function public.cancel_scheduled_message(uuid)            to authenticated;
grant execute on function public.deliver_due_messages()                    to authenticated;

-- run server-side too when pg_cron is available (otherwise the app does it)
do $$ begin
  begin create extension if not exists pg_cron; exception when others then null; end;
  begin
    perform cron.schedule('blink-deliver-scheduled', '* * * * *',   'select public.deliver_due_messages()');
    perform cron.schedule('blink-stale-presence',    '*/3 * * * *', 'select public.mark_stale_offline()');
  exception when others then raise notice 'pg_cron not available; the app delivers scheduled messages instead';
  end;
end $$;

-- 4. Admin: complete account removal --------------------------------------------
create table if not exists public.deleted_accounts_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  username     text,
  display_name text,
  role         text,
  deleted_by   uuid,
  reason       text,
  summary      jsonb,
  deleted_at   timestamptz not null default now()
);
alter table public.deleted_accounts_log enable row level security;
drop policy if exists "deleted log: staff read" on public.deleted_accounts_log;
create policy "deleted log: staff read" on public.deleted_accounts_log
  for select using (public._role_rank(public._my_role()) >= 3);

-- Deletes the rows p_ids of p_table AND everything that points at them,
-- following every foreign key (whatever its ON DELETE rule is).
create or replace function public._cascade_delete(
  p_table regclass, p_pk text, p_ids text[], p_depth int default 0, p_counts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fk record;
  child_pk text;
  child_ids text[];
  pk_type text;
  del bigint;
  counts jsonb := p_counts;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or p_depth > 8 then return counts; end if;

  for fk in
    select c.conrelid::regclass::text as child_table,
           ca.attname::text           as child_col,
           format_type(pa.atttypid, pa.atttypmod) as ptype
      from pg_constraint c
      join pg_attribute ca on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
     where c.contype = 'f'
       and c.confrelid = p_table
       and array_length(c.conkey, 1) = 1
       and pa.attname = p_pk
  loop
    -- keep the audit trail: detach instead of deleting
    if fk.child_table in ('admin_logs', 'public.admin_logs', 'deleted_accounts_log', 'public.deleted_accounts_log') then
      begin
        execute format('update %s set %I = null where %I = any($1::%s[])', fk.child_table, fk.child_col, fk.child_col, fk.ptype) using p_ids;
        continue;
      exception when others then null;
      end;
    end if;

    child_pk := null;
    select a.attname::text into child_pk
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
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

-- ONE call: removes the account from the database, the login system and
-- (through realtime) from every open app. Owner (B-Link role) only.
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
       and c.table_name not in ('users','admin_logs','deleted_accounts_log')
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

grant execute on function public.admin_purge_user(uuid, text) to authenticated;

-- 5. Admin: fill in any moderation function the app calls but the database lacks
do $do$
begin
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_ban_user') then
    execute $f$
      create function public.admin_ban_user(p_target_id uuid, p_reason text default null)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'blink');
        update public.users set is_banned = true, ban_reason = coalesce(p_reason, 'No reason provided') where id = p_target_id;
        begin delete from auth.sessions where user_id = p_target_id; exception when others then null; end;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_unban_user') then
    execute $f$
      create function public.admin_unban_user(p_target_id uuid)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'blink');
        update public.users set is_banned = false, ban_reason = null where id = p_target_id;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_restrict_user') then
    execute $f$
      create function public.admin_restrict_user(p_target_id uuid, p_reason text default null)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'admin');
        update public.users set is_restricted = true, restriction_reason = coalesce(p_reason, 'No reason provided') where id = p_target_id;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_unrestrict_user') then
    execute $f$
      create function public.admin_unrestrict_user(p_target_id uuid)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'admin');
        update public.users set is_restricted = false, restriction_reason = null where id = p_target_id;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_suspend_user') then
    execute $f$
      create function public.admin_suspend_user(p_target_id uuid, p_days int default 7, p_reason text default null)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'admin');
        update public.users set suspended_until = now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 365))) where id = p_target_id;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_unsuspend_user') then
    execute $f$
      create function public.admin_unsuspend_user(p_target_id uuid)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'admin');
        update public.users set suspended_until = null where id = p_target_id;
      end $b$ $f$;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_change_role') then
    execute $f$
      create function public.admin_change_role(p_target_id uuid, p_new_role text)
      returns void language plpgsql security definer set search_path = public as $b$
      begin
        perform public._admin_guard(p_target_id, 'blink');
        if p_new_role not in ('user', 'moderator', 'admin') then raise exception 'Invalid role'; end if;
        update public.users set role = p_new_role where id = p_target_id;
      end $b$ $f$;
  end if;
end
$do$;

-- 6. Admin: "is everything installed?" check (used by the shield button) -------
create or replace function public.admin_system_check()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fns text[] := array[
    'admin_warn_user','admin_restrict_user','admin_unrestrict_user','admin_suspend_user','admin_unsuspend_user',
    'admin_ban_user','admin_unban_user','admin_change_role','admin_delete_user','admin_purge_user',
    'admin_moderate_content','admin_resolve_report','admin_delete_warning',
    'get_my_chats','get_chat_info','get_or_create_chat','delete_message_for_me','delete_message_for_all',
    'delete_chat','clear_chat_for_me','toggle_chat_mute','block_user','report_user',
    'toggle_follow','remove_follower','get_profile_stats','set_presence',
    'schedule_message','cancel_scheduled_message','deliver_due_messages'];
  tbls text[] := array['messages','message_reactions','chats','scheduled_messages','reports','warnings','admin_logs'];
  n text; ok text[] := '{}'; missing text[] := '{}';
begin
  if public._role_rank(public._my_role()) < 2 then raise exception 'Staff only' using errcode = '42501'; end if;
  foreach n in array fns loop
    if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = n)
      then ok := ok || n; else missing := missing || n; end if;
  end loop;
  foreach n in array tbls loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = n)
      then ok := ok || ('table ' || n); else missing := missing || ('table ' || n); end if;
  end loop;
  return jsonb_build_object('ok', to_jsonb(ok), 'missing', to_jsonb(missing));
end $$;

grant execute on function public.admin_system_check() to authenticated;

-- 7. Live updates for chat features -------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.messages;           exception when others then null; end;
  begin alter publication supabase_realtime add table public.message_reactions;  exception when others then null; end;
  begin alter publication supabase_realtime add table public.reports;            exception when others then null; end;
  begin alter publication supabase_realtime add table public.users;              exception when others then null; end;
end $$;
alter table public.message_reactions replica identity full;
