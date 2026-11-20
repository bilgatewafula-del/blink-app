-- =====================================================================
-- B-Link — settings, privacy enforcement, support requests, self-delete
-- Safe to run more than once. Run AFTER chat-admin-system.sql.
-- =====================================================================

-- 1. settings columns the app now relies on -------------------------------------------
do $$
declare c text;
begin
  foreach c in array array['who_can_message', 'who_can_comment', 'who_can_follow'] loop
    execute format('alter table public.user_settings add column if not exists %I text not null default %L', c, 'everyone');
  end loop;
  foreach c in array array['notif_likes', 'notif_comments', 'notif_followers', 'notif_messages', 'notif_mentions', 'notif_system',
                           'autoplay_videos'] loop
    execute format('alter table public.user_settings add column if not exists %I boolean not null default true', c);
  end loop;
  alter table public.user_settings add column if not exists data_saver boolean not null default false;
  alter table public.user_settings add column if not exists theme text not null default 'dark';
  alter table public.user_settings add column if not exists font_size text not null default 'medium';
  alter table public.user_settings add column if not exists video_quality text not null default 'auto';
  alter table public.user_settings add column if not exists image_quality text not null default 'high';
exception when others then raise notice 'user_settings columns: %', sqlerrm;
end $$;

-- only sensible values are accepted (the old "light" / "system" themes never worked)
update public.user_settings set theme = 'dark' where theme not in ('dark', 'amoled');
do $$ begin
  alter table public.user_settings drop constraint if exists user_settings_theme_check;
  alter table public.user_settings add constraint user_settings_theme_check check (theme in ('dark', 'amoled'));
  alter table public.user_settings drop constraint if exists user_settings_who_check;
  alter table public.user_settings add constraint user_settings_who_check
    check (who_can_message in ('everyone', 'followers', 'nobody') and who_can_comment in ('everyone', 'followers', 'nobody') and who_can_follow in ('everyone', 'nobody'));
exception when others then raise notice 'settings checks skipped: %', sqlerrm; end $$;

-- 2. "who can message me" is enforced by the database ---------------------------------------
create or replace function public.zz_messages_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare other uuid; pref text;
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid() then return new; end if;
  if public._role_rank(public._my_role()) >= 2 then return new; end if;

  select p into other from public.chats c, unnest(c.participants) p where c.id = new.chat_id and p <> new.sender_id limit 1;
  if other is null then return new; end if;

  select who_can_message into pref from public.user_settings where user_id = other;
  if pref = 'nobody' then
    raise exception 'This person is not accepting messages' using errcode = '42501';
  elsif pref = 'followers' and not exists (select 1 from public.follows where follower_id = new.sender_id and following_id = other) then
    raise exception 'Only people who follow this account can message them' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists zz_messages_privacy_guard on public.messages;
create trigger zz_messages_privacy_guard before insert on public.messages
for each row execute function public.zz_messages_privacy_guard();

-- 3. "who can follow me" -----------------------------------------------------------------------
create or replace function public.zz_follows_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare pref text;
begin
  if auth.uid() is null or new.follower_id is distinct from auth.uid() then return new; end if;
  select who_can_follow into pref from public.user_settings where user_id = new.following_id;
  if pref = 'nobody' then raise exception 'This account is not accepting new followers' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists zz_follows_privacy_guard on public.follows;
create trigger zz_follows_privacy_guard before insert on public.follows
for each row execute function public.zz_follows_privacy_guard();

-- 4. notification switches are honoured on the server too --------------------------------------
create or replace function public.zz_notifications_prefs()
returns trigger language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  select case
           when new.type in ('like', 'reaction')              then s.notif_likes
           when new.type in ('comment', 'reply')              then s.notif_comments
           when new.type in ('follow', 'follow_request')      then s.notif_followers
           when new.type = 'message'                          then s.notif_messages
           when new.type = 'mention'                          then s.notif_mentions
           when new.type in ('system', 'announcement')        then s.notif_system
           else true end
    into ok from public.user_settings s where s.user_id = new.user_id;
  if ok is false then return null; end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists zz_notifications_prefs on public.notifications;
create trigger zz_notifications_prefs before insert on public.notifications
for each row execute function public.zz_notifications_prefs();

-- 5. comments respect "who can comment" ----------------------------------------------------------
-- (patched into add_comment in posts-system.sql; this guard also covers direct inserts)
create or replace function public.zz_comments_privacy_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; pref text;
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then return new; end if;
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is null or owner_id = auth.uid() then return new; end if;
  select who_can_comment into pref from public.user_settings where user_id = owner_id;
  if pref = 'nobody' then raise exception 'The author has turned off comments' using errcode = '42501';
  elsif pref = 'followers' and not exists (select 1 from public.follows where follower_id = auth.uid() and following_id = owner_id) then
    raise exception 'Only followers can comment on this account''s posts' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists zz_comments_privacy_guard on public.comments;
create trigger zz_comments_privacy_guard before insert on public.comments
for each row execute function public.zz_comments_privacy_guard();

-- 6. support requests (rate-limited, admins are told by the server) ------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.support_tickets'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%type%' loop
    execute format('alter table public.support_tickets drop constraint %I', c.conname);
  end loop;
exception when others then raise notice 'support_tickets constraints left as is: %', sqlerrm;
end $$;

create or replace function public.submit_support_ticket(
  p_type text, p_title text, p_description text, p_screenshot text default null, p_device jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; t text := btrim(coalesce(p_title, '')); d text := btrim(coalesce(p_description, '')); a record;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_type not in ('question', 'bug', 'payment', 'feature', 'account', 'other') then raise exception 'Invalid request type'; end if;
  if char_length(t) < 3 or char_length(t) > 120 then raise exception 'Title must be 3 to 120 characters'; end if;
  if char_length(d) < 10 or char_length(d) > 2000 then raise exception 'Details must be 10 to 2000 characters'; end if;
  if p_screenshot is not null and p_screenshot !~ '^https://res\.cloudinary\.com/' then p_screenshot := null; end if;
  if (select count(*) from public.support_tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests. Please wait a while.';
  end if;

  insert into public.support_tickets (user_id, type, title, description, screenshot_url, device_info, status)
  values (auth.uid(), p_type, t, d, p_screenshot, coalesce(p_device, '{}'::jsonb), 'open') returning id into new_id;

  begin
    for a in select id from public.users where role in ('blink', 'admin') loop
      insert into public.notifications (user_id, from_user_id, type, message, ref_id, is_read)
      values (a.id, auth.uid(), 'system', 'New support request: ' || left(t, 60), new_id, false);
    end loop;
  exception when others then null;
  end;
  return new_id;
end $$;
grant execute on function public.submit_support_ticket(text, text, text, text, jsonb) to authenticated;

-- 7. delete my own account everywhere (same engine as the admin "delete everywhere") -----------
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
       and c.table_name not in ('users', 'admin_logs', 'deleted_accounts_log')
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
grant execute on function public.delete_my_account() to authenticated;
