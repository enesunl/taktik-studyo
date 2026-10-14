# UX3 — Navigation, Weekly XI, theme toggle and startup

Local implementation on `release/netlify-migration`, based on
`2cce8c67efbd22cd183a8052465be5aebb466008`. No commit, push, deployment,
database reset, migration or hosted/production mutation was performed.

## Navigation and retired Comparison

The Weekly XI HTML used a different link order from other product pages.
The duplicated static navigation now follows one tested DOM contract:
Studio → Tactical Board → Weekly XI → Matches → Profile. Active-page styling
uses `aria-current`; it does not reorder elements. Auth/onboarding pages retain
their specialized navigation.

Comparison-only `dist/comparison.js` and `dist/comparison.css`, its active mount
branch, advertised links and exclusive shared-stylesheet selectors are removed.
Both former routes (`/karsilastirma` and `/karsilastirma.html`) resolve to a small
redirect document targeting `/studyo.html`, with an accessible fallback link.
The router also handles the retired route without starting Auth or reading drafts.
An old allowlisted Auth redirect to Comparison resolves to Tactical Board.
Shared board helpers, old left/right draft keys and stored data remain intact;
independent board and draft-isolation regression tests remain.

## Real Weekly XI records in Profile

Weekly XI already saves **one lineup per account and catalogue source** in this
browser, at `taktik:weekly-xi:<user-id>:<canonical|legacy>:v1`. Despite the storage
key suffix, current normalized snapshots are version 2 and legacy snapshots remain
readable. These are explicit saves, not Supabase Studio Project rows.

Profile reads only the validated current user's two namespaces. Each valid save
shows its formation, occupied slot count and real saved timestamp when available.
Old saves have no timestamp and explicitly say so. The editor saves `savedAt` on
the next deliberate save; opening Profile does not rewrite old data.

An entry opens `/haftanin-ilk-11i?saved=canonical` or `?saved=legacy` under the
normal protected guard. The parameter chooses only a known storage namespace;
it cannot select another user. Reopening restores formation, player identities,
slot assignments and moved positions. Saving updates the same key and timestamp,
without creating duplicates. Storage events refresh an open Profile; its listener
is removed on disposal. The existing backend handles bfcache revalidation/remount.

Snapshots do not store a week or title. Profile therefore uses a descriptive
generic title rather than inventing week metadata. The editor's decorative week
remains the latest played match week. No additional preview renderer or delete
workflow was introduced.

Browser storage is partitioned by account for application behavior, **not secure
isolation from someone controlling the shared browser**. There is no cross-device
sync. The UI says so. Existing `studio_projects` supports free/match two-team
snapshots, not Weekly XI snapshots; silently reusing it would violate that contract.
This local integration needs no migration. Cloud Weekly XI would require a
separately approved snapshot/storage contract with authenticated ownership/RLS.

## Theme toggle

`theme.js` already applies the persisted root theme synchronously in the document
head. The toggle is parsed later with an initial false `aria-pressed`; its old CSS
used that attribute for thumb position and enabled transitions unconditionally.
DOM-ready synchronization therefore caused an unwanted OFF-to-ON animation.

Thumb position and icon now derive from the already-initialized root theme.
Transitions are off by default and enabled only by an explicit toggle click.
Initialization, system preference and storage synchronization do not animate.
Existing persisted theme, accessible pressed state/labels, page colors and reduced
motion behavior are preserved. No timeout or page-wide loading gate was added.

## Studio startup

Observed source sequence: document/head theme → local styles and backend bundle →
page bootstrap → server-validated Auth → onboarding preference gate → catalogue →
personal player overrides → board/Studio mount → optional project/match restore.
The backend is a bundled entry, not a new dynamic-import boundary. Project restore
and tactical drawing initialization still run in their existing mount lifecycle.

Two avoidable sequential dependencies were verified and covered by deferred tests:

1. After identity/onboarding checks, catalogue and personal overrides can load
   concurrently. Both must finish before mounting, so initial players include
   overrides. Errors and account switches dispose pending ownership scopes and
   never mount stale content.
