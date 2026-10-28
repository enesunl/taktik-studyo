-- SEC3 aggregate Studio storage. PROPOSAL FOR REVIEW: not applied in production.
-- Apply to Supabase Local first, and to production only with explicit approval.
--
-- The 10-project cap and the 4 MiB snapshot check still let one account keep about 42 MB of
-- incompressible snapshots. This adds a per-account cap on stored snapshot bytes (after compression,
-- as pg_column_size reports them): 16 MiB. The largest snapshots the app can produce (200 freehand
-- drawings of 256 points) take about 1.3 MB stored, so 10 of them stay well below it.
-- Same function as 20261015190000 plus the studio_projects block at the end. Triggers, RLS, policies,
-- grants and data are unchanged. Only growth is refused: a rename, or a snapshot not larger than the
-- stored one, always passes, also for accounts already above the cap.
--
-- Write budget: a failed statement rolls its budget increment back, but rows it already wrote stay on
-- disk as dead data until VACUUM. Two such paths are closed for studio_projects and weekly_lineups (the
-- app writes one row per request on both): an INSERT reusing an existing id now fails before anything
-- is written (same 23505 code the app's retry path expects), and a signed-in user writes at most one
-- row of these tables per transaction (a multi-row statement is refused at its second row).
begin;

-- tg_argv[0]: row cap for this table. Errors: P0001 'quota_exceeded' / 'rate_limited' (hint = table).
create or replace function tactics_private.enforce_account_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cap integer := tg_argv[0]::integer;
  win timestamptz := date_bin('10 minutes', clock_timestamp(), '2026-01-01'::timestamptz);
  size bigint := 0; used_writes integer; used_bytes bigint; owned integer; stored bigint;
begin
  -- Server code (service role) has no auth.uid(). A row for another account is rejected by RLS
  -- right after BEFORE triggers, so it must neither touch nor reveal that account's counters.
  if me is null or new.user_id is distinct from me then return new; end if;
  if not exists (select 1 from public.profiles where id = me) then
    raise exception 'profile_required' using errcode = 'P0001', hint = tg_table_name;
  end if;
  if tg_table_name <> 'player_overrides' then
    size := pg_column_size(new.snapshot);
    if current_setting('tactics.snapshot_written', true) = 'on' then
      raise exception 'rate_limited' using errcode = 'P0001', hint = tg_table_name;
    end if;
    perform set_config('tactics.snapshot_written', 'on', true);
  end if;

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
    -- An existing key/id gets 23505: overrides are saved insert-then-update and project/Weekly XI
    -- inserts are retried with the same id. Overrides leave it to the unique constraint; a snapshot is
    -- refused here, before it is written.
    if tg_table_name = 'player_overrides' then
      if exists (select 1 from public.player_overrides where user_id = me and player_key = new.player_key) then return new; end if;
      select count(*) into owned from public.player_overrides where user_id = me;
    elsif tg_table_name = 'studio_projects' then
      if exists (select 1 from public.studio_projects where id = new.id) then
        raise exception 'duplicate_id' using errcode = '23505', hint = tg_table_name;
      end if;
      select count(*) into owned from public.studio_projects where user_id = me;
    else
      if exists (select 1 from public.weekly_lineups where id = new.id) then
        raise exception 'duplicate_id' using errcode = '23505', hint = tg_table_name;
      end if;
      select count(*) into owned from public.weekly_lineups where user_id = me;
    end if;
    if owned >= cap then raise exception 'quota_exceeded' using errcode = 'P0001', hint = tg_table_name; end if;
  end if;

  if tg_table_name = 'studio_projects' then
    -- SEC3: 16 MiB of stored snapshots per account. Updates take the insert lock too, so parallel saves
    -- of different projects are counted exactly. Stored rows count compressed (read from the TOAST
    -- pointer, no detoasting); the incoming snapshot is not compressed yet and counts in full.
    perform pg_advisory_xact_lock(hashtextextended('quota:studio_projects:' || me::text, 0));
    select coalesce(sum(pg_column_size(snapshot)), 0) into stored from public.studio_projects where user_id = me and id <> new.id;
    if stored + size > 16777216 and (tg_op = 'INSERT' or size > pg_column_size(old.snapshot)) then
      raise exception 'quota_exceeded' using errcode = 'P0001', hint = tg_table_name;
    end if;
  end if;
  return new;
end $$;
revoke all on function tactics_private.enforce_account_limits() from public, anon, authenticated;
commit;
