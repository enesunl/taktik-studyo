-- PROD5.7 Replacement read path for the BSD catalogue. PROPOSAL FOR REVIEW: production only with
-- explicit approval. Additive: direct SELECT on the catalogue tables is unchanged here; it is revoked
-- later by supabase/pending/catalogue_direct_read_revoke.sql, only after the frontend using this
-- function is published and verified.
--
-- public.catalogue_for_app(): the active BSD catalogue with only the fields the board, Studio,
-- Weekly XI and onboarding use (no timestamps, provider IDs, audit or legacy data). Signed-in,
-- non-anonymous accounts only; 60 calls per account per 10 minutes and 600 per UTC day (the app
-- loads it once per page). Counters reuse tactics_private.share_limits ('catalogue:' buckets).
--
-- tactics_private.account_request_budget() is the shared per-account limiter; matches_detail_allowed
-- now delegates to it with its unchanged caps (30 / 10 minutes, 150 / UTC day) and buckets.
begin;
create function tactics_private.account_request_budget(account uuid, scope text, minute_cap integer, day_cap integer) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  minute_window timestamptz := date_bin('10 minutes', now(), '2026-01-01'::timestamptz);
  day_window timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  minute_bucket text := scope || ':10m:' || account;
  day_bucket text := scope || ':day:' || account;
  minute_used integer; day_used integer;
begin
  if account is null then raise exception 'account_required' using errcode = '22023'; end if;
  -- Both rows exist before locking, always in the same order: parallel requests of one account
  -- queue on these row locks, so the caps are exact across Edge instances and API connections.
  insert into tactics_private.share_limits(bucket, window_start, attempts)
    values (minute_bucket, minute_window, 0), (day_bucket, day_window, 0)
    on conflict (bucket, window_start) do nothing;
  select attempts into minute_used from tactics_private.share_limits where bucket = minute_bucket and window_start = minute_window for update;
  select attempts into day_used from tactics_private.share_limits where bucket = day_bucket and window_start = day_window for update;
  if day_used >= day_cap then return greatest(1, ceil(extract(epoch from day_window + interval '1 day' - now())))::integer; end if;
  if minute_used >= minute_cap then return greatest(1, ceil(extract(epoch from minute_window + interval '10 minutes' - now())))::integer; end if;
  update tactics_private.share_limits set attempts = attempts + 1
    where (bucket = minute_bucket and window_start = minute_window) or (bucket = day_bucket and window_start = day_window);
  -- This account's expired windows only; create_shared_lineup keeps its own two-day cleanup.
  delete from tactics_private.share_limits
    where (bucket = minute_bucket and window_start < minute_window) or (bucket = day_bucket and window_start < day_window);
  return 0;
end $$;
revoke all on function tactics_private.account_request_budget(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function tactics_private.account_request_budget(uuid, text, integer, integer) to service_role;

create or replace function public.matches_detail_allowed(account uuid) returns integer
language sql security invoker set search_path = '' as $$
  select tactics_private.account_request_budget(account, 'matches', 30, 150);
$$;

create function public.catalogue_for_app() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare account uuid := auth.uid(); wait integer;
begin
  if account is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  wait := tactics_private.account_request_budget(account, 'catalogue', 60, 600);
  if wait > 0 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'retry_after=' || wait; end if;
  return jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'display_name', t.display_name, 'short_name', t.short_name,
        'color_primary', t.color_primary, 'color_secondary', t.color_secondary, 'sort_order', t.sort_order, 'catalogue_active', true) order by t.id)
      from public.catalogue_teams t where t.catalogue_active), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'team_id', p.team_id, 'display_name', p.display_name,
        'position_group', p.position_group, 'specific_position', p.specific_position, 'shirt_number', p.shirt_number, 'catalogue_active', true) order by p.id)
      from public.catalogue_players p join public.catalogue_teams t on t.id = p.team_id and t.catalogue_active where p.catalogue_active), '[]'::jsonb));
end $$;
revoke all on function public.catalogue_for_app() from public, anon;
grant execute on function public.catalogue_for_app() to authenticated;
commit;
