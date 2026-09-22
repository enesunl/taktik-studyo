# M3 — Match Studio

## UX follow-up (current behavior)

This follow-up supersedes the original positions-only/no-bench presentation below.
Selection now shares the main Studio's jersey glow CSS rule; no dashed selection
box. Two-player formation lines use y=33/67 instead of 14/86, three-player lines
use y=22–78 (span 56); other lines keep
14–86. Mirroring and broad-position assignment remain unchanged.

The pitch keeps 1.6:1 proportions and is 60px narrower (about 37.5px shorter),
centered in its viewport; mobile minimum width is now 800px. Browser visual QA
remains pending because the computer tool still reports no browser surfaces.

Selecting a player opens a contextual same-team bench below the pitch. Click a
reserve to replace that selected player, or drag a reserve onto a same-team pitch
player. The outgoing player returns to reserves; the total stays 22. Pitch-to-pitch
drop swaps coordinates, including across teams, without exchanging team identity.
Keyboard arrows still move players; select one and use Shift+Enter on another to
swap. Native bench buttons support keyboard activation; Escape closes selection.
Reset restores original XI identities and coordinates. No persistence was added.

The working map now stores the occupying player identity alongside coordinates;
reserves are derived from the immutable roster minus current occupants. No second
roster state, provider mutation, new network endpoint or tactical-interaction fetch.

`match-goals.js` serves both scoreboards and player markers. It groups confirmed
goal incidents by side/player ID, preserving every minute/added minute; absent IDs
are not merged by name. Provider `goal_type` is retained as a bounded normalized
kind. Regular/penalty goals count toward small per-player balls; rescinded goals
do not. Own goals are labelled KK, credited to the opponent when the scorer's roster
membership is known, and excluded from normal player goal badges. With missing or
ambiguous roster membership the incident side is retained rather than guessed.
Penalty goals are marked P. Scoreboard totals themselves remain provider values.
No score-derived/fabricated goals, media or new provider resource.

The existing incidents endpoint was inspected read-only for 215997: four regular
goals and a 90+8 penalty; no own goal was present in that sample. Own-goal handling
is fixture-tested, not claimed as live-sample verification. Goal metadata follows
player identity during tactical replacements; historical scoreboards do not change.

Seven added UX regression tests cover goal grouping, cancelled/own/penalty cases,
both scoreboards, compact layout/shared selection, field/keyboard swaps, contextual
bench replacements, invalid/cancelled drops and account disposal during bench drag.
Follow-up validation: **330 tests passed**, **9/9 board regression groups passed**,
`npm run build` succeeded; backend.js was generated only by the build.
Live normalized 215997 verification also passed: home/away player goal sums 3/2,
scoreboard scorer groups 3/2, 10 reserves each, 90+8 penalty marker present. The
local server was restarted to load the new goal-kind field. Output secret scan
and `git diff --check` passed. No real-browser visual or Network result is claimed.

Local implementation: **2026-09-22**. No commit/push/deploy, production mutation,
secret change, Auth setting, database migration or Netlify configuration change.
**PRODUCTION DEPLOYMENT BLOCKED PENDING PROVIDER-LICENSE RECHECK** remains active.
The M1 review referenced BSD v4.0 effective **2026-10-01**; M3 is not release approval.

## Entry and route

`/mac-studyosu?id=215997&hafta=6` and `/mac-studyosu.html` use the same protected
route/bootstrap/server-user validation as Match Center. The exact canonical route
is added to the existing safe-next allowlist; Auth logic is unchanged. Recovery,
anonymous and unconfirmed sessions cannot mount it. No catalogue/profile bootstrap.
ID uses the M2 safe-positive-integer contract; week independently uses 1–34.
Back navigation is `/mac?id=<id>&hafta=<valid week>`, independent of referrer.
As in M2, login's existing safe-next contract does not retain query parameters.

Match Center's entry is a native anchor only when both confirmed XIs are valid.
Otherwise it is disabled with “Kadrolar açıklandığında kullanılabilir”. Direct
visits show a controlled unavailable state; invalid IDs cause no data request.
Loading/error/retry and stale-account cancellation reuse the M2 pattern.

## Architecture decision: focused createMatchBoard

