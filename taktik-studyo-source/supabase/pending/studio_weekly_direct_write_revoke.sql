-- SEC3 direct Studio/Weekly XI write revoke. NOT A MIGRATION YET: kept outside supabase/migrations so that
-- `supabase db push` cannot apply it together with 20261028130000_studio_weekly_write_rpc.sql.
--
-- Move it to supabase/migrations/<timestamp>_studio_weekly_direct_write_revoke.sql (timestamp after
-- 20261028130000) only after, in production:
--   1. 20261028130000_studio_weekly_write_rpc.sql is applied, and
--   2. the frontend that saves through public.save_studio_project() / public.save_weekly_lineup() is
--      published and verified (create, autosave, rename, duplicate, Weekly XI create/update).
-- Revoking earlier breaks saving in every published frontend that still writes the tables directly: a tab
-- opened before the new frontend can no longer save (autosave keeps the local copy) until it is reloaded.
--
-- Signed-in users then write both tables only through the two functions (one row per call, all checks
-- before the write). A table-level REVOKE also removes the column-level INSERT/UPDATE grants. SELECT and
-- DELETE stay; service-role writes are unaffected. Reversal, only to go back to a direct-write frontend:
--   grant insert (id, user_id, title, snapshot_version, snapshot) on public.studio_projects to authenticated;
--   grant update (title, snapshot_version, snapshot) on public.studio_projects to authenticated;
--   grant insert (id, user_id, title, season, week, formation, snapshot) on public.weekly_lineups to authenticated;
--   grant update (title, season, week, formation, snapshot) on public.weekly_lineups to authenticated;
begin;
revoke insert, update on public.studio_projects, public.weekly_lineups from authenticated;
commit;
