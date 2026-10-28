-- SEC3 rollback for 20261028180000_studio_weekly_direct_write_revoke.sql. NOT A MIGRATION: kept outside
-- supabase/migrations so that `supabase db push` cannot apply it together with the revoke.
--
-- Restores exactly the column-level INSERT/UPDATE grants of authenticated that existed before the revoke
-- (production, 2026-10-28). Use only to go back to a direct-write frontend: copy it to
-- supabase/migrations/<timestamp>_studio_weekly_direct_write_regrant.sql (timestamp after 20261028180000)
-- and apply it with explicit approval, so it is recorded in the migration history.
begin;
grant insert (id, user_id, title, snapshot_version, snapshot) on public.studio_projects to authenticated;
grant update (title, snapshot_version, snapshot) on public.studio_projects to authenticated;
grant insert (id, user_id, title, season, week, formation, snapshot) on public.weekly_lineups to authenticated;
grant update (title, season, week, formation, snapshot) on public.weekly_lineups to authenticated;
commit;
