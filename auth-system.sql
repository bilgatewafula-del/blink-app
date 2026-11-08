-- =====================================================================
-- B-Link — authentication backend (safe to run more than once)
-- Run in: Supabase dashboard -> SQL Editor -> New query -> Run
-- What it does:
--   1. Creates the profile on the SERVER when an account is verified
--      (no more "not created" errors, no profiles for unverified spam).
--   2. Blocks disposable email domains at the database.
--   3. Username availability + "complete profile" functions.
--   4. Auth hook: ends sessions after long inactivity and refuses new
--      sessions to banned / suspended accounts.
--   5. Cleans out never-verified accounts, and kills sessions on ban.
-- After running it, do the dashboard steps in the setup guide (hook!).
-- =====================================================================

-- 1. helpers ----------------------------------------------------------
create or replace function public._valid_username(p text)
returns boolean language sql immutable as $$
  select p ~ '^[a-z0-9_]{3,20}$'
     and p !~ '^[0-9_]+$'
     and p not in ('admin','administrator','root','support','help','system','staff','moderator','mod','owner','official',
                   'blink','b-link','blinkapp','blinkofficial','blinkteam','blinkhq','security','abuse','null','undefined',
                   'api','www','mail','postmaster','billing','payments','wallet','verify','verified','team','ceo')
$$;

-- 2. usernames: one per person, any letter case -------------------------------
do $$ begin
  create unique index if not exists users_username_lower_uidx on public.users (lower(username));
exception when others then
  raise notice 'Could not enforce unique usernames: duplicates exist. Fix them, then run this script again. (%)', sqlerrm;
end $$;

create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select public._valid_username(lower(btrim(p_username)))
     and not exists (select 1 from public.users u where lower(u.username) = lower(btrim(p_username)))
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- 3. disposable email domains --------------------------------------------------
create table if not exists public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;   -- no policies: only the trigger reads it

insert into public.blocked_email_domains (domain)
select unnest(string_to_array(
 'mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org sharklasers.com grr.la 10minutemail.com 10minutemail.net ' ||
 'tempmail.com temp-mail.org temp-mail.io tempmailo.com tempail.com tempr.email yopmail.com yopmail.net yopmail.fr trashmail.com ' ||
 'trashmail.net trashmail.io getnada.com nada.email dispostable.com maildrop.cc fakeinbox.com throwawaymail.com mintemail.com ' ||
 'mohmal.com emailondeck.com spamgourmet.com moakt.com burnermail.io mailnesia.com inboxkitten.com discard.email discardmail.com ' ||
 'mailcatch.com mytemp.email mailtemp.net tmpmail.org tmpmail.net tmails.net throwam.com mail-temp.com spambox.us spam4.me ' ||
 'fakemail.net fakemailgenerator.com emailfake.com email-fake.com crazymailing.com cuvox.de dayrep.com einrot.com fleckens.hu ' ||
 'gustr.com jourrapide.com rhyta.com superrito.com teleworm.us armyspy.com cool.fr.nf jetable.org nospam.ze.tc mailforspam.com ' ||
 'harakirimail.com 33mail.com anonbox.net byom.de dropmail.me emlhub.com mailpoof.com minuteinbox.com luxusmail.org ' ||
 'tempinbox.com spamex.com gettempmail.com one-time.email owlymail.com sogetthis.com wegwerfmail.de wegwerfmail.net ' ||
 'yoggm.com vomoto.com mvrht.com tmail.ws tmailor.com getairmail.com inboxbear.com nowmymail.com trbvm.com', ' '))
on conflict do nothing;

create or replace function public.zz_block_disposable_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (
       select 1 from public.blocked_email_domains d where d.domain = lower(split_part(new.email, '@', 2))) then
    raise exception 'Disposable email addresses are not allowed' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists zz_block_disposable_email on auth.users;
create trigger zz_block_disposable_email before insert on auth.users
for each row execute function public.zz_block_disposable_email();

-- 4. create the profile when the account is VERIFIED --------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname text := lower(btrim(coalesce(meta ->> 'username', '')));
  dname text := left(btrim(coalesce(meta ->> 'display_name', '')), 40);
  ctry  text := upper(left(btrim(coalesce(meta ->> 'country', 'KE')), 5));
begin
  -- unverified sign-ups get NO profile (keeps spam out of search and Discover)
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then return new; end if;
  if exists (select 1 from public.users where id = new.id) then return new; end if;

  -- no usable name/username yet (or taken): the app asks for them ("complete profile")
  if dname = '' or not public.username_available(uname) then return new; end if;

  begin
    insert into public.users (id, email, display_name, username, country, role, is_banned, is_restricted, followers_count, posts_count)
    values (new.id, new.email, dname, uname, ctry, 'user', false, false, 0, 0);
  exception when others then
    begin  -- some schemas require an email: use a harmless placeholder for phone-only accounts
      insert into public.users (id, email, display_name, username, country, role, is_banned, is_restricted, followers_count, posts_count)
      values (new.id, coalesce(new.email, 'p' || replace(new.id::text, '-', '') || '@phone.invalid'), dname, uname, ctry, 'user', false, false, 0, 0);
    exception when others then
      raise warning 'handle_new_user: profile not created for %: %', new.id, sqlerrm;
    end;
  end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
after update of email_confirmed_at, phone_confirmed_at on auth.users
for each row
when ((old.email_confirmed_at is null and new.email_confirmed_at is not null)
   or (old.phone_confirmed_at is null and new.phone_confirmed_at is not null))
execute function public.handle_new_user();

