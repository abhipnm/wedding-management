-- Lets someone create a new group (category) themselves from the landing
-- page, instead of every group needing the admin to set it up via SQL/the
-- Table Editor first. "Join a group" needs no new backend logic — it's
-- just typing a Shared ID into the same resolve_access_link() flow that
-- already powers ?t=<token> links.
-- Run once via: supabase db query --linked --file supabase/migrations/0004_self_serve_groups.sql

create or replace function public.create_group(p_name text)
returns table (token text, relation text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_relation text := trim(p_name);
  v_role_id uuid;
  v_token text;
begin
  if v_relation = '' then
    raise exception 'Group name cannot be empty.';
  end if;

  insert into public.relations (name) values (v_relation)
    on conflict (name) do nothing;
  if not found then
    raise exception 'A group named "%" already exists — ask them for the Shared ID instead of creating a new one.', v_relation;
  end if;

  insert into public.roles (name, is_admin) values (v_relation, false)
    returning id into v_role_id;

  insert into public.role_relations (role_id, relation) values (v_role_id, v_relation);

  v_token := encode(gen_random_bytes(12), 'hex');
  insert into public.access_links (token, role_id, label) values (v_token, v_role_id, v_relation);

  return query select v_token, v_relation;
end;
$$;

grant execute on function public.create_group(text) to anon;
