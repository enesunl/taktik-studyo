-- Review/apply only after selecting the football project's Supabase instance.
-- No changes to pre-existing tables, Auth settings or project-wide default grants.
begin;
create schema if not exists tactics_private;
revoke all on schema tactics_private from public, anon, authenticated;
grant usage on schema tactics_private to service_role;

create function tactics_private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;
revoke all on function tactics_private.touch_updated_at() from public, anon, authenticated;

create table public.teams (
  id text primary key check (id ~ '^[a-z0-9_-]{1,80}$'),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  short_name text not null check (char_length(btrim(short_name)) between 1 and 8),
  logo_url text check (logo_url is null or (char_length(logo_url)<=500 and logo_url ~ '^https://')),
  color_primary text not null check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  color_secondary text not null check (color_secondary ~ '^#[0-9a-fA-F]{6}$'),
  source_url text check (source_url is null or (char_length(source_url)<=500 and source_url ~ '^https://')),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.players (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  team_id text not null references public.teams(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  position text not null check (position in ('G','D','M','F')),
  shirt_number smallint check (shirt_number between 1 and 99),
  photo_url text check (photo_url is null or photo_url ~ '^/?faces/[0-9]{1,16}\.png$'),
  roles text[] not null default '{}' check (cardinality(roles)<=10 and array_position(roles,null) is null and roles <@ array['KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF']::text[]),
  selection_rank numeric not null default 0 check (selection_rank between 0 and 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_team_id_idx on public.players(team_id);
create trigger teams_updated before update on public.teams for each row execute function tactics_private.touch_updated_at();
create trigger players_updated before update on public.players for each row execute function tactics_private.touch_updated_at();

create function tactics_private.valid_snapshot(f text, t text, l jsonb, d jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare p jsonb; s jsonb; pt jsonb; i integer:=0; total integer:=0; athletes text[]:='{}';
begin
  if f is null or t is null or l is null or d is null then return false; end if;
  if f !~ '^[1-9](-[1-9]){1,4}$' or (select sum(x::integer) from unnest(string_to_array(f,'-')) x)<>10 then return false; end if;
  if jsonb_typeof(l)<>'object' or not l ?& array['team','customized','players'] or l-array['team','customized','players']<>'{}'::jsonb or jsonb_typeof(l->'customized')<>'boolean' then return false; end if;
  if jsonb_typeof(l->'team')<>'object' or not (l->'team') ?& array['name','short','color','color2'] or (l->'team')-array['id','name','short','color','color2','logo']<>'{}'::jsonb then return false; end if;
  if exists (select 1 from unnest(array['name','short','color','color2']) k where jsonb_typeof(l->'team'->k)<>'string') then return false; end if;
  if (l->'team') ? 'id' and (jsonb_typeof(l->'team'->'id')<>'string' or char_length(l->'team'->>'id') not between 1 and 80) then return false; end if;
  if l->'team'->>'logo' is not null and (jsonb_typeof(l->'team'->'logo')<>'string' or char_length(l->'team'->>'logo')>500 or l->'team'->>'logo' !~ '^https://') then return false; end if;
  if jsonb_typeof(l->'team'->'name')<>'string' or l->'team'->>'name'<>t or char_length(btrim(t)) not between 1 and 80 or char_length(l->'team'->>'short') not between 1 and 8 or l->'team'->>'color' !~ '^#[0-9a-fA-F]{6}$' or l->'team'->>'color2' !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  if jsonb_typeof(l->'players')<>'array' or jsonb_array_length(l->'players')<>11 then return false; end if;
  for p in select value from jsonb_array_elements(l->'players') loop
    if jsonb_typeof(p)<>'object' or not p ?& array['id','name','x','y','role','number','renamed'] or p-array['id','name','x','y','role','number','renamed','athleteId','photo']<>'{}'::jsonb then return false; end if;
    if jsonb_typeof(p->'role')<>'string' then return false; end if;
    if jsonb_typeof(p->'id')<>'number' or (p->>'id')::numeric<>i or jsonb_typeof(p->'name')<>'string' or char_length(btrim(p->>'name')) not between 1 and 100 or jsonb_typeof(p->'x')<>'number' or (p->>'x')::numeric not between 0 and 100 or jsonb_typeof(p->'y')<>'number' or (p->>'y')::numeric not between 0 and 100 or p->>'role' not in ('KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF') or jsonb_typeof(p->'renamed')<>'boolean' then return false; end if;
    if p->'number'<>'null'::jsonb and (jsonb_typeof(p->'number')<>'number' or (p->>'number')::numeric not between 1 and 99 or (p->>'number')::numeric<>trunc((p->>'number')::numeric)) then return false; end if;
    if p->>'athleteId' is not null then
      if jsonb_typeof(p->'athleteId')<>'string' or char_length(p->>'athleteId') not between 1 and 80 or p->>'athleteId'=any(athletes) then return false; end if;
      athletes=array_append(athletes,p->>'athleteId');
    end if;
    if p->>'photo' is not null and (jsonb_typeof(p->'photo')<>'string' or p->>'photo' !~ '^/?faces/[0-9]{1,16}\.png$') then return false; end if;
    i=i+1;
  end loop;
  if jsonb_typeof(d)<>'array' or jsonb_array_length(d)>128 then return false; end if;
  for s in select value from jsonb_array_elements(d) loop
    if jsonb_typeof(s->'tool')<>'string' or jsonb_typeof(s->'color')<>'string' then return false; end if;
    if jsonb_typeof(s)<>'object' or not s ?& array['tool','color','width','points'] or s-array['tool','color','width','points']<>'{}'::jsonb or s->>'tool' not in ('pen','eraser') or s->>'color' !~ '^#[0-9a-fA-F]{6}$' or jsonb_typeof(s->'width')<>'number' or (s->>'width')::numeric<>(case when s->>'tool'='pen' then 4 else 24 end) or jsonb_typeof(s->'points')<>'array' or jsonb_array_length(s->'points')<1 then return false; end if;
    total=total+jsonb_array_length(s->'points');if total>2000 then return false; end if;
    for pt in select value from jsonb_array_elements(s->'points') loop
      if jsonb_typeof(pt)<>'object' or not pt ?& array['x','y'] or pt-array['x','y']<>'{}'::jsonb or jsonb_typeof(pt->'x')<>'number' or jsonb_typeof(pt->'y')<>'number' or (pt->>'x')::numeric not between 0 and 1 or (pt->>'y')::numeric not between 0 and 1 then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function tactics_private.valid_snapshot(text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function tactics_private.valid_snapshot(text,text,jsonb,jsonb) to service_role;

create table public.shared_lineups (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  team_name text not null check (char_length(btrim(team_name)) between 1 and 80),
  formation text not null,
  lineup_data jsonb not null,
  drawing_data jsonb not null default '[]',
  created_at timestamptz not null default now(),
  expires_at timestamptz check (expires_at is null or expires_at>created_at),
  constraint snapshot_valid check (tactics_private.valid_snapshot(formation,team_name,lineup_data,drawing_data) is true),
  constraint snapshot_size check (octet_length(lineup_data::text)+octet_length(drawing_data::text)<=262144)
);
comment on table public.shared_lineups is 'Explicitly public snapshots only. Read by unguessable public_id through Edge Function; never drafts or personal data.';
create index shared_lineups_expires_idx on public.shared_lineups(expires_at) where expires_at is not null;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.shared_lineups enable row level security;
revoke all on public.teams,public.players,public.shared_lineups from public,anon,authenticated,service_role;
grant select on public.teams,public.players to anon;
create policy teams_public_catalogue on public.teams for select to anon using (true);
create policy players_public_catalogue on public.players for select to anon using (true);
-- USING(true) is intentional: all catalogue rows are public, with no owner data.
-- No shared_lineups anon grants/policies: no list endpoint or direct anonymous write.
grant select,insert on public.shared_lineups to service_role;
grant select on public.teams,public.players to service_role;

create table tactics_private.share_limits (
  bucket text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts>=0),
  primary key(bucket,window_start)
);
alter table tactics_private.share_limits enable row level security;
revoke all on tactics_private.share_limits from public,anon,authenticated,service_role;
grant select,insert,update,delete on tactics_private.share_limits to service_role;

-- SECURITY INVOKER; only the server role may call this RPC. Atomic quota+insert.
create function public.create_shared_lineup(payload jsonb,client_bucket text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare minute_window timestamptz:=date_bin('10 minutes',now(),'2026-01-01'::timestamptz); day_window timestamptz:=date_trunc('day',now()); b text; w timestamptz; cap integer; used integer; answer uuid;
begin
  if client_bucket !~ '^[a-f0-9]{64}$' or client_bucket is null or jsonb_typeof(payload)<>'object' or not payload ?& array['team_name','formation','lineup_data','drawing_data'] or payload-array['team_name','formation','lineup_data','drawing_data']<>'{}'::jsonb or octet_length(payload::text)>262144 then raise exception 'Invalid payload' using errcode='22023'; end if;
  if not tactics_private.valid_snapshot(payload->>'formation',payload->>'team_name',payload->'lineup_data',payload->'drawing_data') then raise exception 'Invalid snapshot' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(617044291);
  delete from tactics_private.share_limits where window_start < now()-interval '2 days';
  for b,w,cap in select * from (values ('global:10m',minute_window,100),('global:day',day_window,1000),('client:'||client_bucket,minute_window,5)) as limits(bucket,window_start,cap) loop
    select attempts into used from tactics_private.share_limits where bucket=b and window_start=w;
    if coalesce(used,0)>=cap then return null; end if;
  end loop;
  for b,w in select * from (values ('global:10m',minute_window),('global:day',day_window),('client:'||client_bucket,minute_window)) as limits(bucket,window_start) loop
    insert into tactics_private.share_limits(bucket,window_start,attempts) values(b,w,1) on conflict(bucket,window_start) do update set attempts=tactics_private.share_limits.attempts+1;
  end loop;
  insert into public.shared_lineups(team_name,formation,lineup_data,drawing_data)
    values(payload->>'team_name',payload->>'formation',payload->'lineup_data',payload->'drawing_data') returning public_id into answer;
  return answer;
end $$;
revoke all on function public.create_shared_lineup(jsonb,text) from public,anon,authenticated;
grant execute on function public.create_shared_lineup(jsonb,text) to service_role;
commit;
