create extension if not exists pgcrypto;

create table if not exists public.participants (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  student_id text not null,
  department text not null,
  category text not null,
  quote text not null,
  bio text not null,
  title text not null,
  description text not null,
  story text not null,
  cover text not null,
  accent text not null default 'vermilion'
    check (accent in ('vermilion', 'ochre', 'olive', 'moss')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists participants_set_updated_at on public.participants;
create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

alter table public.participants enable row level security;
alter table public.admin_users enable row level security;

grant usage on schema public to anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
grant select on public.participants to anon, authenticated;
grant insert, update, delete on public.participants to authenticated;
grant select on public.admin_users to authenticated;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

drop policy if exists "Published participants are viewable by everyone" on public.participants;
create policy "Published participants are viewable by everyone"
on public.participants for select
to anon, authenticated
using (true);

drop policy if exists "Admins can create participants" on public.participants;
create policy "Admins can create participants"
on public.participants for insert
to authenticated
with check ((select public.is_site_admin()));

drop policy if exists "Admins can update participants" on public.participants;
create policy "Admins can update participants"
on public.participants for update
to authenticated
using ((select public.is_site_admin()))
with check ((select public.is_site_admin()));

drop policy if exists "Admins can delete participants" on public.participants;
create policy "Admins can delete participants"
on public.participants for delete
to authenticated
using ((select public.is_site_admin()));

drop policy if exists "Admins can view their own admin record" on public.admin_users;
create policy "Admins can view their own admin record"
on public.admin_users for select
to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artworks', 'artworks', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Artwork images are publicly viewable" on storage.objects;
create policy "Artwork images are publicly viewable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'artworks');

drop policy if exists "Admins can upload artwork images" on storage.objects;
create policy "Admins can upload artwork images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'artworks' and (select public.is_site_admin()));

drop policy if exists "Admins can update artwork images" on storage.objects;
create policy "Admins can update artwork images"
on storage.objects for update
to authenticated
using (bucket_id = 'artworks' and (select public.is_site_admin()))
with check (bucket_id = 'artworks' and (select public.is_site_admin()));

drop policy if exists "Admins can delete artwork images" on storage.objects;
create policy "Admins can delete artwork images"
on storage.objects for delete
to authenticated
using (bucket_id = 'artworks' and (select public.is_site_admin()));