-- show any OTHER triggers on auth.users so you can check nothing creates profiles twice
do $$
declare t record;
begin
  for t in select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal loop
    raise notice 'trigger on auth.users: %', t.tgname;
  end loop;
end $$;

-- 5. the fallback the app uses when a verified user has no profile ------------
create or replace function public.complete_profile(p_username text, p_display_name text, p_country text default 'KE')
returns void language plpgsql security definer set search_path = public as $$
declare
  au record;
  uname text := lower(btrim(coalesce(p_username, '')));
  dname text := left(btrim(coalesce(p_display_name, '')), 40);
  ctry  text := upper(left(btrim(coalesce(p_country, 'KE')), 5));
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  select email, phone, email_confirmed_at, phone_confirmed_at into au from auth.users where id = auth.uid();
  if au.email_confirmed_at is null and au.phone_confirmed_at is null then raise exception 'Verify your account first' using errcode = '42501'; end if;
  if exists (select 1 from public.users where id = auth.uid()) then raise exception 'Profile already exists'; end if;
  if char_length(dname) < 2 then raise exception 'Enter your name'; end if;
  if not public._valid_username(uname) then raise exception 'That username is not allowed'; end if;
  if exists (select 1 from public.users where lower(username) = uname) then raise exception 'Username taken'; end if;

  begin
    insert into public.users (id, email, display_name, username, country, role, is_banned, is_restricted, followers_count, posts_count)
    values (auth.uid(), au.email, dname, uname, ctry, 'user', false, false, 0, 0);
  exception when unique_violation then
    raise exception 'Username taken';
  when not_null_violation then
    insert into public.users (id, email, display_name, username, country, role, is_banned, is_restricted, followers_count, posts_count)
    values (auth.uid(), coalesce(au.email, 'p' || replace(auth.uid()::text, '-', '') || '@phone.invalid'), dname, uname, ctry, 'user', false, false, 0, 0);
  end;
end $$;
grant execute on function public.complete_profile(text, text, text) to authenticated;

-- 6. inactivity + suspension enforced by the SERVER ---------------------------
create table if not exists public.auth_policy (
  id              int primary key default 1 check (id = 1),
  inactivity_days int not null default 30 check (inactivity_days between 1 and 365)
);
insert into public.auth_policy (id) values (1) on conflict do nothing;
alter table public.auth_policy enable row level security;

create table if not exists public.user_activity (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table public.user_activity enable row level security;

create or replace function public.blink_access_token_hook(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  method text;
  days int;
  last_at timestamptz;
  blocked boolean;
begin
  uid := (event ->> 'user_id')::uuid;
  method := replace(coalesce(event ->> 'authentication_method', ''), '"', '');

  select (u.is_banned is true) or (u.suspended_until is not null and u.suspended_until > now())
    into blocked from public.users u where u.id = uid;
  if coalesce(blocked, false) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'This account is suspended.'));
  end if;

  if method = 'token_refresh' then
    select p.inactivity_days into days from public.auth_policy p where p.id = 1;
    select a.last_active_at into last_at from public.user_activity a where a.user_id = uid;
    if last_at is not null and days is not null and last_at < now() - make_interval(days => days) then
      return jsonb_build_object('error', jsonb_build_object('http_code', 401,
        'message', 'Session expired because of inactivity. Please sign in again.'));
    end if;
  end if;

  insert into public.user_activity (user_id, last_active_at) values (uid, now())
  on conflict (user_id) do update set last_active_at = excluded.last_active_at;

  return event;
exception when others then
  return event;   -- never lock everybody out because of a bug here
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.blink_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.blink_access_token_hook(jsonb) from authenticated, anon, public;

-- a ban or suspension also ends every open session straight away
create or replace function public.zz_revoke_sessions_on_ban()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin delete from auth.sessions where user_id = new.id; exception when others then null; end;
  return null;
end $$;

drop trigger if exists zz_revoke_sessions_on_ban on public.users;
create trigger zz_revoke_sessions_on_ban
after update of is_banned, suspended_until on public.users
for each row
when (new.is_banned is true or (new.suspended_until is not null and new.suspended_until > now()))
execute function public.zz_revoke_sessions_on_ban();

-- 7. spam clean-up: accounts that never verified ------------------------------------
create or replace function public.purge_unconfirmed_accounts(p_days int default 3)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is not null and coalesce((select role from public.users where id = auth.uid()), '') <> 'blink' then
    raise exception 'Only the B-Link owner can run this' using errcode = '42501';
  end if;

  delete from public.users u
   using auth.users a
   where a.id = u.id and a.email_confirmed_at is null and a.phone_confirmed_at is null
     and a.created_at < now() - make_interval(days => greatest(p_days, 1));

  delete from auth.users
   where email_confirmed_at is null and phone_confirmed_at is null
     and coalesce(is_anonymous, false) = false
     and created_at < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.purge_unconfirmed_accounts(int) to authenticated;

do $$ begin
  begin create extension if not exists pg_cron; exception when others then null; end;
  begin
    perform cron.schedule('blink-purge-unverified', '30 3 * * *', 'select public.purge_unconfirmed_accounts(3)');
  exception when others then raise notice 'pg_cron not available: run select public.purge_unconfirmed_accounts(3); now and then';
  end;
end $$;

-- the clean-up job is for the database scheduler / owner only
do $$ begin
  revoke execute on function public.purge_unconfirmed_accounts(integer) from public, anon, authenticated;
exception when others then raise notice 'permission cleanup: %', sqlerrm; end $$;
