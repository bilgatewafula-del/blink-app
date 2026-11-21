-- =====================================================================
-- B-FLASH STAGE 5  |  Video captions and polls
-- Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- CAPTIONS  posts.captions holds timed subtitle lines the creator typed:
--           [{"s": 1.5, "e": 4, "t": "Habari!"}, ...]. A database check keeps
--           them tidy (max 60 lines, 1-120 characters, sensible times).
--
-- POLLS     a video can carry one poll (question + 2 to 4 options).
--           - Anyone who can see the video can read the poll.
--           - Only the video's owner can add or remove it.
--           - Votes are written ONLY by vote_post_poll(): one vote per person,
--             no changes, max 60 votes an hour, blocked accounts excluded.
--           - Results are shown to a viewer only after they vote (the owner
--             always sees them), so early votes don't sway later ones.
-- =====================================================================

-- 1. captions -----------------------------------------------------------
alter table public.posts add column if not exists captions jsonb;

create or replace function public.validate_post_captions() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare el jsonb;
begin
  if new.captions is null then return new; end if;
  if jsonb_typeof(new.captions) <> 'array' then raise exception 'Captions must be a list'; end if;
  if jsonb_array_length(new.captions) > 60 then raise exception 'Too many caption lines (max 60)'; end if;
  for el in select * from jsonb_array_elements(new.captions) loop
    if jsonb_typeof(el) is distinct from 'object'
       or jsonb_typeof(el->'s') is distinct from 'number'
       or jsonb_typeof(el->'e') is distinct from 'number'
       or jsonb_typeof(el->'t') is distinct from 'string' then
      raise exception 'A caption line is not valid';
    end if;
    if (el->>'s')::numeric < 0 or (el->>'e')::numeric <= (el->>'s')::numeric or (el->>'e')::numeric > 600 then
      raise exception 'A caption line has bad timing';
    end if;
    if char_length(el->>'t') not between 1 and 120 then
      raise exception 'A caption line must be 1 to 120 characters';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists posts_validate_captions on public.posts;
create trigger posts_validate_captions
  before insert or update of captions on public.posts
  for each row execute function public.validate_post_captions();

-- 2. polls ---------------------------------------------------------------
create table if not exists public.post_polls (
  post_id    uuid primary key references public.posts(id) on delete cascade,
  question   text  not null check (char_length(question) between 1 and 120),
  options    jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  created_at timestamptz not null default now()
);

create table if not exists public.post_poll_votes (
  post_id      uuid not null references public.post_polls(post_id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  option_index int  not null check (option_index between 0 and 3),
  created_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);

create or replace function public.validate_poll_options() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare el jsonb;
begin
  for el in select * from jsonb_array_elements(new.options) loop
    if jsonb_typeof(el) is distinct from 'string' or char_length(el #>> '{}') not between 1 and 40 then
      raise exception 'Each poll option must be 1 to 40 characters';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists post_polls_validate on public.post_polls;
create trigger post_polls_validate before insert on public.post_polls
  for each row execute function public.validate_poll_options();

-- can the signed-in person see this video? (same rules as the feed)
create or replace function public.poll_post_visible(p_post_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post_id
       and (
         p.user_id = auth.uid()
         or (
           coalesce(p.status, '') not in ('deleted', 'hidden')
           and not exists (select 1 from public.blocks b
                            where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
                               or (b.blocker_id = p.user_id and b.blocked_id = auth.uid()))
           and (
             coalesce(p.audience, 'public') = 'public'
             or (p.audience = 'followers' and exists (select 1 from public.follows f
                                                       where f.follower_id = auth.uid() and f.following_id = p.user_id))
           )
         )
       )
  );
$$;
revoke all on function public.poll_post_visible(uuid) from public, anon;

create or replace function public.poll_results(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare poll record; mine int; counts jsonb; total int;
begin
  if auth.uid() is null or not public.poll_post_visible(p_post_id) then return null; end if;
  select pp.options, p.user_id into poll
    from public.post_polls pp join public.posts p on p.id = pp.post_id
   where pp.post_id = p_post_id;
  if not found then return null; end if;

  select option_index into mine from public.post_poll_votes where post_id = p_post_id and user_id = auth.uid();
  select count(*) into total from public.post_poll_votes where post_id = p_post_id;

  if mine is null and poll.user_id <> auth.uid() then
    return jsonb_build_object('voted', false, 'total', total, 'counts', null, 'mine', null);
  end if;

  select coalesce(jsonb_agg(coalesce(c.n, 0) order by g.i), '[]'::jsonb) into counts
    from generate_series(0, jsonb_array_length(poll.options) - 1) as g(i)
    left join (select option_index, count(*)::int as n
                 from public.post_poll_votes where post_id = p_post_id group by option_index) c
           on c.option_index = g.i;

  return jsonb_build_object('voted', mine is not null, 'total', total, 'counts', counts, 'mine', mine);
end $$;
revoke all on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated;

create or replace function public.vote_post_poll(p_post_id uuid, p_option int) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; recent int;
begin
  if auth.uid() is null then raise exception 'Sign in to vote'; end if;
  if not public.poll_post_visible(p_post_id) then raise exception 'This poll is not available'; end if;
  select jsonb_array_length(options) into n from public.post_polls where post_id = p_post_id;
  if n is null then raise exception 'This poll is not available'; end if;
  if p_option is null or p_option < 0 or p_option >= n then raise exception 'Pick one of the options'; end if;

  select count(*) into recent from public.post_poll_votes
   where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 60 then raise exception 'Too many votes. Try again later.'; end if;

  insert into public.post_poll_votes (post_id, user_id, option_index)
  values (p_post_id, auth.uid(), p_option)
  on conflict do nothing;                         -- one vote each, no changing it

  return public.poll_results(p_post_id);
end $$;
revoke all on function public.vote_post_poll(uuid, int) from public, anon;
grant execute on function public.vote_post_poll(uuid, int) to authenticated;

-- who may touch the tables directly (the policies below narrow it further)
grant select, insert, delete on public.post_polls to authenticated;
revoke all on public.post_poll_votes from anon, authenticated;       -- votes only through vote_post_poll()

alter table public.post_polls      enable row level security;
alter table public.post_poll_votes enable row level security;     -- no policies: only vote_post_poll() writes

drop policy if exists post_polls_read   on public.post_polls;
drop policy if exists post_polls_insert on public.post_polls;
drop policy if exists post_polls_delete on public.post_polls;
create policy post_polls_read on public.post_polls
  for select to authenticated using (public.poll_post_visible(post_id));
create policy post_polls_insert on public.post_polls
  for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));
create policy post_polls_delete on public.post_polls
  for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

-- Check: expect 4 rows.
select 'column' as kind, column_name::text as name from information_schema.columns
 where table_schema = 'public' and table_name = 'posts' and column_name = 'captions'
union all select 'table', tablename::text from pg_tables
 where schemaname = 'public' and tablename in ('post_polls', 'post_poll_votes')
union all select 'function', proname::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'vote_post_poll';
