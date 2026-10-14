# UX4 implementation and verification

Work continues on `release/netlify-migration` over the uncommitted UX3 changes.
Those changes were retained. No commit, push, deploy, database reset or hosted
Supabase mutation was performed. Manual acceptance is still required.

## Six improvements

1. **Names:** the classic and two-team boards previously forced single-line
   clipping. Their bounded labels now wrap to two lines; full names remain in
   accessible labels and titles. Canonical player data is unchanged. Weekly XI
   uses measured two-line labels in a shared vector renderer, with full-name
   titles/accessibility on the editor controls. User-dragged overlapping positions
   are not automatically rearranged.
2. **Startup:** UX3 had already parallelized catalogue and overrides. A remaining
   verified blocker was `catalogue-source.load()` waiting for `defaults`: the
   local service may fetch a season and sequential recent match details for up
   to 18 teams. That enrichment now runs in the background. Valid catalogue data
   and personal overrides still precede mounting. The existing deterministic
   squad fallback is available immediately; enrichment never resets an open
   board. Later team selections can use confirmed defaults when ready. Catalogue
   failure remains fail-closed; no hosted fallback or Auth caching was added.
3. **Auth loading:** every full-document navigation still requires server user
   validation and the onboarding gate. The previous large verification notice is
   now a small, neutral public-shell status beneath navigation. Protected content
   stays hidden/inert until authorization. No personal data is rendered early;
   invalid sessions, account switches and recovery sessions retain their guards.
4. **Preview:** independent HTML and SVG player rendering caused different fonts,
   numbers, label truncation and geometry. `weekly-xi-pitch.js` now draws the
   visual pitch in editor, preview and PNG using the same 736×750 coordinates,
   jersey paths, Arial typography and wrapped text. Transparent native editor
   controls retain selection/keyboard/drag interactions. PNG remains a standalone
   vector-to-canvas export without remote media or foreignObject.
5. **Saving:** the primary runtime uses `createWeeklyLineups` on the existing Auth
   Supabase client for editor, Profile and collection. New saves have unique UUIDs;
   edits use the same UUID and revision comparison. Only a server-confirmed result
   sets success. Profile shows four recent real records and **Hepsini gör →**.
   `/ilk-11lerim` and `/ilk-11lerim.html` list all pages of records, grouped by
   season/week in recent-first order, including an unassigned-week group. Short
   and full season spellings group together. A strict Weekly XI UUID URL allowlist
   preserves the selected record through login; arbitrary queries remain rejected.
6. **Account:** the Profile account section now shares compact label/value/action
   columns for profile fields, football preference and session actions, with
   dividers and narrow-screen rules. Existing edit, favorite-team change/clear and
   logout logic is retained.

## Persistence and local database

`studio_projects` was inspected locally: its free/match-only mode and two-team
snapshot constraints remain unchanged. Weekly XI has a different 11-slot v2
snapshot and therefore uses a separate `public.weekly_lineups` table.

Applied **only** to `supabase_db_taktik-studyo` (Postgres 54322 / Auth API 54321):

- `20261013165455_weekly_lineups.sql`: UUID primary key, owning `auth.users` FK
  with cascading deletion, title, nullable season/week, formation, snapshot,
  revision and timestamps; owner/recent index; four ownership RLS policies.
- `20261014074114_weekly_snapshot_validation.sql`: strengthens the new validator's
  null/malformed-field handling. It replaces only the newly introduced validator.

Anon receives no table privileges. Authenticated INSERT/UPDATE grants cover only
client fields; ownership/revision/timestamps cannot be reassigned through UPDATE.
The metadata trigger is security invoker. Snapshots are bounded to 50 KB and 11
slots, canonical UUID player identities, unique selected players and bounded
positions. Application validation additionally reuses the existing Weekly XI
snapshot normalizer. The independent local catalogue database cannot be a FK
target; UUID syntax/shape is validated, not a cross-database catalogue FK.

