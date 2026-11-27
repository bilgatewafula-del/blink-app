-- =====================================================================
-- B-Link — CHAT UPGRADE   (safe to run more than once)
-- Supabase → SQL Editor → paste → Run
--   1. fixes "no unique or exclusion constraint matching the ON CONFLICT specification"
--      when starting a conversation
--   2. adds View-once photos (the picture is never stored in the message itself)
-- =====================================================================

-- 1. START A CONVERSATION ---------------------------------------------------------------------
-- Finds the existing 1-to-1 chat or creates it. No ON CONFLICT, and a lock so two people
-- tapping "message" at the same moment cannot create two chats.
drop function if exists public.get_or_create_chat(uuid);
create or replace function public.get_or_create_chat(p_other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_other_id is null or p_other_id = me then raise exception 'You cannot message yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.users u where u.id = p_other_id and coalesce(u.is_banned, false) = false) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = me and b.blocked_id = p_other_id) or (b.blocker_id = p_other_id and b.blocked_id = me)) then
    raise exception 'You cannot message this person (blocked)' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(least(me::text, p_other_id::text) || ':' || greatest(me::text, p_other_id::text)));

  select c.id into cid from public.chats c
   where c.participants @> array[me, p_other_id] and cardinality(c.participants) = 2
   order by c.id limit 1;
  if cid is null then
    insert into public.chats (participants) values (array[me, p_other_id]) returning id into cid;
  end if;
  return cid;
end $$;
revoke execute on function public.get_or_create_chat(uuid) from public, anon;
grant  execute on function public.get_or_create_chat(uuid) to authenticated;

-- 2. VIEW-ONCE PHOTOS -------------------------------------------------------------------------
alter table public.messages add column if not exists view_once boolean not null default false;
alter table public.messages add column if not exists viewed_at  timestamptz;

-- the secret picture links live here. Nobody can read this table from the app:
-- the only way out is open_view_once(), which hands the link over once and deletes it.
create table if not exists public.view_once_media (
  message_id uuid primary key references public.messages(id) on delete cascade,
  url        text not null,
  created_at timestamptz not null default now()
);
alter table public.view_once_media enable row level security;
revoke all on public.view_once_media from anon, authenticated;

create or replace function public.send_view_once_photo(p_chat_id uuid, p_url text, p_parent uuid default null)
returns public.messages language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r public.messages;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_url is null or p_url !~ '^https://' or length(p_url) > 1000 then raise exception 'Invalid photo' using errcode = '22023'; end if;
  if not exists (select 1 from public.chats c where c.id = p_chat_id and me = any (c.participants)) then
    raise exception 'Not your chat' using errcode = '42501';
  end if;
  insert into public.messages (chat_id, sender_id, body, message_type, media_url, view_once, parent_message_id, deleted_for, starred_by)
  values (p_chat_id, me, 'View-once photo', 'image', null, true, p_parent, '{}', '{}')
  returning * into r;
  insert into public.view_once_media (message_id, url) values (r.id, p_url);
  return r;
end $$;

create or replace function public.open_view_once(p_message_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.messages; u text;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select * into m from public.messages where id = p_message_id for update;
  if not found or not coalesce(m.view_once, false) then raise exception 'Not found' using errcode = '22023'; end if;
  if m.sender_id = me then raise exception 'You sent this photo' using errcode = '42501'; end if;
  if not exists (select 1 from public.chats c where c.id = m.chat_id and me = any (c.participants)) then
    raise exception 'Not your chat' using errcode = '42501';
  end if;
  if m.viewed_at is not null or coalesce(m.is_deleted, false) then raise exception 'This photo has already been opened'; end if;
  select v.url into u from public.view_once_media v where v.message_id = m.id;
  if u is null then raise exception 'This photo is no longer available'; end if;
  update public.messages set viewed_at = now(), seen_at = coalesce(seen_at, now()), delivered_at = coalesce(delivered_at, now()) where id = m.id;
  delete from public.view_once_media where message_id = m.id;
  return u;
end $$;

-- if the sender deletes the message for everyone, the secret link goes too
create or replace function public.zz_view_once_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_deleted is true and old.is_deleted is distinct from true then
    delete from public.view_once_media where message_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists zz_view_once_cleanup on public.messages;
create trigger zz_view_once_cleanup after update of is_deleted on public.messages
for each row execute function public.zz_view_once_cleanup();

revoke execute on function public.send_view_once_photo(uuid, text, uuid) from public, anon;
revoke execute on function public.open_view_once(uuid) from public, anon;
grant  execute on function public.send_view_once_photo(uuid, text, uuid) to authenticated;
grant  execute on function public.open_view_once(uuid) to authenticated;
