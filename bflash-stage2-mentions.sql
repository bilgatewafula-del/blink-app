-- =====================================================================
-- B-FLASH STAGE 2  |  Real @mention notifications for posts and videos
-- Run ONCE in Supabase Dashboard > SQL Editor. Safe to re-run.
--
-- When someone publishes (or edits) a caption containing @username, that
-- person gets a "mention" notification. Your notification settings still
-- apply (notif_mentions). Limits, enforced here in the database:
--   - at most 5 people notified per post
--   - at most 30 mention notifications per sender per 24 hours
--   - nobody is notified if either side has blocked the other
--   - private posts notify nobody; followers-only posts notify only followers
--   - editing a caption only notifies people who were NOT already mentioned
-- Publishing never fails because of a notification problem.
-- (Comment mentions are already handled by your add_comment function.)
-- =====================================================================

create or replace function public.notify_post_mentions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  daily_cap  constant int := 30;
  per_post   constant int := 5;
  old_names  text[] := '{}';
  uname      text;
  target     uuid;
  sent       int := 0;
  today      int;
  msg        text;
begin
  if new.caption is null or new.caption = '' then return null; end if;
  if coalesce(new.is_draft, false) or coalesce(new.audience, 'public') = 'private'
     or coalesce(new.status, '') in ('deleted', 'hidden') then return null; end if;
  if tg_op = 'UPDATE' and old.caption is not distinct from new.caption then return null; end if;

  if tg_op = 'UPDATE' and old.caption is not null then
    select coalesce(array_agg(n), '{}') into old_names
      from (select distinct lower((regexp_matches(old.caption, '@([A-Za-z0-9_]{3,20})', 'g'))[1]) as n) q;
  end if;

  select count(*) into today from public.notifications
   where from_user_id = new.user_id and type = 'mention' and created_at > now() - interval '24 hours';

  msg := case when new.video_url is not null then 'mentioned you in a video' else 'mentioned you in a post' end;

  for uname in
    select distinct lower((regexp_matches(new.caption, '@([A-Za-z0-9_]{3,20})', 'g'))[1])
  loop
    exit when sent >= per_post or today + sent >= daily_cap;
    continue when uname = any (old_names);

    select id into target from public.users where lower(username) = uname;
    continue when target is null or target = new.user_id;

    continue when exists (
      select 1 from public.blocks b
       where (b.blocker_id = new.user_id and b.blocked_id = target)
          or (b.blocker_id = target and b.blocked_id = new.user_id));

    continue when new.audience = 'followers' and not exists (
      select 1 from public.follows f where f.follower_id = target and f.following_id = new.user_id);

    insert into public.notifications (user_id, from_user_id, type, message, ref_id, preview_text, is_read)
    values (target, new.user_id, 'mention', msg, new.id, left(new.caption, 60), false);
    sent := sent + 1;
  end loop;
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists trg_notify_post_mentions on public.posts;
create trigger trg_notify_post_mentions
  after insert or update of caption on public.posts
  for each row execute function public.notify_post_mentions();

-- Check: this should return one row.
select tgname, tgenabled from pg_trigger where tgname = 'trg_notify_post_mentions';