The implementation follows the separation of grants and owner policies described
in [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Local browser saves are **not uploaded or removed automatically**. The editor
offers available canonical/legacy namespaces for explicit import; the user then
clicks Save to upload. Noncanonical legacy player IDs cannot silently become
canonical identities: those drafts are preserved and the UI asks for reselection.
Imported drafts keep unknown season/week null. New untouched records can use real
latest-played match metadata; the URL week never supplies it. Users can enter
metadata explicitly. Multiple records per week are supported.

Production does not have these migrations applied by this task. A hosted rollout
would require separate approval; missing schema produces a controlled failure,
not a false local save success. Local dev's in-memory backend bundle requires
restarting `npm run dev` if it was running before these source changes.

## Verification and limitations

- `npm test`: **666 passed, 0 failed, 0 skipped**; all **9 board regression**
  groups passed. After the final season-label grouping adjustment, all 9 UX4
  focused tests passed again.
- `npm run build`: passed; `dist/backend.js` generated only by build.
- `git diff --check`: passed; Git may print its pre-existing LF/CRLF notices.
- SQL/RLS: isolated PGlite plus real local Postgres checks passed for A CRUD,
  B denial, anonymous denial, grants, multiple same-week records, snapshot
  roundtrip, revision metadata and invalid snapshots.
- Real local Auth + PostgREST smoke: create/list/reopen/update/rename/delete,
  duplicate-week records and cross-account isolation passed. Temporary API test
  accounts and their records were removed.
- The first SQL verification helper had an incorrectly escaped psql error-stop
  option. It was fixed to `-v ON_ERROR_STOP=1`; real rollback assertions then
  passed. Four earlier local fixture accounts were identified through the unique
  test snapshot and their shared INSERT transaction IDs and removed; remaining
  matching test lineups were verified as zero. No real account was removed.
- One full run hit the existing local-server test's five-second startup timeout
  under concurrent tests. The isolated check passed, followed by a clean full run.
  No timeout or assertion was relaxed.
- Browser output credential/fixture scan found no secret-key, service-role JWT,
  private-key, PostgreSQL credential URL or tested fixture patterns.
- No connected browser was available. **No visual browser acceptance or measured
  cold/warm Studio before/after timing is claimed.** Deferred tests prove the
  nonblocking enrichment ordering; they do not quantify a real user speedup.

## Exact UX4 file scope

The working tree also contains UX3 changes listed in its separate report. UX4
adds/edits the following paths (relative to this repository):

```text
dist/backend.js (generated)
dist/calismalarim.html
dist/haftanin-ilk-11i.html
dist/hos-geldin.html
dist/ilk-11lerim.html (new)
dist/mac-studyosu.html
dist/mac.html
dist/maclar.html
dist/match-detail.css
dist/profil.html
dist/profile.css
dist/routes.css
dist/studyo.html
dist/styles.css
dist/weekly-xi.css
scripts/serve-local.cjs
scripts/verify-weekly-lineups-local.mjs (new)
scripts/verify-weekly-lineups-api-local.mjs (new)
src/lib/auth-redirects.js
src/lib/catalogue-source.js
src/lib/page-bootstrap.js
src/lib/page-routes.js
src/lib/profile-ui.js
src/lib/weekly-lineups.js (new)
src/lib/weekly-lineups-ui.js (new)
src/lib/weekly-xi-pitch.js (new)
src/lib/weekly-xi-export.js
src/lib/weekly-xi-ui.js
supabase/migrations/20261013165455_weekly_lineups.sql (new)
supabase/migrations/20261014074114_weekly_snapshot_validation.sql (new)
tests/dev-local-supabase.test.mjs
tests/helpers/match-board-fixture.mjs
tests/local-static-server.test.mjs
tests/profile-ui.test.mjs
tests/project-source-routing.test.mjs
tests/theme-workspace.test.mjs
tests/ux3.test.mjs
tests/ux4.test.mjs (new)
tests/weekly-xi-export.test.mjs
UX4_STUDIO_WEEKLY_PROFILE.md (new)
```