Selected option B: `src/lib/match-board.js` owns one two-team, positions-only pitch.
It reuses `dist/app.js` through a small `TAKTIK_BOARD_UTILS` boundary:

- The existing generic `createJersey` was moved out of the single-board closure,
  without changing its SVG or textContent number insertion.
- Existing `jerseyNumberColor` and clamp are shared.
- Percentage-coordinate drag math and pointer-listener registration/cleanup were
  extracted into small helpers and used by both regular and match player dragging.
- The existing board's swap, undo, drawing, bench, drafts and readonly lifecycle
  remain in their original implementation. Comparison still mounts two boards.

Match Studio loads the existing classic `app.js` definitions before backend.js;
it does not call createTacticsBoard, mountStudio or mountShared. No second jersey
implementation, roster editor or duplicated single-board engine. A separate board
is appropriate because M3 freely moves two immutable squads without roster swaps,
formation selection or tactical drawing tools. M4 can add a tool/overlay layer to
the same normalized pitch root; M3 adds no visible drawing placeholders.

## Input validation and placement

`match-layout.js` reduces normalized M2 detail into a deeply frozen small model:
matchId; each team's provider identity/name/colors/formation; 11 players with
stable `match:team:player` keys, ID/number/name/broad position and initial X/Y.
No statistics, incidents, substitutes or media are copied into board state.

Both teams must have confirmed, complete 11-player XIs, unique valid IDs and
exactly one explicitly designated goalkeeper. Missing IDs, 10/12 players,
duplicates or predicted lineups fail closed. Same names/numbers do not identify
players. Team-qualified keys also avoid cross-team ID collisions.

One additive M2 normalizer field, **startersValid**, records raw XI integrity:
raw count must be 11 and all 11 must survive validation/deduplication. Without
this field, a malformed 12-row source could collapse into an apparently complete
XI. Old cached payloads without the flag remain unavailable until refreshed.
M2 list rendering is unchanged. The flag reports the normalization issue without
logging raw provider/player data. This adds no new provider endpoint or request.

Real 215997 lineup shape was inspected with one read-only GET: both teams have
G, D, D, D, D, M, M, M, M, M, F order. Available player fields include ID, name,
short name, broad position, number, captain and score; **no tactical grid/slot**.

Formation parser accepts 2–5 positive single-digit lines totaling 10 outfield
players. Tests cover 4-3-3, 4-4-2, 4-2-3-1, 4-1-4-1, 3-4-3, 3-5-2, 3-4-2-1,
5-3-2 and 5-4-1, plus malformed/incorrect totals. Goalkeeper is separate.

Outfield players are stably grouped by defender/midfielder/forward/unknown,
preserving provider order within groups, then assigned across generic lines.
Home GK starts at x=7%; outfield lines span x=18–45%. Away mirrors only X
(`100-x`), placing its GK at 93% and forwards toward 55%; Y order and labels
remain upright. Rows distribute players across y=14–86%, with a single player
at 50%. Initial opponents therefore have a safe central gap.

Missing/invalid formation uses actual nonempty broad-position group counts as
lines and displays “Diziliş bilgisi mevcut değil”. It does not claim 4-4-2 or infer
LB/RW/CB/etc. Display labels stay KL/DEF/ORT/FOR/—. **Positions are an approximate
tactical visualization, not verified real starting coordinates.** Reset restores
that source-derived approximation, not tracking data.

## Board interaction and mobile

One full horizontal local SVG pitch, ratio 1.6:1, with boundaries, halfway line,
center circle/spot, penalty/goal areas, penalty spots and goals. No artwork/media.
Compact heading shows names, formations, score/status and reset control.

Each jersey receives its own team/secondary/number-contrast CSS variables; there
is no global active-team palette. Accessible player buttons include team, number,
name and broad position. Selection uses aria-pressed and a dashed border as well
as background styling. SVG is decorative. Keyboard arrows move selected players;
Shift moves faster. No names/numbers/roles/team editing or bench controls.

Working coordinates are a separate map; source model/detail/cache stay immutable.
Mouse/touch use pointer capture, shared normalized delta math, matching-pointer
checks and local event cleanup. Cancel/lost capture restores pre-gesture position.
Bounds include marker dimensions and minimum 6% horizontal / 10% vertical padding.
After initialization either team may cross halfway. Selection/drag/reset make no
network or storage calls. Disposal cancels gestures/removes listeners/children,
keeps the supplied root, and blocks stale-account updates.

