-- Reframes "group" as a full tenant/workspace: each Group ID is its own
-- isolated wedding, with its own guests and its own relations/categories.
-- Joining a group's code shares that one wedding's data; a different
-- group's code sees none of it. Replaces the "one master code sees
-- everything" model from the previous migration.
-- Run once via: supabase db query --linked --file supabase/migrations/0006_multi_tenant_groups.sql

alter table public.guests add column if not exists group_id uuid references public.access_links(id);
alter table public.relations add column if not exists group_id uuid references public.access_links(id);

-- Backfill anything that existed before groups existed. A relation whose
-- name matches an existing group's label was created by that group under
-- the old self-service flow (e.g. "rajat-marriage") — keep it there.
-- Everything else (the original default categories, and any guests) goes
-- to the bootstrap group so nothing goes orphaned/invisible.
update public.relations r set group_id = al.id
  from public.access_links al
  where r.group_id is null and al.label = r.name;

update public.relations set group_id = (select id from public.access_links where label = 'Admin (bootstrap)' limit 1)
  where group_id is null;
update public.guests set group_id = (select id from public.access_links where label = 'Admin (bootstrap)' limit 1)
  where group_id is null;

alter table public.guests alter column group_id set not null;
alter table public.relations alter column group_id set not null;

-- Category names are unique within a group, not globally — two different
-- weddings can both have a "Family" category.
alter table public.relations drop constraint if exists relations_name_key;
alter table public.relations drop constraint if exists relations_group_name_key;
alter table public.relations add constraint relations_group_name_key unique (group_id, name);

-- The roles/role_relations layer (per-category access within a shared
-- pool) is fully superseded by per-group isolation.
drop function if exists public.has_relation_access(text);
drop function if exists public.is_admin();
drop function if exists public.generate_access_code(text);
drop function if exists public.resolve_access_link(text);
alter table public.access_links drop column if exists role_id;
drop table if exists public.role_relations;
drop table if exists public.roles;

create or replace function public.resolve_access_link(p_token text)
returns table (valid boolean, group_id uuid, label text)
language sql
security definer
set search_path = public
as $$
  select (al.id is not null), al.id, al.label
  from (select 1) as _one_row
  left join public.access_links al on al.token = p_token;
$$;
grant execute on function public.resolve_access_link(text) to anon;

create or replace function public.create_group(p_label text default null)
returns table (token text, group_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_id uuid;
  v_attempts int := 0;
begin
  loop
    v_token := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    begin
      insert into public.access_links (token, label) values (v_token, p_label) returning id into v_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'Could not generate a unique code — try again.';
      end if;
    end;
  end loop;

  insert into public.relations (name, group_id) values
    ('Family', v_id), ('Friends', v_id), ('Neighbors', v_id), ('Office', v_id);

  return query select v_token, v_id;
end;
$$;
grant execute on function public.create_group(text) to anon;
