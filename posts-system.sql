-- =====================================================================
-- B-Link — posts, comments and insights backend (safe to run again)
-- Run AFTER chat-admin-system.sql and status-system.sql.
-- =====================================================================

-- 0. helpers (identical copies of earlier scripts) -------------------------------
create or replace function public._my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;
create or replace function public._role_rank(r text)
returns int language sql immutable as $$
  select case r when 'blink' then 4 when 'admin' then 3 when 'moderator' then 2 else 1 end
$$;

-- 1. columns, tables, indexes -------------------------------------------------------
alter table public.comments add column if not exists edited    boolean not null default false;
alter table public.comments add column if not exists edited_at timestamptz;
alter table public.comments add column if not exists is_hidden boolean not null default false;
alter table public.comments add column if not exists is_pinned boolean not null default false;

create table if not exists public.post_shares (
  post_id    uuid not null,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_shares enable row level security;   -- written only by record_post_share()

create index if not exists comments_post_created_idx on public.comments (post_id, created_at desc);
create index if not exists comments_parent_idx       on public.comments (parent_id);
create index if not exists posts_created_idx         on public.posts (created_at desc);
do $$ begin create unique index if not exists likes_pair_uidx on public.likes (post_id, user_id);
exception when others then raise notice 'likes index: %', sqlerrm; end $$;
do $$ begin create unique index if not exists saved_posts_pair_uidx on public.saved_posts (post_id, user_id);
exception when others then raise notice 'saved_posts index: %', sqlerrm; end $$;

-- 2. nobody can forge counters, boosts or pins from the browser ---------------------------
-- (checks only apply to direct client writes; the server's own functions are exempt)
create or replace function public.zz_posts_insert_guard()
returns trigger language plpgsql as $$
begin
  -- only direct writes from the browser are restricted; server functions and triggers (depth > 1) are trusted
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  new.likes_count := 0; new.comments_count := 0; new.reposts_count := 0; new.views_count := 0; new.shares_count := 0;
  new.is_boosted := false; new.is_pinned := false;
  if new.status is null or new.status not in ('active', 'draft') then new.status := 'active'; end if;
  if new.caption is not null and char_length(new.caption) > 2000 then raise exception 'Caption is too long'; end if;
  if new.bg_color is not null and new.bg_color !~ '^[a-z0-9_]{2,24}$' then new.bg_color := null; end if;
  if new.video_url is not null and new.video_url !~ '^https://res\.cloudinary\.com/' then raise exception 'Invalid video'; end if;
  if new.video_thumbnail is not null and new.video_thumbnail !~ '^https://res\.cloudinary\.com/' then new.video_thumbnail := null; end if;
  if new.media_urls is not null and exists (select 1 from unnest(new.media_urls) u where u !~ '^https://res\.cloudinary\.com/') then
    raise exception 'Invalid media';
  end if;
  return new;
end $$;

drop trigger if exists zz_posts_insert_guard on public.posts;
create trigger zz_posts_insert_guard before insert on public.posts
for each row execute function public.zz_posts_insert_guard();

create or replace function public.zz_posts_update_guard()
returns trigger language plpgsql as $$
begin
  -- only direct writes from the browser are restricted; server functions and triggers (depth > 1) are trusted
  if current_user not in ('authenticated', 'anon') or pg_trigger_depth() > 1 then return new; end if;
  if public._role_rank(public._my_role()) >= 2 then return new; end if;

  if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'Post ownership cannot be changed' using errcode = '42501';
  end if;
  new.likes_count := old.likes_count; new.comments_count := old.comments_count; new.reposts_count := old.reposts_count;
  new.views_count := old.views_count; new.shares_count := old.shares_count; new.is_boosted := old.is_boosted;
  if new.status is distinct from old.status and new.status not in ('active', 'archived', 'deleted') then new.status := old.status; end if;
  if new.bg_color is not null and new.bg_color !~ '^[a-z0-9_]{2,24}$' then new.bg_color := old.bg_color; end if;
  if new.caption is not null and char_length(new.caption) > 2000 then raise exception 'Caption is too long'; end if;
  if new.video_url is not null and new.video_url is distinct from old.video_url and new.video_url !~ '^https://res\.cloudinary\.com/' then
    raise exception 'Invalid video';
  end if;
  if new.media_urls is not null and new.media_urls is distinct from old.media_urls
     and exists (select 1 from unnest(new.media_urls) u where u !~ '^https://res\.cloudinary\.com/') then
    raise exception 'Invalid media';
  end if;
  return new;
end $$;

drop trigger if exists zz_posts_update_guard on public.posts;
create trigger zz_posts_update_guard before update on public.posts
for each row execute function public.zz_posts_update_guard();

-- 3. one round trip: "did I like / save / repost these posts?" ---------------------------------
create or replace function public.get_post_states(p_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', i.id,
           'liked', l.user_id is not null,
           'reaction', l.reaction_type,
           'saved', s.user_id is not null,
           'reposted', exists (select 1 from public.posts r
                                where r.user_id = auth.uid() and r.quoted_post_id = i.id and r.is_repost = true
                                  and coalesce(r.status, 'active') <> 'deleted'))), '[]'::jsonb)
    from unnest(p_ids[1:60]) as i(id)
    left join public.likes l       on l.post_id = i.id and l.user_id = auth.uid()
    left join public.saved_posts s on s.post_id = i.id and s.user_id = auth.uid()
   where auth.uid() is not null
