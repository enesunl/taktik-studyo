-- PROD5.3 Per-account match-detail limits for the matches Edge Function. PROPOSAL FOR REVIEW:
-- production only with explicit approval, and before matches is deployed.
--
-- 30 match details per account per 10 minutes and 150 per UTC day, shared by every Edge instance.
-- Counters reuse tactics_private.share_limits under their own 'matches:' buckets; the sharing buckets
-- ('global:*', 'client:*') and create_shared_lineup are unchanged.
-- Only the service role can call this: the Edge Function passes the account it verified from the
-- user's JWT, never a value taken from the browser.
-- Returns 0 when the request is allowed (and counted), otherwise the seconds until the blocking
-- window resets; a rejected request is not counted.
begin;
create function public.matches_detail_allowed(account uuid) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  minute_window timestamptz := date_bin('10 minutes', now(), '2026-01-01'::timestamptz);
  day_window timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  minute_bucket text := 'matches:10m:' || account;
  day_bucket text := 'matches:day:' || account;
  minute_used integer; day_used integer;
begin
  if account is null then raise exception 'account_required' using errcode = '22023'; end if;
  -- Both rows exist before locking, always in the same order: parallel requests of one account
  -- queue on these row locks, so the caps are exact across Edge instances.
  insert into tactics_private.share_limits(bucket, window_start, attempts)
    values (minute_bucket, minute_window, 0), (day_bucket, day_window, 0)
    on conflict (bucket, window_start) do nothing;
  select attempts into minute_used from tactics_private.share_limits where bucket = minute_bucket and window_start = minute_window for update;
  select attempts into day_used from tactics_private.share_limits where bucket = day_bucket and window_start = day_window for update;
  if day_used >= 150 then return greatest(1, ceil(extract(epoch from day_window + interval '1 day' - now())))::integer; end if;
  if minute_used >= 30 then return greatest(1, ceil(extract(epoch from minute_window + interval '10 minutes' - now())))::integer; end if;
  update tactics_private.share_limits set attempts = attempts + 1
    where (bucket = minute_bucket and window_start = minute_window) or (bucket = day_bucket and window_start = day_window);
  -- This account's expired windows only; create_shared_lineup keeps its own two-day cleanup.
  delete from tactics_private.share_limits
    where (bucket = minute_bucket and window_start < minute_window) or (bucket = day_bucket and window_start < day_window);
  return 0;
end $$;
revoke all on function public.matches_detail_allowed(uuid) from public, anon, authenticated;
grant execute on function public.matches_detail_allowed(uuid) to service_role;
commit;
