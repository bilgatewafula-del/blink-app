-- =====================================================================
-- B-Link — Status updates (text + photo), friends-only, live viewers
-- Safe to run more than once. Run AFTER chat-admin-system.sql.
-- Friends = you follow each other. Only friends can see, react to or reply
-- to a status. Reactions and replies arrive as chat messages.
-- =====================================================================

-- 0. helpers (also created by earlier scripts; identical, harmless) ----------------
create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b
     and exists (select 1 from public.follows where follower_id = a and following_id = b)
     and exists (select 1 from public.follows where follower_id = b and following_id = a)
$$;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- 1. columns ---------------------------------------------------------------------
alter table public.stories add column if not exists story_type   text not null default 'image';
alter table public.stories add column if not exists text_content text;
alter table public.stories add column if not exists bg_style     text;
alter table public.messages add column if not exists story_id      uuid;
alter table public.messages add column if not exists story_preview jsonb;

do $$ begin alter table public.stories alter column media_url  drop not null; exception when others then null; end $$;
do $$ begin alter table public.stories alter column media_type drop not null; exception when others then null; end $$;

-- older versions only allowed 'image' / 'video' in media_type
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.stories'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%media_type%' loop
    execute format('alter table public.stories drop constraint %I', c.conname);
  end loop;
exception when others then raise notice 'media_type constraint left as is: %', sqlerrm;
end $$;

-- 2. one view / one reaction per person -------------------------------------------
do $$ begin
  delete from public.story_views a using public.story_views b
   where a.ctid < b.ctid and a.story_id = b.story_id and a.viewer_id = b.viewer_id;
  create unique index if not exists story_views_pair_uidx on public.story_views (story_id, viewer_id);
exception when others then raise notice 'story_views index: %', sqlerrm; end $$;

do $$ begin
  delete from public.story_reactions a using public.story_reactions b
   where a.ctid < b.ctid and a.story_id = b.story_id and a.user_id = b.user_id;
  create unique index if not exists story_reactions_pair_uidx on public.story_reactions (story_id, user_id);
exception when others then raise notice 'story_reactions index: %', sqlerrm; end $$;

create index if not exists stories_user_created_idx on public.stories (user_id, created_at desc);
create index if not exists stories_expires_idx      on public.stories (expires_at);
create index if not exists story_views_viewer_idx   on public.story_views (viewer_id);

-- 3. who can see what (enforced by the database, not the app) -------------------------
do $$
declare p record; t text;
begin
  foreach t in array array['stories', 'story_views', 'story_reactions', 'story_replies'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

create policy "stories: owner, friends, staff read" on public.stories for select using (
  user_id = auth.uid()
  or (expires_at > now() and public.are_friends(auth.uid(), user_id))
  or public._role_rank(public._my_role()) >= 2);
create policy "stories: owner or staff delete" on public.stories for delete using (
  user_id = auth.uid() or public._role_rank(public._my_role()) >= 2);
-- no insert/update policy: statuses are created through create_story() only

create policy "story views: viewer or owner read" on public.story_views for select using (
  viewer_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
create policy "story reactions: reactor or owner read" on public.story_reactions for select using (
  user_id = auth.uid() or exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));

-- only the server may attach a "status" card to a chat message
create or replace function public.zz_messages_story_guard()
returns trigger language plpgsql as $$
begin
  if (new.story_id is not null or new.story_preview is not null)
     and coalesce(current_setting('blink.story_ok', true), '') <> '1' then
    new.story_id := null;
    new.story_preview := null;
  end if;
  return new;
end $$;
drop trigger if exists zz_messages_story_guard on public.messages;
create trigger zz_messages_story_guard before insert on public.messages
for each row execute function public.zz_messages_story_guard();

-- 4. the feed: own + friends, one round trip ------------------------------------------
create or replace function public.get_story_feed()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at asc), '[]'::jsonb)
  from (
    select s.id, s.user_id, s.story_type, s.media_url, s.media_type, s.text_content, s.bg_style, s.caption,
           coalesce(s.duration, 5)::int          as duration,
           s.created_at, s.expires_at,
           coalesce(s.views_count, 0)::int       as views_count,
           coalesce(s.reactions_count, 0)::int   as reactions_count,
           exists (select 1 from public.story_views v where v.story_id = s.id and v.viewer_id = auth.uid()) as viewed,
           (select r.emoji from public.story_reactions r where r.story_id = s.id and r.user_id = auth.uid()) as my_reaction,
           u.username, u.display_name, u.avatar_url, coalesce(u.is_verified, false) as is_verified
      from public.stories s
      join public.users u on u.id = s.user_id
     where auth.uid() is not null
       and s.expires_at > now()
       and (s.user_id = auth.uid() or public.are_friends(auth.uid(), s.user_id))
     order by s.created_at asc
     limit 400
  ) x
