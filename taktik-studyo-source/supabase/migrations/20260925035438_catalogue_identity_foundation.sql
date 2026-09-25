-- D2A LOCAL PROPOSAL ONLY. No backfill, rename, delete or change to old tables.
-- catalogue_* are the future canonical contract, staged beside public.teams/players.
begin;
create table public.catalogue_teams (
 id text primary key check (id ~ '^[a-z][a-z0-9-]{0,79}$'),
 display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
 short_name text not null check (char_length(btrim(short_name)) between 1 and 8),
 color_primary text not null check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
 color_secondary text not null check (color_secondary ~ '^#[0-9a-fA-F]{6}$'),
 sort_order integer not null default 0 check (sort_order between 0 and 10000),
 catalogue_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.catalogue_players (
 id uuid primary key default gen_random_uuid(),
 team_id text not null references public.catalogue_teams(id) on delete restrict,
 display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
 position_group text not null check (position_group in ('G','D','M','F')),
 specific_position text not null check (specific_position in ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST','LM','RM','DEF','MID','FWD')),
 shirt_number smallint check (shirt_number between 1 and 99),
 catalogue_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index catalogue_players_active_team on public.catalogue_players(team_id,id) where catalogue_active;
create table public.team_provider_ids (
 provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
 provider_id text not null check (provider_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 team_id text not null references public.catalogue_teams(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(provider,provider_id), unique(team_id,provider)
);
create table public.player_provider_ids (
 provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
 provider_id text not null check (provider_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 player_id uuid not null references public.catalogue_players(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(provider,provider_id), unique(player_id,provider)
);
create table public.legacy_team_aliases (
 namespace text not null check (namespace='taktik-v1'),
 legacy_id text not null check (legacy_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 team_id text not null references public.catalogue_teams(id) on delete restrict,
 evidence text not null check (char_length(evidence) between 1 and 160),
 created_at timestamptz not null default now(), primary key(namespace,legacy_id)
);
create table public.legacy_player_aliases (
 namespace text not null check (namespace='taktik-v1'),
 legacy_id text not null check (legacy_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 player_id uuid not null references public.catalogue_players(id) on delete restrict,
 evidence text not null check (char_length(evidence) between 1 and 160),
 created_at timestamptz not null default now(), primary key(namespace,legacy_id)
);
create index legacy_team_aliases_target on public.legacy_team_aliases(team_id);
create index legacy_player_aliases_target on public.legacy_player_aliases(player_id);
create function tactics_private.catalogue_identity_touch() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.created_at=old.created_at; new.updated_at=now(); return new; end $$;
revoke all on function tactics_private.catalogue_identity_touch() from public,anon,authenticated;
create trigger catalogue_teams_touch before update on public.catalogue_teams for each row execute function tactics_private.catalogue_identity_touch();
create trigger catalogue_players_touch before update on public.catalogue_players for each row execute function tactics_private.catalogue_identity_touch();
create trigger team_provider_ids_touch before update on public.team_provider_ids for each row execute function tactics_private.catalogue_identity_touch();
create trigger player_provider_ids_touch before update on public.player_provider_ids for each row execute function tactics_private.catalogue_identity_touch();
alter table public.catalogue_teams enable row level security;
alter table public.catalogue_players enable row level security;
alter table public.team_provider_ids enable row level security;
alter table public.player_provider_ids enable row level security;
alter table public.legacy_team_aliases enable row level security;
alter table public.legacy_player_aliases enable row level security;
revoke all on public.catalogue_teams,public.catalogue_players,public.team_provider_ids,public.player_provider_ids,public.legacy_team_aliases,public.legacy_player_aliases from public,anon,authenticated,service_role;
grant select on public.catalogue_teams,public.catalogue_players to anon,authenticated;
create policy catalogue_teams_read on public.catalogue_teams for select to anon,authenticated using (catalogue_active);
create policy catalogue_players_read on public.catalogue_players for select to anon,authenticated using (catalogue_active);
-- Server only. No client alias/mapping policy, no RPC, no client write grants.
grant select on public.catalogue_teams,public.catalogue_players,public.team_provider_ids,public.player_provider_ids,public.legacy_team_aliases,public.legacy_player_aliases to service_role;
grant insert(id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active) on public.catalogue_teams to service_role;
-- Product team names, colors and abbreviations cannot be changed by sync updates.
grant update(catalogue_active) on public.catalogue_teams to service_role;
grant insert(id,team_id,display_name,position_group,specific_position,shirt_number,catalogue_active) on public.catalogue_players to service_role;
grant update(team_id,display_name,position_group,specific_position,shirt_number,catalogue_active) on public.catalogue_players to service_role;
grant insert(provider,provider_id,team_id) on public.team_provider_ids to service_role;
grant insert(provider,provider_id,player_id) on public.player_provider_ids to service_role;
grant insert(namespace,legacy_id,team_id,evidence) on public.legacy_team_aliases to service_role;
grant insert(namespace,legacy_id,player_id,evidence) on public.legacy_player_aliases to service_role;
-- Mapping reassignment/deletion requires separate reviewed administrator action.
commit;
