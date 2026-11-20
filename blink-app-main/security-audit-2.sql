-- =====================================================================
-- B-Link — READ-ONLY follow-up audit (changes nothing). Run it and paste the single
-- JSON cell back to me. It shows the pieces I could not see in the first audit.
-- =====================================================================
select jsonb_pretty(jsonb_build_object(

  'sign_up_trigger_function', (
    select pg_get_functiondef(t.tgfoid) from pg_trigger t
     where t.tgrelid = 'auth.users'::regclass and t.tgname = 'trg_handle_new_auth_user' limit 1),

  'admin_and_helper_function_sources', (
    select coalesce(jsonb_object_agg(p.proname, left(p.prosrc, 1800)), '{}'::jsonb)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('admin_ban_user', 'admin_unban_user', 'admin_change_role', 'admin_restrict_user', 'admin_unrestrict_user',
                         'admin_suspend_user', 'admin_unsuspend_user', 'admin_delete_warning', 'caller_is_admin_up', 'caller_is_blink',
                         'caller_is_moderator_up', 'is_admin', 'expire_old_payments', 'expire_old_boosts')),

  'policies_still_overlapping', (
    select coalesce(jsonb_agg(jsonb_build_object('table', tablename, 'cmd', cmd, 'policy', policyname,
              'roles', roles, 'using', left(coalesce(qual, ''), 400), 'check', left(coalesce(with_check, ''), 400))
            order by tablename, cmd, policyname), '[]'::jsonb)
      from pg_policies p
     where schemaname = 'public' and permissive = 'PERMISSIVE'
       and exists (select 1 from pg_policies q where q.schemaname = p.schemaname and q.tablename = p.tablename
                      and q.cmd = p.cmd and q.permissive = 'PERMISSIVE' and q.policyname <> p.policyname)),

  'users_table_columns', (
    select coalesce(jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type) order by ordinal_position), '[]'::jsonb)
      from information_schema.columns where table_schema = 'public' and table_name = 'users'),

  'tables_readable_by_signed_out_visitors', (
    select coalesce(jsonb_agg(distinct table_name), '[]'::jsonb)
      from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'),

  'remaining_duplicate_indexes', (
    select coalesce(jsonb_agg(jsonb_build_object('table', d.tbl, 'indexes', d.idx)), '[]'::jsonb)
      from (select i.indrelid::regclass::text as tbl, array_agg(i.indexrelid::regclass::text order by i.indexrelid) as idx
              from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
             group by i.indrelid, i.indkey::text, i.indclass::text, i.indisunique,
                      coalesce(pg_get_expr(i.indpred, i.indrelid), ''), coalesce(pg_get_expr(i.indexprs, i.indrelid), '')
            having count(*) > 1) d)

)) as audit_report_2;
