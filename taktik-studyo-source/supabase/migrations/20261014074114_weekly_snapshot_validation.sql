-- UX4: reject null/malformed fields deterministically; no data or grant changes.
begin;
create or replace function tactics_private.weekly_snapshot_valid(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; i integer := 0; seen text[] := '{}'; pid text;
begin
  if jsonb_typeof(value) is distinct from 'object' or not (value ?& array['version','formation','slots'])
    or value->'version' is distinct from '2'::jsonb or jsonb_typeof(value->'slots') is distinct from 'array'
    or jsonb_array_length(value->'slots') <> 11 or octet_length(value::text) > 50000 then return false; end if;
  for item in select * from jsonb_array_elements(value->'slots') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'slotId') is distinct from 'number' or jsonb_typeof(item->'role') is distinct from 'string' or not (item ?& array['slotId','role','x','y','player']) or (item->>'slotId')::integer <> i
      or (item->>'x')::numeric not between 9 and 91 or (item->>'y')::numeric not between 9 and 92
      or jsonb_typeof(item->'x') is distinct from 'number' or jsonb_typeof(item->'y') is distinct from 'number'
      or item->>'role' not in ('GK','LB','CB','RB','DM','CM','AM','LM','RM','LW','RW','ST') then return false; end if;
    if item->'player' <> 'null'::jsonb then
      pid := item #>> '{player,id}';
      if jsonb_typeof(item->'player') <> 'object' or pid is null
        or pid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or pid = any(seen) then return false; end if;
      if not ((item->'player') ?& array['teamId','name','teamName','number','positionGroup','color','color2'])
        or jsonb_typeof(item #> '{player,name}') is distinct from 'string'
        or length(btrim(item #>> '{player,name}')) not between 1 and 100
        or jsonb_typeof(item #> '{player,teamName}') is distinct from 'string'
        or length(btrim(item #>> '{player,teamName}')) not between 1 and 80
        or coalesce(item #>> '{player,teamId}','') !~ '^[a-zA-Z0-9_-]{1,80}$'
        or coalesce(item #>> '{player,positionGroup}','') not in ('G','D','M','F')
        or coalesce(item #>> '{player,color}','') !~ '^#[0-9a-fA-F]{6}$'
        or coalesce(item #>> '{player,color2}','') !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
      if item #> '{player,number}' <> 'null'::jsonb and
        (jsonb_typeof(item #> '{player,number}') is distinct from 'number' or (item #>> '{player,number}')::integer not between 1 and 99) then return false; end if;
      seen := array_append(seen,pid);
    end if;
    i := i + 1;
  end loop;
  return true;
exception when others then return false;
end;
$$;
commit;
