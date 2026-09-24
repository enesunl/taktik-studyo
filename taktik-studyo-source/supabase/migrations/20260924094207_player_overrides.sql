-- M5.1 LOCAL ONLY. Production application requires separate explicit approval.
begin;
create table public.player_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_key text not null check (player_key ~ '^(local:[a-zA-Z0-9_-]{1,80}|bsd:[1-9][0-9]{0,15})$'),
  name text not null check (name=btrim(name) and char_length(name) between 1 and 24
    and name collate "C" !~ '[[:cntrl:]]' and name !~ U&'[\0080-\009F]'),
  number smallint check (number between 1 and 99),
  role text not null check (role in ('KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,player_key)
);
alter table public.player_overrides enable row level security;
revoke all on public.player_overrides from public,anon,authenticated;
grant select,delete on public.player_overrides to authenticated;
grant insert(user_id,player_key,name,number,role) on public.player_overrides to authenticated;
grant update(name,number,role) on public.player_overrides to authenticated;
create policy player_overrides_select_own on public.player_overrides for select to authenticated using ((select auth.uid())=user_id);
create policy player_overrides_insert_own on public.player_overrides for insert to authenticated with check ((select auth.uid())=user_id);
create policy player_overrides_update_own on public.player_overrides for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy player_overrides_delete_own on public.player_overrides for delete to authenticated using ((select auth.uid())=user_id);
-- Reuse existing invoker trigger; no new RPC or changes to existing functions.
create trigger player_overrides_updated before update on public.player_overrides
for each row execute function tactics_private.touch_updated_at();
commit;
