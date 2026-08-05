-- Login-based RBAC: guests/relations become visible only to signed-in users
-- who've been granted a role, and each role only sees the relations
-- (categories) it's been given. Replaces the old anon-open policies.
-- Run once via: supabase db query --linked --file supabase/migrations/0002_rbac.sql

drop policy if exists "anon can read guests" on public.guests;
drop policy if exists "anon can insert guests" on public.guests;
drop policy if exists "anon can update guests" on public.guests;
drop policy if exists "anon can delete guests" on public.guests;

drop policy if exists "anon can read relations" on public.relations;
drop policy if exists "anon can insert relations" on public.relations;
drop policy if exists "anon can delete relations" on public.relations;

-- A named permission set. is_admin = sees/edits every relation, no
-- role_relations rows needed.
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Which relations/categories a role can see and edit guests in.
create table if not exists public.role_relations (
  role_id uuid not null references public.roles(id) on delete cascade,
  relation text not null,
  primary key (role_id, relation)
);

-- Which roles an email address has. Keyed by email (not auth.users.id) so
-- you can grant access before someone has ever signed in — add a row here
-- with their email and the first magic-link sign-in just works.
create table if not exists public.user_roles (
  email text not null,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (email, role_id)
);

alter table public.roles enable row level security;
alter table public.role_relations enable row level security;
alter table public.user_roles enable row level security;

-- security definer: these read across the permission tables regardless of
-- the calling user's own row access, which is what lets a plain RLS
-- `using (...)` clause call them safely.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email', '')) and r.is_admin
  );
$$;

create or replace function public.has_relation_access(p_relation text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1
    from public.user_roles ur
    join public.role_relations rr on rr.role_id = ur.role_id
    where lower(ur.email) = lower(coalesce(auth.jwt()->>'email', '')) and rr.relation = p_relation
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_relation_access(text) to authenticated;

-- Guests: only visible/editable within a signed-in user's permitted relations.
drop policy if exists "select guests by relation" on public.guests;
create policy "select guests by relation" on public.guests
  for select to authenticated using (public.has_relation_access(relation));
drop policy if exists "insert guests by relation" on public.guests;
create policy "insert guests by relation" on public.guests
  for insert to authenticated with check (public.has_relation_access(relation));
drop policy if exists "update guests by relation" on public.guests;
create policy "update guests by relation" on public.guests
  for update to authenticated using (public.has_relation_access(relation)) with check (public.has_relation_access(relation));
drop policy if exists "delete guests by relation" on public.guests;
create policy "delete guests by relation" on public.guests
  for delete to authenticated using (public.has_relation_access(relation));

-- Relations: you only see the categories you have access to; only admins
-- can create/remove categories themselves (everyone else picks from what
-- they've been granted).
drop policy if exists "select permitted relations" on public.relations;
create policy "select permitted relations" on public.relations
  for select to authenticated using (public.has_relation_access(name));
drop policy if exists "admin can insert relations" on public.relations;
create policy "admin can insert relations" on public.relations
  for insert to authenticated with check (public.is_admin());
drop policy if exists "admin can delete relations" on public.relations;
create policy "admin can delete relations" on public.relations
  for delete to authenticated using (public.is_admin());

-- roles/role_relations/user_roles are managed by you directly in the
-- Supabase table editor, not through the app — admin-only read access,
-- purely so a curious authenticated user can't browse the permission model.
drop policy if exists "admin can read roles" on public.roles;
create policy "admin can read roles" on public.roles
  for select to authenticated using (public.is_admin());
drop policy if exists "admin can read role_relations" on public.role_relations;
create policy "admin can read role_relations" on public.role_relations
  for select to authenticated using (public.is_admin());
drop policy if exists "admin can read user_roles" on public.user_roles;
create policy "admin can read user_roles" on public.user_roles
  for select to authenticated using (public.is_admin());

-- Bootstrap: make the account owner an admin so this migration doesn't
-- lock everyone out of their own data.
insert into public.roles (name, is_admin) values ('Admin', true)
  on conflict (name) do nothing;
insert into public.user_roles (email, role_id)
  select 'rajat1pnm@gmail.com', id from public.roles where name = 'Admin'
  on conflict do nothing;
