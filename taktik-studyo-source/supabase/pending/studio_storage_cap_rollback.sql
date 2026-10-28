-- SEC3 rollback for 20261028120000_studio_storage_cap.sql. NOT A MIGRATION: run by hand only if the
-- storage cap has to be undone. Restores the 20261015190000 definition of the shared trigger function,
-- byte for byte, and nothing else: triggers, grants, policies and data are not touched.
begin;

-- tg_argv[0]: row cap for this table. Errors: P0001 'quota_exceeded' / 'rate_limited' (hint = table).
create or replace function tactics_private.enforce_account_limits() returns trigger
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
commit;
