-- UX4: private Weekly XI records. Local application only until separately approved.
begin;
create function tactics_private.weekly_snapshot_valid(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; i integer := 0; seen text[] := '{}'; pid text;
begin
  if jsonb_typeof(value) <> 'object' or not (value ?& array['version','formation','slots'])
    or value->'version' <> '2'::jsonb or jsonb_typeof(value->'slots') <> 'array'
    or jsonb_array_length(value->'slots') <> 11 or octet_length(value::text) > 50000 then return false; end if;
  for item in select * from jsonb_array_elements(value->'slots') loop
    if not (item ?& array['slotId','role','x','y','player']) or (item->>'slotId')::integer <> i
      or (item->>'x')::numeric not between 9 and 91 or (item->>'y')::numeric not between 9 and 92
      or jsonb_typeof(item->'x') <> 'number' or jsonb_typeof(item->'y') <> 'number'
      or item->>'role' not in ('GK','LB','CB','RB','DM','CM','AM','LM','RM','LW','RW','ST') then return false; end if;
    if item->'player' <> 'null'::jsonb then
      pid := item #>> '{player,id}';
      if jsonb_typeof(item->'player') <> 'object' or pid is null
        or pid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or pid = any(seen) then return false; end if;
      seen := array_append(seen,pid);
    end if;
    i := i + 1;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function tactics_private.weekly_snapshot_valid(jsonb) from public, anon;
grant usage on schema tactics_private to authenticated;
grant execute on function tactics_private.weekly_snapshot_valid(jsonb) to authenticated;
create table public.weekly_lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120 and title !~ '[[:cntrl:]]'),
  season text check (season ~ '^[0-9]{4}/[0-9]{2,4}$'),
  week integer check (week between 1 and 60),
  formation text not null check (formation in ('4-3-3','4-2-3-1','4-4-2','3-5-2','3-4-3','5-3-2','4-1-4-1','4-4-1-1','4-1-2-1-2','4-3-1-2','4-2-2-2','4-2-4','4-5-1','3-4-2-1','3-4-1-2','3-3-3-1','3-3-1-3','3-2-4-1','3-6-1','5-4-1','5-2-3','5-2-1-2','5-2-2-1','2-3-5')),
  snapshot jsonb not null check (tactics_private.weekly_snapshot_valid(snapshot) and snapshot->>'formation' = formation),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index weekly_lineups_owner_updated on public.weekly_lineups(user_id,updated_at desc,id desc);
alter table public.weekly_lineups enable row level security;
revoke all on public.weekly_lineups from public,anon,authenticated;
grant select,delete on public.weekly_lineups to authenticated;
grant insert(id,user_id,title,season,week,formation,snapshot) on public.weekly_lineups to authenticated;
grant update(title,season,week,formation,snapshot) on public.weekly_lineups to authenticated;
create policy weekly_lineups_select_own on public.weekly_lineups for select to authenticated using ((select auth.uid()) = user_id);
create policy weekly_lineups_insert_own on public.weekly_lineups for insert to authenticated with check ((select auth.uid()) = user_id);
create policy weekly_lineups_update_own on public.weekly_lineups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy weekly_lineups_delete_own on public.weekly_lineups for delete to authenticated using ((select auth.uid()) = user_id);
create function tactics_private.weekly_lineup_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.revision := 1; new.created_at := clock_timestamp();
  else new.id := old.id; new.user_id := old.user_id; new.created_at := old.created_at; new.revision := old.revision + 1; end if;
  new.updated_at := clock_timestamp(); return new;
end;
$$;
revoke all on function tactics_private.weekly_lineup_metadata() from public,anon,authenticated;
create trigger weekly_lineups_metadata before insert or update on public.weekly_lineups for each row execute function tactics_private.weekly_lineup_metadata();
commit;
