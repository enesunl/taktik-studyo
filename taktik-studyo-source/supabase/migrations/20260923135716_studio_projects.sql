-- M5: local source only. Do not apply to production without separate approval.
begin;
create table public.studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  studio_mode text not null check (studio_mode in ('free','match')),
  match_id text,
  match_week integer check (match_week between 1 and 34),
  snapshot_version integer not null default 1 check (snapshot_version = 1),
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_project_title check (title = btrim(title) and char_length(title) between 1 and 120
    and title collate "C" !~ '[[:cntrl:]]' and title !~ U&'[\0080-\009F]'),
  constraint studio_project_snapshot check (
    octet_length(snapshot::text) <= 4194304 and jsonb_typeof(snapshot) = 'object'
    and snapshot ?& array['version','source','teams','working','drawings','pitch']
    and snapshot->'version' = '1'::jsonb
    and jsonb_typeof(snapshot->'source') = 'object' and jsonb_typeof(snapshot->'teams') = 'object'
    and jsonb_typeof(snapshot->'working') = 'array' and jsonb_typeof(snapshot->'drawings') = 'array'
    and jsonb_typeof(snapshot->'pitch') = 'object'
    and jsonb_array_length(snapshot->'working') <= 22 and jsonb_array_length(snapshot->'drawings') <= 200
  ),
  constraint studio_project_context check (
    (studio_mode = 'free' and match_id is null and match_week is null)
    or (studio_mode = 'match' and match_id is not null and match_id ~ '^[1-9][0-9]{0,15}$')
  )
);
create index studio_projects_owner_updated on public.studio_projects (user_id, updated_at desc, id desc);
alter table public.studio_projects enable row level security;
revoke all on public.studio_projects from public, anon, authenticated;
grant select, delete on public.studio_projects to authenticated;
grant insert (id, user_id, title, snapshot_version, snapshot) on public.studio_projects to authenticated;
grant update (title, snapshot_version, snapshot) on public.studio_projects to authenticated;
create policy studio_projects_select_own on public.studio_projects for select to authenticated using ((select auth.uid()) = user_id);
create policy studio_projects_insert_own on public.studio_projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy studio_projects_update_own on public.studio_projects for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy studio_projects_delete_own on public.studio_projects for delete to authenticated using ((select auth.uid()) = user_id);

-- No SECURITY DEFINER / public RPC. Metadata comes from the constrained snapshot.
create function tactics_private.studio_project_metadata() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.studio_mode := new.snapshot #>> '{source,mode}';
  new.match_id := new.snapshot #>> '{source,matchId}';
  new.match_week := (new.snapshot #>> '{source,week}')::integer;
  if tg_op = 'INSERT' then
    new.revision := 1;
    new.created_at := clock_timestamp();
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.revision := old.revision + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function tactics_private.studio_project_metadata() from public, anon, authenticated;
create trigger studio_projects_metadata before insert or update on public.studio_projects
for each row execute function tactics_private.studio_project_metadata();
commit;
