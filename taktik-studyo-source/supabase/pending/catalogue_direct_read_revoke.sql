-- PROD5.7 Direct catalogue read revoke. NOT A MIGRATION YET: kept outside supabase/migrations so that
-- `supabase db push` cannot apply it together with 20261016170000_catalogue_app_read.sql.
--
-- Move it to supabase/migrations/<timestamp>_catalogue_direct_read_revoke.sql (timestamp after
-- 20261016170000) only after, in production:
--   1. 20261016170000_catalogue_app_read.sql is applied, and
--   2. the frontend that reads the catalogue through public.catalogue_for_app() is published and
--      verified (rosters, player picker, Weekly XI, onboarding).
-- Revoking earlier breaks every published frontend that still reads the tables directly.
--
-- Signed-in users then reach the BSD catalogue only through catalogue_for_app() (selected fields,
-- per-account limits). The legacy FotMob tables become server-only; a legacy rollback build no longer
-- works. Anonymous access and the provider mapping tables are already closed. Service-role tooling
-- (catalogue import, matches, seed checks) is unaffected. Reversal: grant select on the four tables to
-- authenticated.
begin;
revoke select on public.catalogue_teams, public.catalogue_players from authenticated;
revoke select on public.teams, public.players from authenticated;
commit;