$$;
grant execute on function public.get_post_states(uuid[]) to authenticated;

-- 4. shares count once per person -----------------------------------------------------------
create or replace function public.record_post_share(p_post_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare added integer; n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.posts where id = p_post_id) then raise exception 'Post not found'; end if;
  insert into public.post_shares (post_id, user_id) values (p_post_id, auth.uid()) on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.posts set shares_count = coalesce(shares_count, 0) + 1 where id = p_post_id;
  end if;
  select coalesce(shares_count, 0) into n from public.posts where id = p_post_id;
  return n;
end $$;
grant execute on function public.record_post_share(uuid) to authenticated;

-- 5. insights (post owner only) --------------------------------------------------------------
create or replace function public.post_insights(p_post_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p record; saves bigint; react jsonb; eng numeric;
begin
  select * into p from public.posts where id = p_post_id;
  if not found or (p.user_id <> auth.uid() and public._role_rank(public._my_role()) < 2) then
    raise exception 'Only the owner can see insights' using errcode = '42501';
  end if;
  select count(*) into saves from public.saved_posts where post_id = p_post_id;
  select coalesce(jsonb_object_agg(rt, c), '{}'::jsonb) into react
    from (select reaction_type as rt, count(*) as c from public.likes where post_id = p_post_id group by 1) x;
  eng := round((coalesce(p.likes_count, 0) + coalesce(p.comments_count, 0) + coalesce(p.reposts_count, 0)
              + coalesce(p.shares_count, 0) + saves)::numeric * 100 / greatest(coalesce(p.views_count, 0), 1), 1);
  return jsonb_build_object(
    'views', coalesce(p.views_count, 0), 'likes', coalesce(p.likes_count, 0), 'comments', coalesce(p.comments_count, 0),
    'reposts', coalesce(p.reposts_count, 0), 'shares', coalesce(p.shares_count, 0), 'saves', saves,
    'reactions', react, 'engagement', least(eng, 100), 'created_at', p.created_at);
end $$;
grant execute on function public.post_insights(uuid) to authenticated;

-- 6. comments ---------------------------------------------------------------------------------
create or replace function public._comment_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'post_id', c.post_id, 'parent_id', c.parent_id, 'user_id', c.user_id, 'body', c.body,
    'created_at', c.created_at, 'edited', coalesce(c.edited, false),
    'is_pinned', coalesce(c.is_pinned, false), 'is_hidden', coalesce(c.is_hidden, false),
    'reaction_count', coalesce(c.reaction_count, 0), 'reply_count', coalesce(c.reply_count, 0),
    'my_reaction', (select r.emoji from public.comment_reactions r where r.comment_id = c.id and r.user_id = auth.uid()),
    'user', jsonb_build_object('id', u.id, 'username', u.username, 'display_name', u.display_name,
                               'avatar_url', u.avatar_url, 'is_verified', coalesce(u.is_verified, false)))
    from public.comments c join public.users u on u.id = c.user_id
   where c.id = p_id
$$;
revoke execute on function public._comment_json(uuid) from public, anon, authenticated;

