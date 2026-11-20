-- =====================================================================
-- B-FLASH STAGE 1  |  Fix: "permission denied for table users" when publishing
-- Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- WHY IT HAPPENS
--   final-fixes.sql removed table-wide SELECT on public.users from signed-in
--   users and left only public columns (posts_today, coins_balance, ... are
--   private). Publishing a post fires database triggers (daily post limit,
--   duplicate check, rate limit, follower notifications). Those triggers are
--   not in the repo's .sql files, so they live only in your live database.
--   Any of them that runs as the signed-in user (SECURITY INVOKER) and reads
--   or updates public.users now fails with this exact error.
--
-- WHAT THIS DOES (no security is switched off)
--   1. Looks at YOUR live database for trigger functions on public.posts and
--      public.notifications that are SECURITY INVOKER and mention "users".
--   2. Makes only those functions SECURITY DEFINER with a fixed search_path,
--      the same model your other server functions already use.
--      Functions that check current_user (your insert/update guards) are never touched.
--   3. Returns a report so you can see exactly what exists and what changed.
--   RLS stays ON. users is NOT opened up. No service key is used.
-- =====================================================================

do $$
declare r record;
begin
  for r in
    select distinct p.oid, p.oid::regprocedure as sig
      from pg_trigger t
      join pg_class c      on c.oid = t.tgrelid
      join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public'
      join pg_proc p       on p.oid = t.tgfoid
      join pg_namespace pn on pn.oid = p.pronamespace and pn.nspname = 'public'
     where not t.tgisinternal
       and c.relname in ('posts', 'notifications')
       and not p.prosecdef
       and p.prosrc ~* '\musers\M'
       and p.prosrc !~* 'current_user|session_user'
  loop
    execute format('alter function %s security definer set search_path = public, pg_temp', r.sig);
    raise notice 'Made SECURITY DEFINER: %', r.sig;
  end loop;
end $$;

-- REPORT: send me this result grid if publishing still fails.
select 'trigger' as kind,
       c.relname::text                         as on_table,
       t.tgname::text                          as name,
       p.proname::text                         as function_name,
       case when p.prosecdef then 'definer' else 'INVOKER' end as runs_as,
       (p.prosrc ~* '\musers\M')               as mentions_users,
       (p.prosrc ~* 'current_user|session_user') as uses_current_user
  from pg_trigger t
  join pg_class c      on c.oid = t.tgrelid
  join pg_namespace cn on cn.oid = c.relnamespace and cn.nspname = 'public'
  join pg_proc p       on p.oid = t.tgfoid
 where not t.tgisinternal and c.relname in ('posts', 'notifications')
union all
select 'policy', pol.tablename::text, pol.policyname::text, pol.cmd::text,
       null, (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) ~* '\musers\M', null
  from pg_policies pol
 where pol.schemaname = 'public' and pol.tablename in ('posts', 'notifications')
   and (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) ~* '\musers\M'
order by 1, 2, 3;
