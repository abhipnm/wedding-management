-- Adds a managed list of relations/categories (Family, Friends, ...) so the
-- guest form can offer a real dropdown instead of free text.
-- Run once via: supabase db query --linked --file supabase/migrations/0001_relations.sql

create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.relations enable row level security;

drop policy if exists "anon can read relations" on public.relations;
create policy "anon can read relations" on public.relations
  for select to anon using (true);

drop policy if exists "anon can insert relations" on public.relations;
create policy "anon can insert relations" on public.relations
  for insert to anon with check (true);

drop policy if exists "anon can delete relations" on public.relations;
create policy "anon can delete relations" on public.relations
  for delete to anon using (true);

insert into public.relations (name)
values ('Family'), ('Friends'), ('Neighbors'), ('Office')
on conflict (name) do nothing;
