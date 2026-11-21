-- =====================================================================
-- B-FLASH STAGE 3  |  Duet / Stitch links and real view counting
-- Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run.
--
--  1. posts gets four columns: remix_of (the original video), remix_type
--     ('duet' or 'stitch'), remix_clip_end (stitch clip length) and
--     allow_remix (the creator can switch duets/stitches off).
--  2. A database check refuses a duet/stitch of a video that is deleted,
--     hidden, not public, has remixing turned off, or whose creator and
--     the remixer have blocked each other. A stitch clip is held to 1-5 s.
--  3. Views: one view per person per video, counted by a server function
--     (the app cannot write the counter directly). Your own views and
--     repeat views are ignored, so the number is not inflated.
-- =====================================================================

-- 1. columns -----------------------------------------------------------
alter table public.posts
  add column if not exists remix_of        uuid references public.posts(id) on delete set null,
  add column if not exists remix_type      text,
  add column if not exists remix_clip_end  numeric,
  add column if not exists allow_remix     boolean not null default true;

do $$ begin
  alter table public.posts
    add constraint posts_remix_type_chk check (remix_type is null or remix_type in ('duet', 'stitch'));
exception when duplicate_object then null; end $$;

create index if not exists posts_remix_of_idx on public.posts (remix_of) where remix_of is not null;

-- 2. duet / stitch rules -----------------------------------------------
create or replace function public.validate_post_remix() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare src record;
begin
  if new.remix_of is null then
    new.remix_type := null;
    new.remix_clip_end := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.remix_of is not distinct from new.remix_of
     and old.remix_type is not distinct from new.remix_type
     and old.remix_clip_end is not distinct from new.remix_clip_end then
    return new;
  end if;

  if new.remix_type is null or new.remix_type not in ('duet', 'stitch') then
    raise exception 'Choose duet or stitch';
  end if;

  select id, user_id, audience, status, video_url, allow_remix, video_duration
    into src from public.posts where id = new.remix_of;

  if not found or src.video_url is null
     or coalesce(src.status, '') in ('deleted', 'hidden')
     or coalesce(src.audience, 'public') <> 'public' then
    raise exception 'That video is not available for duets or stitches';
  end if;
  if src.allow_remix is false then
    raise exception 'The creator turned off duets and stitches for this video';
  end if;
  if exists (select 1 from public.blocks b
              where (b.blocker_id = new.user_id and b.blocked_id = src.user_id)
                 or (b.blocker_id = src.user_id and b.blocked_id = new.user_id)) then
    raise exception 'That video is not available for duets or stitches';
  end if;

  if new.remix_type = 'stitch' then
    new.remix_clip_end := least(greatest(coalesce(new.remix_clip_end, 3), 1), 5,
                                greatest(coalesce(nullif(src.video_duration, 0), 5), 1));
  else
    new.remix_clip_end := null;
  end if;
  return new;
end $$;

drop trigger if exists posts_validate_remix on public.posts;
create trigger posts_validate_remix
  before insert or update of remix_of, remix_type, remix_clip_end on public.posts
  for each row execute function public.validate_post_remix();

-- 3. views --------------------------------------------------------------
create table if not exists public.post_views (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_views enable row level security;   -- no policies: only the function below can write

create or replace function public.record_post_view(p_post_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare added int;
begin
  if auth.uid() is null then return; end if;
  insert into public.post_views (post_id, user_id) values (p_post_id, auth.uid())
    on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.posts set views_count = coalesce(views_count, 0) + 1
     where id = p_post_id and user_id <> auth.uid();
  end if;
exception when others then
  null;   -- counting a view must never break watching
end $$;
revoke all on function public.record_post_view(uuid) from public, anon;
grant execute on function public.record_post_view(uuid) to authenticated;

-- Check: expect 2 rows (the remix check and the new columns).
select 'trigger' as kind, tgname::text as name from pg_trigger where tgname = 'posts_validate_remix'
union all
select 'column', column_name::text from information_schema.columns
 where table_schema = 'public' and table_name = 'posts' and column_name in ('remix_of', 'remix_type', 'remix_clip_end', 'allow_remix');
