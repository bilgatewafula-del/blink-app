-- READ-ONLY. Optional last review: the signed-in-callable SECURITY DEFINER functions I have not read.
-- Run it, copy the single JSON cell and paste it to me. Changes nothing.
select jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
         'fn', p.oid::regprocedure::text,
         'checks_caller', (p.prosrc ~* 'auth\.uid\(\)|_my_role\(\)|caller_is_|caller_role\(\)|is_admin\(\)'),
         'source_start', left(regexp_replace(p.prosrc, '\s+', ' ', 'g'), 450)
       ) order by p.proname), '[]'::jsonb)) as definer_functions_for_review
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
   and has_function_privilege('authenticated', p.oid, 'execute')
   and p.proname !~ '^(admin_|caller_is_|get_story_feed|story_|get_post_|add_comment|edit_comment|hide_comment|pin_comment|toggle_comment_like|post_insights|record_post_share|schedule_message|cancel_scheduled|deliver_due|set_presence|submit_support|get_my_private|delete_own_comment|toggle_post_save|username_available|complete_profile|create_story|delete_story|are_friends|_my_role|_role_rank)';
