-- PROD1.5 (cutover plan M3). Production application requires explicit approval.
-- One transactional writer for the BSD canonical catalogue, executable by service_role only.
-- It is called by the operator tool scripts/catalogue/import.mjs (dry-run by default).
-- The tool computes a plan; this function re-checks every invariant itself:
--   * optimistic lock: the plan names the last applied run, so a stale plan is refused;
--   * provider is 'bsd' only; legacy/FotMob identities are never read or written here;
--   * no row is ever deleted; existing provider mappings are never reassigned;
--   * team display metadata is insert-only (product-owned, never changed by sync);
--   * players absent from a complete scope become inactive, never deleted, and only up to
--     the explicit allowance in the plan (default 0) — otherwise the whole run aborts.
-- The audit table stores counts and the input SHA-256, never the provider dataset.
begin;
-- Explicit dependency: the canonical tables (20260925035438) must already exist.
do $$ begin
  if to_regclass('public.player_provider_ids') is null or to_regclass('public.catalogue_players') is null
  then raise exception 'catalogue_sync requires 20260925035438_catalogue_identity_foundation'; end if;
end $$;
create table tactics_private.catalogue_sync_runs (
  id bigint generated always as identity primary key,
  applied_at timestamptz not null default now(),
  source text not null check (source ~ '^[a-z0-9:._-]{1,60}$'),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object')
);
revoke all on tactics_private.catalogue_sync_runs from public, anon, authenticated, service_role;

