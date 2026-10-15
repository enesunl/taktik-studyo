-- SEC2.2 MVP account limits. PROPOSAL FOR REVIEW: not applied locally or in production.
-- Apply to Supabase Local first, and to production only with explicit approval.
--
-- Free account limits, enforced in the database (the client cannot bypass them):
--   studio_projects 10, weekly_lineups 40, player_overrides 500 rows per account;
--   400 writes (insert + update) and 50 MB written per account per 10 minutes across those tables;
--   10 new share links per account per UTC day (create_shared_lineup, next to the IP/global limits).
-- Writes and new share links also require the account's profile. New profiles can only be created with a
-- recorded Terms acceptance (20261015200000), so an account that never finished registration/onboarding
-- (e.g. a first Google sign-in) cannot store data through the API. Existing profiles are not affected.
-- RLS, policies and grants are unchanged; no new RPC. Existing rows above a cap stay untouched:
-- caps apply to new rows only.
begin;

create table tactics_private.write_budget (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  writes integer not null default 0,
  bytes bigint not null default 0,
  primary key (user_id, window_start)
);
revoke all on tactics_private.write_budget from public, anon, authenticated;

-- tg_argv[0]: row cap for this table. Errors: P0001 'quota_exceeded' / 'rate_limited' (hint = table).
create function tactics_private.enforce_account_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cap integer := tg_argv[0]::integer;
  win timestamptz := date_bin('10 minutes', clock_timestamp(), '2026-01-01'::timestamptz);
  size bigint := 0; used_writes integer; used_bytes bigint; owned integer;
begin
  -- Server code (service role) has no auth.uid(). A row for another account is rejected by RLS
  -- right after BEFORE triggers, so it must neither touch nor reveal that account's counters.
  if me is null or new.user_id is distinct from me then return new; end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'profile_required' using errcode = 'P0001', hint = tg_table_name;
  end if;
  if tg_table_name <> 'player_overrides' then size := pg_column_size(new.snapshot); end if;

  -- One atomic upsert per write; a rejected write rolls its own increment back.
  insert into tactics_private.write_budget as b (user_id, window_start, writes, bytes)
  values (me, win, 1, size)
  on conflict (user_id, window_start) do update set writes = b.writes + 1, bytes = b.bytes + excluded.bytes
  returning writes, bytes into used_writes, used_bytes;
  if used_writes = 1 then
    delete from tactics_private.write_budget where user_id = me and window_start < win - interval '1 day';
  end if;
  if used_writes > 400 or used_bytes > 52428800 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    -- Serializes this account's inserts into this table: a parallel insert waits, then counts the
    -- committed row, so the cap is exact. Statements below see fresh committed data (READ COMMITTED).
    perform pg_advisory_xact_lock(hashtextextended('quota:' || tg_table_name || ':' || me::text, 0));
    -- An existing key/id is left to the unique constraint: overrides are saved insert-then-update
    -- (23505) and project/Weekly XI inserts are retried with the same id.
    if tg_table_name = 'player_overrides' then
      if exists (select 1 from public.player_overrides where user_id = me and player_key = new.player_key) then return new; end if;
      select count(*) into owned from public.player_overrides where user_id = me;
    elsif tg_table_name = 'studio_projects' then
      if exists (select 1 from public.studio_projects where id = new.id) then return new; end if;
      select count(*) into owned from public.studio_projects where user_id = me;
    else
      if exists (select 1 from public.weekly_lineups where id = new.id) then return new; end if;
      select count(*) into owned from public.weekly_lineups where user_id = me;
    end if;
    if owned >= cap then raise exception 'quota_exceeded' using errcode = 'P0001', hint = tg_table_name; end if;
  end if;
  return new;
end $$;
revoke all on function tactics_private.enforce_account_limits() from public, anon, authenticated;

create trigger studio_projects_limits before insert or update on public.studio_projects
  for each row execute function tactics_private.enforce_account_limits('10');
create trigger weekly_lineups_limits before insert or update on public.weekly_lineups
  for each row execute function tactics_private.enforce_account_limits('40');
create trigger player_overrides_limits before insert or update on public.player_overrides
  for each row execute function tactics_private.enforce_account_limits('500');

-- Same function as 20261014150000 plus a per-account bucket: 10 new links per UTC day. The bucket key
-- is a hash, like the IP bucket, so share_limits keeps no account id. Runs under the existing global lock.
create or replace function public.create_shared_lineup(payload jsonb,client_bucket text,owner uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare minute_window timestamptz:=date_bin('10 minutes',now(),'2026-01-01'::timestamptz); day_window timestamptz:=date_trunc('day',now());
  owner_day timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; owner_bucket text;
  b text; w timestamptz; cap integer; used integer; answer uuid;
begin
  if owner is null then raise exception 'Owner required' using errcode='22023'; end if;
  if not exists (select 1 from public.profiles where id=owner) then raise exception 'profile_required' using errcode='P0001'; end if;
  if client_bucket !~ '^[a-f0-9]{64}$' or client_bucket is null or jsonb_typeof(payload)<>'object' or not payload ?& array['team_name','formation','lineup_data','drawing_data'] or payload-array['team_name','formation','lineup_data','drawing_data']<>'{}'::jsonb or octet_length(payload::text)>262144 then raise exception 'Invalid payload' using errcode='22023'; end if;
  if not tactics_private.valid_snapshot(payload->>'formation',payload->>'team_name',payload->'lineup_data',payload->'drawing_data') then raise exception 'Invalid snapshot' using errcode='22023'; end if;
  owner_bucket:='owner:'||encode(sha256(convert_to(owner::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(617044291);
  delete from tactics_private.share_limits where window_start < now()-interval '2 days';
  for b,w,cap in select * from (values ('global:10m',minute_window,100),('global:day',day_window,1000),('client:'||client_bucket,minute_window,5),(owner_bucket,owner_day,10)) as limits(bucket,window_start,cap) loop
    select attempts into used from tactics_private.share_limits where bucket=b and window_start=w;
    if coalesce(used,0)>=cap then return null; end if;
  end loop;
  for b,w in select * from (values ('global:10m',minute_window),('global:day',day_window),('client:'||client_bucket,minute_window),(owner_bucket,owner_day)) as limits(bucket,window_start) loop
    insert into tactics_private.share_limits(bucket,window_start,attempts) values(b,w,1) on conflict(bucket,window_start) do update set attempts=tactics_private.share_limits.attempts+1;
  end loop;
  insert into public.shared_lineups(team_name,formation,lineup_data,drawing_data,owner_id)
    values(payload->>'team_name',payload->>'formation',payload->'lineup_data',payload->'drawing_data',owner) returning public_id into answer;
  return answer;
end $$;
revoke all on function public.create_shared_lineup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.create_shared_lineup(jsonb,text,uuid) to service_role;
commit;
