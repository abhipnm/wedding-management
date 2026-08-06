-- A brand-new group should start completely empty — no categories until
-- you actually add one via "+ Relation". The previous create_group()
-- auto-seeded Family/Friends/Neighbors/Office, which showed up as
-- unexplained relations nobody had actually added.
-- Run once via: supabase db query --linked --file supabase/migrations/0007_no_default_categories.sql

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

  return query select v_token, v_id;
end;
$$;
grant execute on function public.create_group(text) to anon;
