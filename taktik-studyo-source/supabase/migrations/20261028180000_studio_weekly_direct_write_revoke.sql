-- SEC3 direct Studio/Weekly XI write revoke (Stage C). Production only with explicit approval, after:
--   1. 20261028130000_studio_weekly_write_rpc.sql is applied, and
--   2. the frontend that saves through public.save_studio_project() / public.save_weekly_lineup() is
--      published and verified (create, autosave, rename, duplicate, Weekly XI create/update).
-- A tab opened before that frontend can no longer save (autosave keeps the local copy) until it is reloaded.
--
-- Signed-in users then write both tables only through the two functions (one row per call, all checks
-- before the write). A table-level REVOKE also removes the column-level INSERT/UPDATE grants. SELECT and
-- DELETE stay; service-role writes are unaffected. Reversal, only to go back to a direct-write frontend:
-- supabase/pending/studio_weekly_direct_write_regrant.sql (kept out of supabase/migrations so that
-- `supabase db push` cannot apply it together with this revoke).
begin;
revoke insert, update on public.studio_projects, public.weekly_lineups from authenticated;
commit;