“Gerçek Dizilişe Dön” restores all 22 source coordinates and clears selection,
without refetch. **No persistence in M3:** existing drafts validate a different
single-team snapshot schema and fixed Studio/Comparison slots. Extending that
layer would broaden this phase. The approved optional-persistence fallback is
used: work lasts only while the page is open; reload restores initial placement.
No localStorage/sessionStorage access, new draft keys, legacy import or changes to
Studio/Comparison/public-share drafts. This limitation is stated in the UI.

Mobile: page/container width stays constrained; only the pitch viewport scrolls
horizontally around an internal **860px minimum-width** pitch. Empty pitch space
supports native scrolling; player surfaces use touch-action:none during direct
manipulation. User guidance explains both gestures. Real touch/overflow behavior
still requires the browser QA below; CSS/unit tests are not a visual substitute.

## Transport, cache and security

Same M2 `matches?id=...` normalized endpoint and localhost `/__local/matches?id=...`.
No M3 provider route, league/team override or direct browser BSD call. Existing
hosted getUser verification and per-ID/status cache remain. Account changes hide
and dispose the view through the existing guard. Team/player strings use safe
DOM APIs; only the existing fixed decorative jersey SVG uses constant innerHTML.

## Validation results

- `npm test`: **323 passed, 0 failed/cancelled/skipped**. 23 new M3 tests; updated
  M2 link expectation and representative fixture (one GK, four D, five M, one F).
- Board regression: **9/9 groups passed**, including original drawing, swaps,
  bench, draft isolation, Comparison, readonly shared and disposal behavior.
- `npm run build`: passed; dist/backend.js generated by build only.
- `git diff --check`: passed.
- `node scripts/verify-match-studio-local.mjs`: real provider/Node handler with
  **mocked Auth and DOM fixture**, not a real browser or Deno integration test.
  Match **215997**: one pitch, 22 unique identities, formations 4-2-3-1 / 4-1-4-1,
  drag and reset passed. Match **216231**: no lineup, studio unavailable.
- Smoke used **8 BSD GETs**, two repeated loads hit cache. Drag/reset caused
  **zero additional provider requests**. Separate schema inspection used one GET.
  A real browser transition's request count has not been observed.
- Local server restarted to load M3: both route forms and CSS return 200;
  unauthenticated local detail request returns 401. No Auth mutation/test user.
- Browser-output scan: 23 text assets; no configured secret value, secret-key
  literal, service-role JWT, credential DB URL, private key, BSD server identifier/
  hostname or test fixture marker. Generic SDK detection strings are not secrets.
- No media URLs enter the reduced board model or rendered markers; tests verify
  absence of image/video elements. **Actual browser Network zero-media result is
  unverified**, not asserted from the mock DOM test.

**Pending browser QA:** computer tooling reports no apps/browsers. Therefore
1440/1024/390 visual checks, actual click-through, touch drag/panning, body overflow
and browser Network inspection could not be run. Local implementation/tests are
complete; browser sign-off and provider-license recheck remain release conditions.

## Files

New: `dist/mac-studyosu.html`, `dist/match-studio.css`, `src/lib/match-layout.js`,
`src/lib/match-board.js`, `src/lib/match-studio-ui.js`,
`tests/match-studio.test.mjs`, `tests/helpers/match-board-fixture.mjs`,
`scripts/verify-match-studio-local.mjs`, `MATCHES_M3.md`.

Updated source: `dist/app.js`, `dist/match-detail.css`,
`src/lib/match-detail-ui.js`, `src/lib/page-routes.js`, `src/lib/page-bootstrap.js`,
`src/lib/auth-redirects.js` (exact route only), `scripts/serve-local.cjs`,
`supabase/functions/matches/detail.js`, `tests/helpers/match-detail-fixture.mjs`,
`tests/match-detail-ui.test.mjs`.

Generated: `dist/backend.js`. HTML/CSS/app.js in dist remain human-edited source.
M1/M2 documents remain unchanged as phase records; M3 supersedes their disabled
Match Studio entry description only.
