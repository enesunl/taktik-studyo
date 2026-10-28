-- SEC3 write path for Studio projects and Weekly XI records. PROPOSAL FOR REVIEW: production only with
-- explicit approval. Additive: direct INSERT/UPDATE on both tables is unchanged here; it is revoked later by
-- supabase/pending/studio_weekly_direct_write_revoke.sql, only after the frontend using these functions is
-- published and verified.
--
-- A rejected direct write leaves the rows it already wrote on disk (and in WAL) until VACUUM, uncounted:
-- a multi-row INSERT/UPDATE is refused at its second row, after the first one (up to 4 MiB) is stored.
-- These functions write exactly one row per request, and every check runs before that row is stored.
-- Each takes the whole request body as ONE unnamed jsonb argument: PostgREST calls a function with named
-- arguments once per element of a JSON array body, inside one statement (the same failure mode), while an
-- unnamed jsonb argument receives the body as is, so anything but one object is refused before writing.
-- The account is auth.uid() (the body carries no owner; unknown keys are refused), a reused id is refused
-- under a per-id lock (a parallel create of the same id by another account cannot pass the check either),
-- an update matches id + owner + revision, then the unchanged account-limits trigger (row caps, 16 MiB,
-- write budget) and the table constraints run before the insert or update.
-- Results match the direct requests the app made so far: the saved row, no row on a revision conflict
-- (stale revision, other owner or missing id look the same), 23505 for a reused id, P0001
-- quota_exceeded / rate_limited from the trigger; 22023 invalid_request for a malformed body.
begin;

-- {id, revision, title, snapshot}. revision null: create. Otherwise update at revision; snapshot null keeps
-- the stored snapshot (rename).
create function public.save_studio_project(jsonb) returns setof public.studio_projects
language plpgsql security definer set search_path = '' as $$
declare
  body jsonb := $1; me uuid := auth.uid(); saved public.studio_projects;
  p_id uuid; p_revision bigint; p_snapshot jsonb;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if jsonb_typeof(body) is distinct from 'object' then raise exception 'invalid_request' using errcode = '22023', hint = 'studio_projects'; end if;
  if (select count(*) from jsonb_object_keys(body)) <> 4
    or not body ?& array['id', 'revision', 'title', 'snapshot']
    or jsonb_typeof(body -> 'snapshot') not in ('object', 'null') or jsonb_typeof(body -> 'revision') not in ('number', 'null')
    or jsonb_typeof(body -> 'snapshot') = 'null' and jsonb_typeof(body -> 'revision') = 'null' then
    raise exception 'invalid_request' using errcode = '22023', hint = 'studio_projects';
  end if;
  p_id := (body ->> 'id')::uuid; p_revision := (body ->> 'revision')::bigint; p_snapshot := nullif(body -> 'snapshot', 'null'::jsonb);
  if p_revision is null then
    perform pg_advisory_xact_lock(hashtextextended('record:studio_projects:' || p_id::text, 0));
    if exists (select 1 from public.studio_projects where id = p_id) then
      raise exception 'duplicate_id' using errcode = '23505', hint = 'studio_projects';
    end if;
    insert into public.studio_projects (id, user_id, title, snapshot_version, snapshot)
      values (p_id, me, body ->> 'title', 1, p_snapshot) returning * into saved;
  else
    update public.studio_projects set title = body ->> 'title', snapshot = coalesce(p_snapshot, snapshot)
      where id = p_id and user_id = me and revision = p_revision returning * into saved;
    if not found then return; end if;
  end if;
  return next saved;
end $$;
revoke all on function public.save_studio_project(jsonb) from public, anon;
grant execute on function public.save_studio_project(jsonb) to authenticated;

-- {id, revision, title, season, week, snapshot}. Same contract; the formation column is taken from the
-- snapshot (the table checks they match).
create function public.save_weekly_lineup(jsonb) returns setof public.weekly_lineups
language plpgsql security definer set search_path = '' as $$
declare
  body jsonb := $1; me uuid := auth.uid(); saved public.weekly_lineups;
  p_id uuid; p_revision bigint;
begin
  if me is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if jsonb_typeof(body) is distinct from 'object' then raise exception 'invalid_request' using errcode = '22023', hint = 'weekly_lineups'; end if;
  if (select count(*) from jsonb_object_keys(body)) <> 6
    or not body ?& array['id', 'revision', 'title', 'season', 'week', 'snapshot']
    or jsonb_typeof(body -> 'snapshot') <> 'object' or jsonb_typeof(body -> 'revision') not in ('number', 'null') then
    raise exception 'invalid_request' using errcode = '22023', hint = 'weekly_lineups';
  end if;
  p_id := (body ->> 'id')::uuid; p_revision := (body ->> 'revision')::bigint;
  if p_revision is null then
    perform pg_advisory_xact_lock(hashtextextended('record:weekly_lineups:' || p_id::text, 0));
    if exists (select 1 from public.weekly_lineups where id = p_id) then
      raise exception 'duplicate_id' using errcode = '23505', hint = 'weekly_lineups';
    end if;
    insert into public.weekly_lineups (id, user_id, title, season, week, formation, snapshot)
      values (p_id, me, body ->> 'title', body ->> 'season', (body ->> 'week')::integer, body -> 'snapshot' ->> 'formation', body -> 'snapshot')
      returning * into saved;
  else
    update public.weekly_lineups set title = body ->> 'title', season = body ->> 'season', week = (body ->> 'week')::integer,
        formation = body -> 'snapshot' ->> 'formation', snapshot = body -> 'snapshot'
      where id = p_id and user_id = me and revision = p_revision returning * into saved;
    if not found then return; end if;
  end if;
  return next saved;
end $$;
revoke all on function public.save_weekly_lineup(jsonb) from public, anon;
grant execute on function public.save_weekly_lineup(jsonb) to authenticated;
commit;
