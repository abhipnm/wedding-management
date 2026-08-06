-- Simplifies the group model per clarification: there's one group, not
-- many scoped ones. A short numeric code (e.g. 482913) is the only
-- "login" the app has — anyone with a valid code gets full access to
-- every category. Categories/relations still exist for organizing guests,
-- they just no longer gate who can see what.
-- Run once via: supabase db query --linked --file supabase/migrations/0005_master_code.sql

-- Superseded by generate_access_code below — self-service used to create
-- a brand new scoped category+group; now every code just grants full
-- access, so there's nothing left to scope.
drop function if exists public.create_group(text);

create or replace function public.generate_access_code(p_label text default null)
returns table (token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role_id uuid;
  v_token text;
  v_attempts int := 0;
begin
  select id into v_role_id from public.roles where name = 'Admin';
  if v_role_id is null then
    raise exception 'Master role not found — contact the admin.';
  end if;

  loop
    v_token := lpad((floor(random() * 900000) + 100000)::text, 6, '0');
    begin
      insert into public.access_links (token, role_id, label) values (v_token, v_role_id, p_label);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 10 then
        raise exception 'Could not generate a unique code — try again.';
      end if;
    end;
  end loop;

  return query select v_token;
end;
$$;

grant execute on function public.generate_access_code(text) to anon;