2. Canonical default-XI data can load alongside team/player catalogue reads.
   Runtime installation still waits for both; single-flight and cache behavior
   are preserved. Players remain paginated after the team read.

A redundant classic-board call to `backend.loadCatalogue()` was removed. It was
already single-flight, so this is not claimed as removal of an extra network call.
No Auth checks, RLS rules, local fail-closed handling or error classification were
bypassed. No new cache or production fallback was introduced.

Real browser cold/warm timings were **not measured**: the available browser
inventory had no connected browser. Deferred tests establish concurrency/order,
not elapsed-time improvements. Bundle parse/render cost, live Auth latency and
saved-project restore latency remain unmeasured. Browser visual/navigation and
performance checks remain manual acceptance items.

## Verification

`tests/ux3.test.mjs` covers navigation/retired URLs, actual local saves appearing in
Profile, exact reopen/update behavior, old metadata, storage failures, account and
source separation, listener disposal, concurrent startup, stale account handling,
fail-closed catalogue errors and canonical single-flight installation.
Theme tests cover light/dark initialization across repeated page initialization,
accessible state, user-click transitions and nonanimated external synchronization.
Obsolete Comparison page expectations were replaced with retirement assertions;
shared engine regression coverage remains.

The final task report records `npm test`, board regression, `npm run build` and
`git diff --check` results. `dist/backend.js` is regenerated only by the build.
No real browser interaction or measured startup speedup is claimed.

## Final local results

- `npm test`: 657 passed, 0 failed, 0 skipped.
- Board regression: all 9 groups passed.
- `npm run build`: passed; generated backend adapter reports configured.
- `git diff --check`: passed (only Git line-ending normalization notices).
- Browser bundle credential pattern scan: no secret key, service-role JWT, private key or credential-bearing PostgreSQL URL matches. This is a bounded pattern scan, not a comprehensive security audit.
- Tracked diff: 42 files, 143 insertions, 162 deletions. The two new untracked files below are additional and are not included in `git diff --stat`.
- Working tree: 40 modified tracked files, 2 intentionally deleted Comparison assets, 2 new files; nothing staged or committed.
- Remaining manual acceptance: browser visual/navigation checks and cold/warm startup timings. No implementation blocker or migration requirement for the local Profile integration.

## Exact changed/deleted/added files

Paths are relative to `taktik-studyo-source`. `dist/comparison.js` and
`dist/comparison.css` are deleted. This document and `tests/ux3.test.mjs` are new.
`dist/backend.js` is build-generated; the other changed dist files are maintained source.

```text
UX3_NAVIGATION_PROFILE_THEME_PERFORMANCE.md
dist/app.js
dist/backend.js
dist/calismalarim.html
dist/comparison.css
dist/comparison.js
dist/haftanin-ilk-11i.html
dist/index.html
dist/karsilastirma.html
dist/mac-studyosu.html
dist/mac.html
dist/maclar.html
dist/profil.html
dist/profile.css
dist/routes.css
dist/studyo.html
dist/styles.css
dist/theme.css
dist/theme.js
src/lib/auth-redirects.js
src/lib/catalogue-source.js
src/lib/page-bootstrap.js
src/lib/page-routes.js
src/lib/profile-ui.js
src/lib/weekly-xi-ui.js
src/lib/weekly-xi.js
tests/auth-email-gate.test.mjs
tests/auth-initialization.test.mjs
tests/auth-routes.test.mjs
tests/auth-validation-cleanup.test.mjs
tests/auth.test.mjs
tests/board-regression.cjs
tests/catalogue-cutover.test.mjs
tests/catalogue-local-server.test.mjs
tests/helpers/profile-fixture.mjs
tests/local-static-server.test.mjs
tests/player-jersey.test.mjs
tests/player-overrides-ui.test.mjs
tests/studio-layout.test.mjs
tests/studio-product.test.mjs
tests/studio-projects-ui.test.mjs
tests/theme-workspace.test.mjs
tests/ux3.test.mjs
tests/weekly-xi.test.mjs
```
