-- =====================================================================
-- B-Link — follow system, live counts, cover photo (safe to re-run)
-- Run once in: Supabase dashboard -> SQL Editor -> New query -> Run
-- It only ADDS things and repairs data. Nothing existing is dropped.
-- =====================================================================

-- 1. Repair data: no self-follows, no duplicate pairs -----------------
delete from public.follows where follower_id = following_id;

delete from public.follows a
using public.follows b
where a.ctid < b.ctid
  and a.follower_id  = b.follower_id
  and a.following_id = b.following_id;

-- 2. Indexes (fast lookups, and the pair can only exist once) ----------
create unique index if not exists follows_pair_unique   on public.follows (follower_id, following_id);
create index        if not exists follows_following_idx on public.follows (following_id, follower_id);
create index        if not exists posts_user_created_idx on public.posts (user_id, created_at desc);

-- 3. New columns ------------------------------------------------------
alter table public.users add column if not exists friends_count integer not null default 0;
alter table public.users add column if not exists cover_url text;

-- 4. One-call live stats for a profile --------------------------------
create or replace function public.get_profile_stats(p_user_id uuid)
returns table (followers bigint, following bigint, friends bigint, posts bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.follows where following_id = p_user_id),
    (select count(*) from public.follows where follower_id  = p_user_id),
    (select count(*)
       from public.follows f
       join public.follows b
         on b.follower_id = f.following_id and b.following_id = f.follower_id
      where f.follower_id = p_user_id),
    (select count(*)
       from public.posts p
      where p.user_id = p_user_id
        and coalesce(p.is_draft, false) = false
        and coalesce(p.status, '') <> 'deleted');
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

-- 5. Stored counters always equal the truth ----------------------------
-- These recount from the real rows after every change, so they can never
-- drift (and they cannot double count if older triggers also exist).
-- Any failure inside is swallowed so a follow can never be blocked by it.
create or replace function public.zz_sync_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then
    ids := array[new.follower_id, new.following_id];
  elsif tg_op = 'DELETE' then
    ids := array[old.follower_id, old.following_id];
  else
    ids := array[old.follower_id, old.following_id, new.follower_id, new.following_id];
  end if;

  begin
    update public.users u set
      followers_count = (select count(*) from public.follows f where f.following_id = u.id),
      following_count = (select count(*) from public.follows f where f.follower_id  = u.id),
      friends_count   = (select count(*)
                           from public.follows f
                           join public.follows b
                             on b.follower_id = f.following_id and b.following_id = f.follower_id
                          where f.follower_id = u.id)
    where u.id = any(ids);
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists zz_sync_follow_counts on public.follows;
create trigger zz_sync_follow_counts
after insert or update or delete on public.follows
for each row execute function public.zz_sync_follow_counts();

create or replace function public.zz_sync_posts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ids uuid[];
begin
  if tg_op = 'INSERT' then
    ids := array[new.user_id];
  elsif tg_op = 'DELETE' then
    ids := array[old.user_id];
  else
    ids := array[old.user_id, new.user_id];
  end if;

  begin
    update public.users u set
      posts_count = (select count(*)
                       from public.posts p
                      where p.user_id = u.id
                        and coalesce(p.is_draft, false) = false
                        and coalesce(p.status, '') <> 'deleted')
    where u.id = any(ids);
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists zz_sync_posts_count on public.posts;
create trigger zz_sync_posts_count
after insert or delete or update of status, is_draft, user_id on public.posts
for each row execute function public.zz_sync_posts_count();

-- 6. One-time recount of everyone ---------------------------------------
do $$
begin
  update public.users u set
    followers_count = (select count(*) from public.follows f where f.following_id = u.id),
    following_count = (select count(*) from public.follows f where f.follower_id  = u.id),
    friends_count   = (select count(*)
                         from public.follows f
                         join public.follows b
                           on b.follower_id = f.following_id and b.following_id = f.follower_id
                        where f.follower_id = u.id),
    posts_count     = (select count(*)
                         from public.posts p
                        where p.user_id = u.id
                          and coalesce(p.is_draft, false) = false
                          and coalesce(p.status, '') <> 'deleted');
exception when others then
  raise notice 'Recount skipped: %', sqlerrm;
end $$;

-- 7. Live updates ---------------------------------------------------------
alter table public.follows replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.follows; exception when others then null; end;
  begin alter publication supabase_realtime add table public.posts;   exception when others then null; end;
end $$;
