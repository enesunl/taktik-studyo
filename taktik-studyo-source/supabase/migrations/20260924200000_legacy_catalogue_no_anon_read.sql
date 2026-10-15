-- SEC1 (written 2026-10-15). Production application requires explicit approval.
-- The legacy FotMob-sourced catalogue (public.teams/public.players) is no longer readable
-- without a session. Signed-in reads (20260920094922_catalogue_authenticated_read) and
-- service_role reads are unchanged until the BSD catalogue cutover.
-- No data, table or policy is deleted. The anon policies stay but are inert without a grant.
-- Versioned right after the last migration applied in production (20260924094207), so this
-- hotfix can be applied on its own before the pending queue without reordering history.
-- Reversal: grant select on public.teams, public.players to anon;
begin;
revoke select on public.teams, public.players from anon;
commit;
