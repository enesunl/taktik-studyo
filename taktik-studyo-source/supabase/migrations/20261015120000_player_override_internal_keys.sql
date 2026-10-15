-- PROD1.5 (cutover plan M2). Production application requires explicit approval.
-- BSD canonical boards key personal player overrides by internal catalogue UUID
-- ('internal:<uuid>'). Existing 'local:<legacy-id>' and 'bsd:<id>' rows stay valid and
-- untouched. Only the accepted key syntax widens: ownership, RLS, grants and data are
-- unchanged. Same rule as the D3 local harness (supabase/local/catalogue_override_keys.sql).
-- Reversal (only while no internal: rows exist): restore the previous two-namespace check.
begin;
alter table public.player_overrides drop constraint player_overrides_player_key_check;
alter table public.player_overrides add constraint player_overrides_player_key_check
  check (player_key ~ '^(local:[a-zA-Z0-9_-]{1,80}|bsd:[1-9][0-9]{0,15}|internal:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$');
commit;