create function public.catalogue_apply_sync(plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  last_run bigint; expected bigint; item jsonb; mapped text; mapped_player uuid;
  team_count integer; player_count integer; allow_players integer; allow_teams integer;
  inserted_teams integer := 0; reactivated_teams integer := 0; inserted_players integer := 0;
  updated_players integer := 0; deactivated_players integer := 0; deactivated_teams integer := 0;
  changed integer; run_id bigint; summary jsonb;
begin
  if jsonb_typeof(plan) is distinct from 'object' or plan->>'provider' is distinct from 'bsd'
    or jsonb_typeof(plan->'teams') is distinct from 'array' or jsonb_typeof(plan->'players') is distinct from 'array'
    or coalesce(plan->>'input_sha256','') !~ '^[0-9a-f]{64}$' or coalesce(plan->>'source','') !~ '^[a-z0-9:._-]{1,60}$'
  then raise exception 'invalid_plan' using errcode = '22023'; end if;

  lock table tactics_private.catalogue_sync_runs in exclusive mode;
  select max(id) into last_run from tactics_private.catalogue_sync_runs;
  expected := nullif(plan->>'expected_run','')::bigint;
  if last_run is distinct from expected then raise exception 'stale_plan' using errcode = '40001'; end if;

  team_count := jsonb_array_length(plan->'teams'); player_count := jsonb_array_length(plan->'players');
  allow_players := coalesce((plan->>'allow_deactivations')::integer, 0);
  allow_teams := coalesce((plan->>'allow_team_deactivations')::integer, 0);
  if team_count not between 1 and 100 or player_count not between 11 and 10000 or allow_players < 0 or allow_teams < 0
  then raise exception 'invalid_plan' using errcode = '22023'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(plan->'teams')) <> team_count
    or (select count(distinct value->>'bsd_id') from jsonb_array_elements(plan->'teams')) <> team_count
    or (select count(distinct value->>'id') from jsonb_array_elements(plan->'players')) <> player_count
    or (select count(distinct value->>'provider_id') from jsonb_array_elements(plan->'players')) <> player_count
  then raise exception 'duplicate_identity' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(plan->'teams') t
             where (select count(*) from jsonb_array_elements(plan->'players') p where p->>'team_id' = t->>'id') < 11)
    or exists (select 1 from jsonb_array_elements(plan->'players') p
               where not exists (select 1 from jsonb_array_elements(plan->'teams') t where t->>'id' = p->>'team_id'))
  then raise exception 'incomplete_squad' using errcode = '22023'; end if;

  -- Teams: insert missing (product metadata), reactivate existing; never update metadata.
  for item in select value from jsonb_array_elements(plan->'teams') loop
    if exists (select 1 from public.catalogue_teams where id = item->>'id') then
      update public.catalogue_teams set catalogue_active = true where id = item->>'id' and not catalogue_active;
      get diagnostics changed = row_count; reactivated_teams := reactivated_teams + changed;
    else
      insert into public.catalogue_teams (id, display_name, short_name, color_primary, color_secondary, sort_order, catalogue_active)
      values (item->>'id', item->>'display_name', item->>'short_name', item->>'color_primary', item->>'color_secondary', (item->>'sort_order')::integer, true);
      inserted_teams := inserted_teams + 1;
    end if;
    select team_id into mapped from public.team_provider_ids where provider = 'bsd' and provider_id = item->>'bsd_id';
    if mapped is null then
      if exists (select 1 from public.team_provider_ids where provider = 'bsd' and team_id = item->>'id')
      then raise exception 'team_mapping_conflict' using errcode = '23505'; end if;
      insert into public.team_provider_ids (provider, provider_id, team_id) values ('bsd', item->>'bsd_id', item->>'id');
    elsif mapped <> item->>'id' then raise exception 'team_mapping_conflict' using errcode = '23505'; end if;
  end loop;

  -- Players: provider mapping decides identity; a mapped player keeps its UUID forever.
  for item in select value from jsonb_array_elements(plan->'players') loop
    select player_id into mapped_player from public.player_provider_ids where provider = 'bsd' and provider_id = item->>'provider_id';
    if mapped_player is null then
      if exists (select 1 from public.catalogue_players where id = (item->>'id')::uuid)
      then raise exception 'identity_collision' using errcode = '23505'; end if;
      insert into public.catalogue_players (id, team_id, display_name, position_group, specific_position, shirt_number, catalogue_active)
      values ((item->>'id')::uuid, item->>'team_id', item->>'display_name', item->>'position_group', item->>'specific_position', (item->>'shirt_number')::smallint, true);
      insert into public.player_provider_ids (provider, provider_id, player_id) values ('bsd', item->>'provider_id', (item->>'id')::uuid);
      inserted_players := inserted_players + 1;
    elsif mapped_player <> (item->>'id')::uuid then raise exception 'player_mapping_conflict' using errcode = '23505';
    else
      update public.catalogue_players set team_id = item->>'team_id', display_name = item->>'display_name',
        position_group = item->>'position_group', specific_position = item->>'specific_position',
        shirt_number = (item->>'shirt_number')::smallint, catalogue_active = true
      where id = mapped_player and (team_id, display_name, position_group, specific_position, shirt_number, catalogue_active)
        is distinct from (item->>'team_id', item->>'display_name', item->>'position_group', item->>'specific_position', (item->>'shirt_number')::smallint, true);
      get diagnostics changed = row_count; updated_players := updated_players + changed;
    end if;
  end loop;

  -- Complete scope: BSD-mapped players/teams absent from the plan become inactive (bounded).
  select count(*) into deactivated_players from public.catalogue_players p
  where p.catalogue_active and exists (select 1 from public.player_provider_ids m where m.player_id = p.id and m.provider = 'bsd')
    and not exists (select 1 from jsonb_array_elements(plan->'players') x where (x->>'id')::uuid = p.id);
  select count(*) into deactivated_teams from public.catalogue_teams t
  where t.catalogue_active and exists (select 1 from public.team_provider_ids m where m.team_id = t.id and m.provider = 'bsd')
    and not exists (select 1 from jsonb_array_elements(plan->'teams') x where x->>'id' = t.id);
  if deactivated_players > allow_players or deactivated_teams > allow_teams
  then raise exception 'deactivation_limit: % players, % teams', deactivated_players, deactivated_teams using errcode = '22023'; end if;
  update public.catalogue_players p set catalogue_active = false
  where p.catalogue_active and exists (select 1 from public.player_provider_ids m where m.player_id = p.id and m.provider = 'bsd')
    and not exists (select 1 from jsonb_array_elements(plan->'players') x where (x->>'id')::uuid = p.id);
  update public.catalogue_teams t set catalogue_active = false
  where t.catalogue_active and exists (select 1 from public.team_provider_ids m where m.team_id = t.id and m.provider = 'bsd')
    and not exists (select 1 from jsonb_array_elements(plan->'teams') x where x->>'id' = t.id);

  summary := jsonb_build_object('teams', team_count, 'players', player_count, 'inserted_teams', inserted_teams,
    'reactivated_teams', reactivated_teams, 'inserted_players', inserted_players, 'updated_players', updated_players,
    'deactivated_players', deactivated_players, 'deactivated_teams', deactivated_teams);
  insert into tactics_private.catalogue_sync_runs (source, input_sha256, summary)
  values (plan->>'source', plan->>'input_sha256', summary) returning id into run_id;
  return summary || jsonb_build_object('run', run_id);
end $$;
revoke all on function public.catalogue_apply_sync(jsonb) from public, anon, authenticated;
grant execute on function public.catalogue_apply_sync(jsonb) to service_role;

-- Read-only run cursor for the tool's optimistic lock (no dataset, counts only).
create function public.catalogue_sync_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('last_run', (select max(id) from tactics_private.catalogue_sync_runs),
    'runs', (select count(*) from tactics_private.catalogue_sync_runs))
$$;
revoke all on function public.catalogue_sync_status() from public, anon, authenticated;
grant execute on function public.catalogue_sync_status() to service_role;
commit;