create or replace function public.get_post_comments(
  p_post_id uuid, p_parent_id uuid default null, p_sort text default 'top', p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare owner_id uuid; staff boolean; res jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select user_id into owner_id from public.posts where id = p_post_id;
  staff := public._role_rank(public._my_role()) >= 2;

  select coalesce(jsonb_agg(public._comment_json(t.id) order by t.ord), '[]'::jsonb) into res from (
    select c.id,
           row_number() over (order by
             (case when p_parent_id is null and coalesce(c.is_pinned, false) then 0 else 1 end),
             (case when p_parent_id is not null then extract(epoch from c.created_at) else 0 end) asc,
             (case when p_parent_id is null and p_sort = 'top' then coalesce(c.reaction_count, 0) else 0 end) desc,
             (case when p_parent_id is null then extract(epoch from c.created_at) else 0 end) desc) as ord
      from public.comments c
     where c.post_id = p_post_id
       and c.parent_id is not distinct from p_parent_id
       and coalesce(c.status, 'active') <> 'deleted'
       and (not coalesce(c.is_hidden, false) or c.user_id = auth.uid() or owner_id = auth.uid() or staff)
     order by ord
     limit greatest(1, least(coalesce(p_limit, 20), 50)) offset greatest(coalesce(p_offset, 0), 0)
  ) t;
  return res;
end $$;
grant execute on function public.get_post_comments(uuid, uuid, text, int, int) to authenticated;

create or replace function public.add_comment(p_post_id uuid, p_body text, p_parent_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pst record; par record; txt text := btrim(coalesce(p_body, ''));
  root uuid := null; cid uuid; recent int; uname text; mu uuid; n int := 0; pref text;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if char_length(txt) < 1 or char_length(txt) > 1000 then raise exception 'Write between 1 and 1000 characters'; end if;

  select id, user_id, comments_disabled, status into pst from public.posts where id = p_post_id;
  if not found or coalesce(pst.status, 'active') = 'deleted' then raise exception 'This post is no longer available'; end if;
  if coalesce(pst.comments_disabled, false) and pst.user_id <> auth.uid() then raise exception 'Comments are turned off for this post'; end if;
  if pst.user_id <> auth.uid() then
    select who_can_comment into pref from public.user_settings where user_id = pst.user_id;
    if pref = 'nobody' then raise exception 'The author has turned off comments'; end if;
    if pref = 'followers' and not exists (select 1 from public.follows where follower_id = auth.uid() and following_id = pst.user_id) then
      raise exception 'Only followers can comment on this account''s posts';
    end if;
  end if;
  if exists (select 1 from public.users where id = auth.uid()
              and (is_banned = true or is_restricted = true or (suspended_until is not null and suspended_until > now()))) then
    raise exception 'Your account cannot comment right now' using errcode = '42501';
  end if;
  select count(*) into recent from public.comments where user_id = auth.uid() and created_at > now() - interval '1 minute';
  if recent >= 10 then raise exception 'You are commenting too quickly. Please wait a moment.'; end if;

  if p_parent_id is not null then
    select id, parent_id, user_id, post_id into par from public.comments
     where id = p_parent_id and coalesce(status, 'active') <> 'deleted';
    if not found or par.post_id <> p_post_id then raise exception 'The comment you are replying to is gone'; end if;
    root := coalesce(par.parent_id, par.id);            -- threads stay two levels deep
  end if;

  insert into public.comments (post_id, user_id, body, parent_id) values (p_post_id, auth.uid(), txt, root) returning id into cid;

  update public.posts set comments_count = (select count(*) from public.comments where post_id = p_post_id and coalesce(status, 'active') <> 'deleted')
   where id = p_post_id;
  if root is not null then
    update public.comments set reply_count = (select count(*) from public.comments where parent_id = root and coalesce(status, 'active') <> 'deleted')
     where id = root;
  end if;

  -- notifications are written by the server, so they cannot be forged
  begin
    if pst.user_id <> auth.uid() then
      insert into public.notifications (user_id, from_user_id, type, message, ref_id, preview_text, is_read)
      values (pst.user_id, auth.uid(), 'comment', case when root is null then 'commented: "' else 'replied: "' end || left(txt, 60) || '"', p_post_id, left(txt, 60), false);
    end if;
    if par.user_id is not null and par.user_id <> auth.uid() and par.user_id <> pst.user_id then
      insert into public.notifications (user_id, from_user_id, type, message, ref_id, preview_text, is_read)
      values (par.user_id, auth.uid(), 'comment', 'replied to your comment: "' || left(txt, 60) || '"', p_post_id, left(txt, 60), false);
    end if;
    for uname in select distinct lower((regexp_matches(txt, '@([A-Za-z0-9_]{3,20})', 'g'))[1]) loop
      exit when n >= 5;
      select id into mu from public.users where lower(username) = uname;
      if mu is not null and mu <> auth.uid() and mu <> pst.user_id and mu is distinct from par.user_id then
        insert into public.notifications (user_id, from_user_id, type, message, ref_id, is_read)
        values (mu, auth.uid(), 'mention', 'mentioned you: "' || left(txt, 60) || '"', p_post_id, false);
        n := n + 1;
      end if;
    end loop;
  exception when others then null;
  end;

  return public._comment_json(cid);
end $$;

create or replace function public.edit_comment(p_comment_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare txt text := btrim(coalesce(p_body, ''));
begin
  if char_length(txt) < 1 or char_length(txt) > 1000 then raise exception 'Write between 1 and 1000 characters'; end if;
  update public.comments
     set body = txt, edited = true, edited_at = now()
   where id = p_comment_id and user_id = auth.uid() and coalesce(status, 'active') <> 'deleted';
  if not found then raise exception 'You can only edit your own comments' using errcode = '42501'; end if;
  return public._comment_json(p_comment_id);
end $$;

create or replace function public.hide_comment(p_comment_id uuid, p_hidden boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.comments c set is_hidden = coalesce(p_hidden, true)
   where c.id = p_comment_id
     and (exists (select 1 from public.posts p where p.id = c.post_id and p.user_id = auth.uid())
          or public._role_rank(public._my_role()) >= 2);
  if not found then raise exception 'Only the post owner can hide comments' using errcode = '42501'; end if;
end $$;

create or replace function public.pin_comment(p_comment_id uuid, p_pinned boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select c.post_id into pid from public.comments c
   where c.id = p_comment_id and c.parent_id is null
     and exists (select 1 from public.posts p where p.id = c.post_id and p.user_id = auth.uid());
  if pid is null then raise exception 'Only the post owner can pin top-level comments' using errcode = '42501'; end if;
  if coalesce(p_pinned, true) then update public.comments set is_pinned = false where post_id = pid and is_pinned; end if;
  update public.comments set is_pinned = coalesce(p_pinned, true) where id = p_comment_id;
end $$;

create or replace function public.toggle_comment_like(p_comment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare had boolean; n integer;
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.comments where id = p_comment_id and coalesce(status, 'active') <> 'deleted') then
    raise exception 'Comment not found';
  end if;
  select exists (select 1 from public.comment_reactions where comment_id = p_comment_id and user_id = auth.uid()) into had;
  if had then
    delete from public.comment_reactions where comment_id = p_comment_id and user_id = auth.uid();
  else
    insert into public.comment_reactions (comment_id, user_id, emoji) values (p_comment_id, auth.uid(), '❤️')
    on conflict (comment_id, user_id) do nothing;
  end if;
  select count(*) into n from public.comment_reactions where comment_id = p_comment_id;
  update public.comments set reaction_count = n where id = p_comment_id;
  return jsonb_build_object('liked', not had, 'count', n);
end $$;

-- counts stay true even when something else deletes a comment
create or replace function public.zz_sync_comment_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; par uuid;
begin
  pid := coalesce(new.post_id, old.post_id);
  par := coalesce(new.parent_id, old.parent_id);
  begin
    update public.posts set comments_count = (select count(*) from public.comments where post_id = pid and coalesce(status, 'active') <> 'deleted') where id = pid;
    if par is not null then
      update public.comments set reply_count = (select count(*) from public.comments where parent_id = par and coalesce(status, 'active') <> 'deleted') where id = par;
    end if;
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists zz_sync_comment_counts on public.comments;
create trigger zz_sync_comment_counts after update of status or delete on public.comments
for each row execute function public.zz_sync_comment_counts();

grant execute on function public.add_comment(uuid, text, uuid)        to authenticated;
grant execute on function public.edit_comment(uuid, text)             to authenticated;
grant execute on function public.hide_comment(uuid, boolean)          to authenticated;
grant execute on function public.pin_comment(uuid, boolean)           to authenticated;
grant execute on function public.toggle_comment_like(uuid)            to authenticated;

-- 7. one-time recount of every post and comment ---------------------------------------------
do $$ begin
  update public.posts p set comments_count = (select count(*) from public.comments c where c.post_id = p.id and coalesce(c.status, 'active') <> 'deleted');
  update public.comments c set reply_count = (select count(*) from public.comments r where r.parent_id = c.id and coalesce(r.status, 'active') <> 'deleted')
   where c.parent_id is null;
exception when others then raise notice 'recount skipped: %', sqlerrm; end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.comments; exception when others then null; end;
end $$;
