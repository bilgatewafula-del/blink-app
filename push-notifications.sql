-- =====================================================================
-- B-Link — PUSH NOTIFICATIONS
-- Safe to run more than once. Run in Supabase → SQL Editor.
-- =====================================================================

-- 1. One row per device that has push switched on ------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- people can see and remove only their own devices. Nobody can insert or update directly:
-- registering a device goes through register_push_subscription() below.
drop policy if exists push_subs_select_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- 2. Registering a device --------------------------------------------------------------------
-- A phone that was used by someone else is MOVED to the person signed in now, so the previous
-- owner stops receiving alerts on it. Each person keeps at most 8 devices.
create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 20 and 200
     or coalesce(length(p_auth), 0)   not between 8 and 100 then
    raise exception 'Invalid subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();

  delete from public.push_subscriptions
   where user_id = uid
     and id not in (select id from public.push_subscriptions where user_id = uid order by last_seen_at desc limit 8);
end $$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant  execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- 3. Quiet hours (the other notification switches already exist in user_settings) --------------
do $$
begin
  alter table public.user_settings add column if not exists quiet_hours boolean not null default false;
  alter table public.user_settings add column if not exists quiet_start text    not null default '22:00';
  alter table public.user_settings add column if not exists quiet_end   text    not null default '07:00';
  alter table public.user_settings add column if not exists timezone    text    not null default 'Africa/Nairobi';
  alter table public.user_settings drop constraint if exists user_settings_quiet_check;
  alter table public.user_settings add constraint user_settings_quiet_check
    check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           and length(timezone) between 1 and 64);
exception when others then raise notice 'quiet hours columns: %', sqlerrm;
end $$;

-- 4. SENDING: connect new notifications to the push sender --------------------------------------
-- Easiest: Supabase Dashboard → Database → Webhooks → Create a new hook
--    Table: notifications     Events: Insert     Type: HTTP Request
--    Method: POST             URL: https://YOUR-DOMAIN/api/send-push
--    HTTP Headers:  Content-Type: application/json
--                   Authorization: Bearer <the same value as PUSH_WEBHOOK_SECRET on Vercel>
-- (Notifications that a person has switched off never reach this point, because the
--  zz_notifications_prefs trigger already drops them before they are saved.)
