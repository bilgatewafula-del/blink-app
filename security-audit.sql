-- =====================================================================
-- B-Link — READ-ONLY database audit. Changes nothing.
-- Run in the Supabase SQL Editor. It returns ONE cell of JSON: copy that
-- cell and paste it to me so I can review your real structure and policies.
-- =====================================================================
select jsonb_pretty(jsonb_build_object(

  'postgres_version', (select version()),

  'tables_without_rls', (
    select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),

  'anon_can_write_tables', (
    select coalesce(jsonb_agg(distinct table_name || ':' || privilege_type), '[]'::jsonb)
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),

  'definer_functions_callable_by_anon', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.proname), '[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('anon', p.oid, 'execute')),

  'definer_functions_without_an_auth_check', (
    select coalesce(jsonb_agg(jsonb_build_object('fn', p.oid::regprocedure::text,
              'anon', has_function_privilege('anon', p.oid, 'execute'),
              'authenticated', has_function_privilege('authenticated', p.oid, 'execute'))
            order by p.proname), '[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
       and p.prosrc !~* 'auth\.uid\(\)|auth\.role\(\)|_my_role\(\)|current_user|session_user'),

  'definer_functions_without_search_path', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.proname), '[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))),

  'invoker_functions_touching_money_or_status', (
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.proname), '[]'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
       and p.prosrc ~* 'coins_balance|subscription_|coin_transactions|payments|is_verified|followers_count'),

  'write_policies_that_look_too_broad', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd,
              'roles', roles, 'using', left(coalesce(qual, ''), 140), 'check', left(coalesce(with_check, ''), 140))
            order by tablename, policyname), '[]'::jsonb)
      from pg_policies
     where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and permissive = 'PERMISSIVE'
       and (coalesce(qual, 'true') in ('true', '(true)') or coalesce(with_check, 'true') in ('true', '(true)')
            or (coalesce(qual, '') !~* 'auth\.|_my_role|_role_rank' and coalesce(with_check, '') !~* 'auth\.|_my_role|_role_rank'))),

  'tables_with_overlapping_permissive_policies', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'cmd', cmd, 'count', n, 'policies', names)
            order by n desc, tablename), '[]'::jsonb)
      from (select tablename, cmd, count(*) as n, jsonb_agg(policyname order by policyname) as names
              from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
             group by tablename, cmd having count(*) > 1) x),

  'duplicate_indexes', (
    select coalesce(jsonb_agg(jsonb_build_object('table', d.tbl, 'indexes', d.idx)), '[]'::jsonb)
      from (select i.indrelid::regclass::text as tbl, array_agg(i.indexrelid::regclass::text order by i.indexrelid) as idx
              from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
             group by i.indrelid, i.indkey::text, i.indclass::text,
                      coalesce(pg_get_expr(i.indpred, i.indrelid), ''), coalesce(pg_get_expr(i.indexprs, i.indrelid), '')
            having count(*) > 1) d),

  'unused_indexes_not_unique', (
    select coalesce(jsonb_agg(jsonb_build_object('index', s.indexrelname, 'table', s.relname,
              'size', pg_size_pretty(pg_relation_size(s.indexrelid))) order by pg_relation_size(s.indexrelid) desc), '[]'::jsonb)
      from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
     where s.schemaname = 'public' and s.idx_scan = 0 and not i.indisunique and not i.indisprimary),

  'foreign_keys_still_without_index', (
    select coalesce(jsonb_agg(c.conrelid::regclass::text || '(' || a.attname || ')'), '[]'::jsonb)
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
       and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])),

  'triggers_on_auth_users', (
    select coalesce(jsonb_agg(tgname), '[]'::jsonb) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal),

  'biggest_tables', (
    select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb)
      from (select c.relname as "table", c.reltuples::bigint as rows_estimate,
                   pg_size_pretty(pg_total_relation_size(c.oid)) as size, pg_total_relation_size(c.oid) as bytes
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r'
             order by pg_total_relation_size(c.oid) desc limit 12) t),

  'scheduled_jobs', (
    select case when to_regclass('cron.job') is null then '"pg_cron not installed"'::jsonb
           else (select coalesce(jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule)), '[]'::jsonb) from cron.job) end)

)) as audit_report;
