-- Local source preparation only; production application requires explicit approval.
-- Keep the existing anon grants/policies and every sharing permission unchanged.
begin;

grant select on public.teams, public.players to authenticated;

-- USING (true) is intentional: the same public catalogue is readable after login.
create policy teams_authenticated_catalogue on public.teams
  for select to authenticated using (true);
create policy players_authenticated_catalogue on public.players
  for select to authenticated using (true);

commit;
