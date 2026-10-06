# Favorite Team O3

Local implementation; no migration, production mutation, commit or deployment.

## Data contract

- `profiles.favorite_team_slug` remains the only persisted favorite field, on the Auth/Profile client (Supabase Local in development).
- Active teams are read through `createCanonicalCatalogue(dataClient).loadTeams()`. The local `dataClient` is the existing canonical PGlite transport. Normalized teams have `id` (canonical slug), `name`, `color`, `color2`, `catalogueActive`.
- Profile writes reuse `setFavoriteTeam(slug)` / `clearFavoriteTeam()`. Neither changes onboarding version/completion. No copied names/colors or provider IDs are persisted.
- Matches already receive `home.teamId` / `away.teamId` from the server's BSD-to-canonical resolver. O3 compares these IDs only. Missing mapping results in no personalization; no name matching or additional direct provider requests.

## Profile

The compact Account section has a separate Football Preference row. Its controller loads independently of identity, edit form and projects. A pending or failed optional load cannot block the core workspace, navbar theme or logout.

The inline selector uses native radio buttons, color markers, check text, focus styling, save/cancel/remove buttons, live status and restored opener focus. The small radio helper is shared with O2; there is no second hardcoded team list. Saves are single-flight, retain selection on failure, and check the protected page's current identity before updating UI. Successful saves update the row and avatar immediately.

Only two thin avatar rings use validated six-digit hex colors. Avatar text/background keep their existing light/dark theme contrast. Missing/invalid colors, null preference or stale slug use the neutral appearance. A failed catalogue lookup never clears the stored slug. A stale preference can be changed or explicitly removed.

## Matches

The existing week/default-week/URL logic is unchanged. After filtering and chronologically sorting the displayed week as before, find the first match containing the resolved favorite canonical ID. Move only that match to the front using a stable splice-style composition. All remaining matches retain relative order. No favorite, stale preference, absent match or load failure preserves the original list.

The promoted card retains the normal structure and adds a small accessible “Favori takımın” label. It gets its own date group, leaving the remaining chronological groups accurate. Optional preference completion does not overwrite a match loading/error state or a disposed page.

## Validation

- `npm test`: **614 passed, 0 failed**, plus all **9 board regression groups**.
- Includes isolated, real SQL/RLS tests in in-memory PGlite: profile ownership, favorite set/clear preserving onboarding completion, schema failure isolation, project permissions and other database regressions. No hosted database is used by these tests.
- New coverage: favorite display/change/clear, radio selection, cancel/Escape/focus, duplicate-submit prevention, failed-save preservation, accent validation, stale slug, optional-load failure/pending isolation, account-change/dispose safety, stable match promotion, unchanged week/URL, absent/failing preference, existing provider mapping, and all 18 O2 teams.
- Existing registration/recovery/profile/projects/theme and onboarding suites pass.
- An initial full run hit the existing local-server test's 5-second startup timeout under parallel test load. The isolated test passed; the subsequent complete `npm test` run passed without changing that test or its timeout.
- `npm run build`: passed; `dist/backend.js` generated only by the build.
- `git diff --check`: passed.

## Local browser checklist

These interactive checks with a signed-in local user have **not been performed by the agent**. Automated UI/service/SQL tests above were performed. No existing user's preferences were changed for testing.

1. Open `http://localhost:4173/profil` with a completed-onboarding local account whose slug is `galatasaray`. Confirm Galatasaray, subtle avatar rings, identity and projects; toggle navbar theme.
2. Change to Beşiktaş, save, then reload. Confirm slug `besiktas` through the local profile row; `onboarding_completed_at` and `onboarding_version` stay unchanged.
3. Remove the favorite; confirm `NULL`, “Seçilmedi”, neutral avatar and unchanged onboarding completion.
4. Choose a team playing in the selected `/maclar?hafta=...` week. Confirm its single match is first, with its correct date and small label. Compare remaining order, week and URL before/after; switch weeks.
5. At desktop and narrow/mobile widths, check long names, radio keyboard navigation, cancel/Escape focus return, and readable dark/light colors.

Local development serves an in-memory bundle created at server startup. Restart `npm run dev` after source changes if an older server is still running; a production-style `npm run build` alone does not replace that in-memory bundle.

The old local server was restarted for O3. Read-only HTTP checks confirmed `/profil` and `/backend.js` return 200, the served bundle includes the new favorite UI, and its Auth target is `http://127.0.0.1:54321`.

## Files

New: `src/lib/favorite-team.js`, `src/lib/profile-favorite-ui.js`, `src/lib/team-choice.js`, `tests/favorite-team.test.mjs`, this document.

Updated: `src/lib/profile-ui.js`, `src/lib/page-bootstrap.js`, `src/lib/matches-ui.js`, `src/lib/onboarding-ui.js`, `dist/profil.html`, `dist/profile.css`, `dist/matches.css`, generated `dist/backend.js`, `tests/helpers/profile-fixture.mjs`, `tests/profile-ui.test.mjs`, `tests/onboarding-ui.test.mjs`, `tests/catalogue-clean-sync.test.mjs`.