$$;
grant execute on function public.get_story_feed() to authenticated;

-- 5. create / delete -----------------------------------------------------------------
create or replace function public.create_story(
  p_type text, p_media_url text default null, p_text text default null, p_bg text default null, p_caption text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; txt text := btrim(coalesce(p_text, '')); cap text := nullif(btrim(coalesce(p_caption, '')), '');
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.users where id = auth.uid()
              and (is_banned = true or is_restricted = true or (suspended_until is not null and suspended_until > now()))) then
    raise exception 'Your account cannot post a status right now' using errcode = '42501';
  end if;
  if (select count(*) from public.stories where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 30 then
    raise exception 'You have reached today''s status limit';
  end if;

  if p_type = 'text' then
    if char_length(txt) < 1 or char_length(txt) > 300 then raise exception 'Write between 1 and 300 characters'; end if;
    if coalesce(p_bg, '') !~ '^[a-z0-9_]{2,24}$' then raise exception 'Choose a background'; end if;
    insert into public.stories (user_id, story_type, text_content, bg_style, media_type, duration, expires_at)
    values (auth.uid(), 'text', txt, p_bg, 'text', 6, now() + interval '24 hours') returning id into new_id;
  elsif p_type = 'image' then
    if p_media_url is null or p_media_url !~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/' then
      raise exception 'Invalid photo';
    end if;
    insert into public.stories (user_id, story_type, media_url, media_type, caption, duration, expires_at)
    values (auth.uid(), 'image', p_media_url, 'image', left(cap, 150), 6, now() + interval '24 hours') returning id into new_id;
  else
    raise exception 'Unsupported status type';
  end if;
  return new_id;
end $$;

create or replace function public.delete_story(p_story_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.stories where id = p_story_id
                  and (user_id = auth.uid() or public._role_rank(public._my_role()) >= 2)) then
    raise exception 'Status not found' using errcode = '42501';
  end if;
  delete from public.story_views     where story_id = p_story_id;
  delete from public.story_reactions where story_id = p_story_id;
  begin delete from public.story_replies where story_id = p_story_id; exception when others then null; end;
  delete from public.stories where id = p_story_id;
end $$;

-- 6. viewing, reacting, replying (friends only) -----------------------------------------
create or replace function public.story_record_view(p_story_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare s record; n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select id, user_id, expires_at into s from public.stories where id = p_story_id;
  if not found or s.expires_at <= now() then raise exception 'This status is no longer available'; end if;
  if s.user_id <> auth.uid() then
    if not public.are_friends(auth.uid(), s.user_id) then raise exception 'Only friends can view this status' using errcode = '42501'; end if;
    insert into public.story_views (story_id, viewer_id, viewed_at) values (p_story_id, auth.uid(), now())
    on conflict (story_id, viewer_id) do nothing;
  end if;
  select count(*) into n from public.story_views where story_id = p_story_id;
  update public.stories set views_count = n where id = p_story_id and views_count is distinct from n;
  return n;
end $$;

-- writes the reaction / reply into the chat between the two friends
create or replace function public._story_chat_message(p_story_id uuid, p_owner uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare chat uuid; st record; prev jsonb;
begin
  select story_type, media_url, text_content, bg_style into st from public.stories where id = p_story_id;
  prev := jsonb_build_object('type', st.story_type, 'url', st.media_url, 'text', left(coalesce(st.text_content, ''), 80), 'bg', st.bg_style);
  chat := public.get_or_create_chat(p_owner);
  perform set_config('blink.story_ok', '1', true);
  insert into public.messages (chat_id, sender_id, body, message_type, story_id, story_preview, delivered_at, deleted_for, starred_by)
  values (chat, auth.uid(), p_body, 'text', p_story_id, prev, now(), '{}', '{}');
  perform set_config('blink.story_ok', '', true);
  return chat;
end $$;

create or replace function public.story_react(p_story_id uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; cur text; newr text; n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_emoji is null or char_length(p_emoji) > 8 then raise exception 'Invalid reaction'; end if;
  select id, user_id, expires_at into s from public.stories where id = p_story_id;
  if not found or s.expires_at <= now() then raise exception 'This status is no longer available'; end if;
  if s.user_id = auth.uid() then raise exception 'You cannot react to your own status'; end if;
  if not public.are_friends(auth.uid(), s.user_id) then raise exception 'Only friends can react to this status' using errcode = '42501'; end if;

  select emoji into cur from public.story_reactions where story_id = p_story_id and user_id = auth.uid();
  if cur = p_emoji then
    delete from public.story_reactions where story_id = p_story_id and user_id = auth.uid();
    newr := null;
  else
    insert into public.story_reactions (story_id, user_id, emoji) values (p_story_id, auth.uid(), p_emoji)
    on conflict (story_id, user_id) do update set emoji = excluded.emoji;
    newr := p_emoji;
    if cur is null and not exists (select 1 from public.messages
                                    where story_id = p_story_id and sender_id = auth.uid()
                                      and created_at > now() - interval '10 minutes' and body like 'Reacted %') then
      begin perform public._story_chat_message(p_story_id, s.user_id, 'Reacted ' || p_emoji || ' to your status');
      exception when others then null; end;     -- the reaction counts even if chat is unavailable
    end if;
  end if;
  select count(*) into n from public.story_reactions where story_id = p_story_id;
  update public.stories set reactions_count = n where id = p_story_id;
  return jsonb_build_object('my_reaction', newr, 'reactions_count', n);
end $$;

create or replace function public.story_reply(p_story_id uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; txt text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(txt) < 1 or char_length(txt) > 500 then raise exception 'Write between 1 and 500 characters'; end if;
  select id, user_id, expires_at into s from public.stories where id = p_story_id;
  if not found or s.expires_at <= now() then raise exception 'This status is no longer available'; end if;
  if s.user_id = auth.uid() then raise exception 'You cannot reply to your own status'; end if;
  if not public.are_friends(auth.uid(), s.user_id) then raise exception 'Only friends can reply to this status' using errcode = '42501'; end if;
  return public._story_chat_message(p_story_id, s.user_id, txt);
end $$;

create or replace function public.story_viewers(p_story_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.stories where id = p_story_id and user_id = auth.uid()) then
    raise exception 'Only the owner can see who viewed' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(y) order by y.viewed_at desc), '[]'::jsonb) from (
    select v.viewer_id as user_id, v.viewed_at, u.username, u.display_name, u.avatar_url, r.emoji as reaction
      from public.story_views v
      join public.users u on u.id = v.viewer_id
      left join public.story_reactions r on r.story_id = v.story_id and r.user_id = v.viewer_id
     where v.story_id = p_story_id
     order by v.viewed_at desc limit 300) y);
end $$;

-- the owner can send their own status to chats (forward / share)
create or replace function public.story_share(p_story_id uuid, p_chat_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare st record; prev jsonb; cid uuid; n integer := 0; body text;
begin
  select * into st from public.stories where id = p_story_id and user_id = auth.uid() and expires_at > now();
  if not found then raise exception 'You can only share your own active status' using errcode = '42501'; end if;
  prev := jsonb_build_object('type', st.story_type, 'url', st.media_url, 'text', left(coalesce(st.text_content, ''), 80), 'bg', st.bg_style);
  body := coalesce(nullif(st.text_content, ''), nullif(st.caption, ''), 'Status update');
  perform set_config('blink.story_ok', '1', true);
  foreach cid in array coalesce(p_chat_ids, '{}') loop
    exit when n >= 10;
    if exists (select 1 from public.chats c where c.id = cid and auth.uid() = any (c.participants)) then
      insert into public.messages (chat_id, sender_id, body, message_type, story_id, story_preview, delivered_at, forwarded, deleted_for, starred_by)
      values (cid, auth.uid(), left(body, 300), 'text', p_story_id, prev, now(), true, '{}', '{}');
      n := n + 1;
    end if;
  end loop;
  perform set_config('blink.story_ok', '', true);
  return n;
end $$;

grant execute on function public.create_story(text, text, text, text, text) to authenticated;
grant execute on function public.delete_story(uuid)                         to authenticated;
grant execute on function public.story_record_view(uuid)                    to authenticated;
grant execute on function public.story_react(uuid, text)                    to authenticated;
grant execute on function public.story_reply(uuid, text)                    to authenticated;
grant execute on function public.story_viewers(uuid)                        to authenticated;
grant execute on function public.story_share(uuid, uuid[])                  to authenticated;
revoke execute on function public._story_chat_message(uuid, uuid, text) from public, anon, authenticated;

-- 7. housekeeping + live updates ----------------------------------------------------------
create or replace function public.purge_expired_stories()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.story_views     where story_id in (select id from public.stories where expires_at < now() - interval '1 day');
  delete from public.story_reactions where story_id in (select id from public.stories where expires_at < now() - interval '1 day');
  delete from public.stories where expires_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

do $$ begin
  begin create extension if not exists pg_cron; exception when others then null; end;
  begin perform cron.schedule('blink-purge-stories', '15 3 * * *', 'select public.purge_expired_stories()');
  exception when others then raise notice 'pg_cron not available; expired statuses are simply hidden'; end;
end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.stories;          exception when others then null; end;
  begin alter publication supabase_realtime add table public.story_views;      exception when others then null; end;
  begin alter publication supabase_realtime add table public.story_reactions;  exception when others then null; end;
end $$;
