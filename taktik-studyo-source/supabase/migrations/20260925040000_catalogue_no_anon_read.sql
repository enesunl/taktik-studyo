-- SEC1.1 (written 2026-10-15). LOCAL PROPOSAL; production application requires explicit approval.
-- 20260925035438_catalogue_identity_foundation grants anon SELECT on the BSD catalogue.
-- Every reader is a signed-in page (boards, Studio, Weekly XI, onboarding, profile) or
-- server code, so anonymous access is unnecessary. It would also expose the full BSD player
-- dataset through the public REST API (licence §4: no mirroring or redistribution as an API).
-- Versioned directly after the foundation, so production never has a window with anonymous
-- read. Signed-in reads of active rows, the server-only mapping tables and all write grants
-- are unchanged. No data, table or policy is deleted.
-- Reversal: grant select ... to anon; alter policy ... to anon,authenticated;
begin;
revoke select on public.catalogue_teams, public.catalogue_players from anon;
alter policy catalogue_teams_read on public.catalogue_teams to authenticated;
alter policy catalogue_players_read on public.catalogue_players to authenticated;
commit;
