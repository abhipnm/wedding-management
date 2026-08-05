-- Run this once in Supabase → SQL Editor → New query → Run
-- (or via: supabase db query --linked --file supabase/schema.sql)
-- Creates the guests table and the (auth-free) row-level-security
-- policies the app needs.

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  address text default '',
  relation text default '',
  rsvp text not null default 'Pending',
  guest_count text default '',
  card_sent text not null default 'No',
  invited_barat text not null default 'No',
  invited_reception text not null default 'No',
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.guests enable row level security;

-- No accounts/login in this app — it's a private single-user planning
-- tool, so the anon (public) key gets full read/write on this one table.
-- Same trade-off nikita-birthday's schema makes, scoped to just `guests`.
--
-- `drop policy if exists` first so this script can safely be re-run.
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
