-- Replaces login/magic-link auth with a simpler "share a link" model,
-- matching the trade-off already used elsewhere in this account: whoever
-- has the link sees what it's scoped to, no accounts, no sign-in step.
-- Run once via: supabase db query --linked --file supabase/migrations/0003_link_based_access.sql

-- Drop the authenticated-only policies from 0002 — there's no login anymore.
drop policy if exists "select guests by relation" on public.guests;
drop policy if exists "insert guests by relation" on public.guests;
drop policy if exists "update guests by relation" on public.guests;
drop policy if exists "delete guests by relation" on public.guests;
drop policy if exists "select permitted relations" on public.relations;
drop policy if exists "admin can insert relations" on public.relations;
drop policy if exists "admin can delete relations" on public.relations;
drop policy if exists "admin can read roles" on public.roles;
drop policy if exists "admin can read role_relations" on public.role_relations;
drop policy if exists "admin can read user_roles" on public.user_roles;
drop function if exists public.is_admin();
drop function if exists public.has_relation_access(text);
drop table if exists public.user_roles;

-- Guests + relations are back to open access — anyone with the anon key
-- (i.e. anyone with the app open) can read/write them. What a given
-- shared link actually shows is enforced client-side by which relations
-- that link's token is scoped to, not by the database.
drop policy if exists "anon can read guests" on public.guests;
create policy "anon can read guests" on public.guests
  for select to anon using (true);
drop policy if exists "anon can insert guests" on public.guests;
create policy "anon can insert guests" on public.guests
  for insert to anon with check (true);
drop policy if exists "anon can update guests" on public.guests;
create policy "anon can update guests" on public.guests
  for update to anon using (true) with check (true);
drop policy if exists "anon can delete guests" on public.guests;
create policy "anon can delete guests" on public.guests
  for delete to anon using (true);

drop policy if exists "anon can read relations" on public.relations;
create policy "anon can read relations" on public.relations
  for select to anon using (true);
drop policy if exists "anon can insert relations" on public.relations;
create policy "anon can insert relations" on public.relations
  for insert to anon with check (true);
drop policy if exists "anon can delete relations" on public.relations;
create policy "anon can delete relations" on public.relations
  for delete to anon using (true);

-- roles / role_relations stay as the definition of "what a link can see"
-- (name + which relations it grants, or is_admin for "everything"). No
-- anon policies on these at all — they're managed by you directly via
-- `supabase db query` / the Table Editor, never queried straight from the
-- app, so leaving them policy-less means anon has zero access to them.

-- access_links: one row per shareable URL. `token` is the random secret
-- that goes in the URL query string (?t=<token>).
create table if not exists public.access_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  role_id uuid not null references public.roles(id) on delete cascade,
  label text,
  created_at timestamptz not null default now()
);
alter table public.access_links enable row level security;
-- No anon policies here either — a link's token is a secret, so the table
-- listing every token must never be directly selectable. The only way to
-- use a token is through resolve_access_link below.

-- The one function the app actually calls: given a token, what can it see?
-- Always returns exactly one row, even for an unknown token (valid=false),
-- so the client doesn't have to special-case "no rows".
create or replace function public.resolve_access_link(p_token text)
returns table (valid boolean, is_admin boolean, relations text[])
language sql
security definer
set search_path = public
as $$
  select
    (al.id is not null) as valid,
    coalesce(r.is_admin, false) as is_admin,
    coalesce(array_agg(rr.relation) filter (where rr.relation is not null), '{}') as relations
  from (select 1) as _one_row
  left join public.access_links al on al.token = p_token
  left join public.roles r on r.id = al.role_id
  left join public.role_relations rr on rr.role_id = r.id
  group by al.id, r.is_admin;
$$;
grant execute on function public.resolve_access_link(text) to anon;

-- Bootstrap: an admin link so you have one immediately after this runs.
-- Prints nothing itself — the token is read back out right after this
-- migration is applied.
insert into public.roles (name, is_admin) values ('Admin', true)
  on conflict (name) do nothing;
insert into public.access_links (token, role_id, label)
select encode(gen_random_bytes(12), 'hex'), id, 'Admin (bootstrap)'
from public.roles where name = 'Admin'
on conflict do nothing;
