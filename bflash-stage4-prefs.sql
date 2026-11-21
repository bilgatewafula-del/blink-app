-- =====================================================================
-- B-FLASH STAGE 4  |  Mute creator and Not interested saved on the server
-- Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- Until now "Mute creator" and "Not interested" were remembered only on the
-- phone you used. These two tables keep them on your account, so they follow
-- you to every device. Each person can only see and change their own rows,
-- and the creator you mute is never told.
-- =====================================================================

create table if not exists public.user_mutes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  muted_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id),
  check (user_id <> muted_id)
);

create table if not exists public.post_hides (
  user_id    uuid not null references auth.users(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.user_mutes enable row level security;
alter table public.post_hides enable row level security;

drop policy if exists user_mutes_own on public.user_mutes;
create policy user_mutes_own on public.user_mutes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists post_hides_own on public.post_hides;
create policy post_hides_own on public.post_hides
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Abuse guard: nobody needs more than 2,000 saved items of each kind.
create or replace function public.cap_flash_prefs() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'user_mutes'
     and (select count(*) from public.user_mutes where user_id = new.user_id) >= 2000 then
    raise exception 'Mute list is full';
  elsif tg_table_name = 'post_hides'
     and (select count(*) from public.post_hides where user_id = new.user_id) >= 2000 then
    raise exception 'Hidden list is full';
  end if;
  return new;
end $$;

drop trigger if exists trg_cap_user_mutes on public.user_mutes;
create trigger trg_cap_user_mutes before insert on public.user_mutes
  for each row execute function public.cap_flash_prefs();
drop trigger if exists trg_cap_post_hides on public.post_hides;
create trigger trg_cap_post_hides before insert on public.post_hides
  for each row execute function public.cap_flash_prefs();

-- Check: expect 2 rows.
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('user_mutes', 'post_hides');
