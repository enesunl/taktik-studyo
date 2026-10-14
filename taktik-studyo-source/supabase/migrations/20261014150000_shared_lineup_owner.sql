-- ACCOUNT1 (approved 14 Oct 2026: option A + purge legacy links).
-- Every shared lineup now belongs to the signed-in account that created it, so account deletion
-- removes that account's public links through the foreign key. Links created before this migration
-- have no owner and cannot be attributed; per the approved product decision they are removed.
-- Hosted rollout: apply together with the updated `lineups` Edge Function (separate approval).

delete from public.shared_lineups;

alter table public.shared_lineups
  add column owner_id uuid not null references auth.users(id) on delete cascade;
create index shared_lineups_owner_idx on public.shared_lineups(owner_id);
comment on column public.shared_lineups.owner_id is
  'Verified creator (set server-side from the caller JWT). Never returned by the public read endpoint.';

-- Same quota logic as football_backend; the owner is supplied only by the server after JWT verification.
drop function public.create_shared_lineup(jsonb,text);
create function public.create_shared_lineup(payload jsonb,client_bucket text,owner uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare minute_window timestamptz:=date_bin('10 minutes',now(),'2026-01-01'::timestamptz); day_window timestamptz:=date_trunc('day',now()); b text; w timestamptz; cap integer; used integer; answer uuid;
begin
  if owner is null then raise exception 'Owner required' using errcode='22023'; end if;
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
  insert into public.shared_lineups(team_name,formation,lineup_data,drawing_data,owner_id)
    values(payload->>'team_name',payload->>'formation',payload->'lineup_data',payload->'drawing_data',owner) returning public_id into answer;
  return answer;
end $$;
revoke all on function public.create_shared_lineup(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.create_shared_lineup(jsonb,text,uuid) to service_role;
