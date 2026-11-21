-- B-Link App Hub Stage 1: owner-only app catalogue and APK storage.
-- The migration has already been applied to the existing B-Link Supabase project.
-- Owner UUID: 72205c69-2a8c-4665-8d35-944d44f553fb

begin;

create table if not exists public.apphub_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  description text not null default '',
  version text not null,
  version_code integer not null default 1 check (version_code > 0),
  package_name text,
  icon_url text,
  screenshots jsonb not null default '[]'::jsonb,
  apk_path text not null,
  apk_sha256 text,
  file_size bigint not null default 0 check (file_size >= 0),
  published boolean not null default false,
  downloads bigint not null default 0 check (downloads >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.apphub_apps enable row level security;
drop policy if exists apphub_public_read_published on public.apphub_apps;
create policy apphub_public_read_published on public.apphub_apps for select to anon, authenticated
using (published or auth.uid() = '72205c69-2a8c-4665-8d35-944d44f553fb'::uuid);
drop policy if exists apphub_owner_manage on public.apphub_apps;
create policy apphub_owner_manage on public.apphub_apps for all to authenticated
using (auth.uid() = '72205c69-2a8c-4665-8d35-944d44f553fb'::uuid)
with check (auth.uid() = '72205c69-2a8c-4665-8d35-944d44f553fb'::uuid);
grant select on public.apphub_apps to anon, authenticated;
grant insert, update, delete on public.apphub_apps to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('apphub-apks','apphub-apks',true,314572800,array['application/vnd.android.package-archive','application/octet-stream'])
on conflict (id) do update set public=true,file_size_limit=314572800,allowed_mime_types=array['application/vnd.android.package-archive','application/octet-stream'];

drop policy if exists apphub_public_download on storage.objects;
create policy apphub_public_download on storage.objects for select to anon,authenticated using (bucket_id='apphub-apks');
drop policy if exists apphub_owner_upload on storage.objects;
create policy apphub_owner_upload on storage.objects for insert to authenticated with check (bucket_id='apphub-apks' and auth.uid()='72205c69-2a8c-4665-8d35-944d44f553fb'::uuid);
drop policy if exists apphub_owner_update on storage.objects;
create policy apphub_owner_update on storage.objects for update to authenticated using (bucket_id='apphub-apks' and auth.uid()='72205c69-2a8c-4665-8d35-944d44f553fb'::uuid) with check (bucket_id='apphub-apks' and auth.uid()='72205c69-2a8c-4665-8d35-944d44f553fb'::uuid);
drop policy if exists apphub_owner_delete on storage.objects;
create policy apphub_owner_delete on storage.objects for delete to authenticated using (bucket_id='apphub-apks' and auth.uid()='72205c69-2a8c-4665-8d35-944d44f553fb'::uuid);

create or replace function public.apphub_count_download(app_id uuid)
returns void language sql security definer set search_path=pg_catalog,public as $$
  update public.apphub_apps set downloads=downloads+1,updated_at=now() where id=app_id and published=true;
$$;
revoke all on function public.apphub_count_download(uuid) from public;
grant execute on function public.apphub_count_download(uuid) to anon,authenticated;

commit;
