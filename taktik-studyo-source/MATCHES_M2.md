# Match Center — M2

Local implementation and validation: **2026-09-22**.

**PRODUCTION DEPLOYMENT BLOCKED PENDING PROVIDER-LICENSE RECHECK.** The M1
release condition remains: reviewed BSD v4.0 text has effective date **2026-10-01**.
This task does not approve deployment or change provider terms. No commit, push,
deployment, production secret/Auth/Netlify/database change or migration was made.

## Routes and data boundary

`/mac` and `/mac.html` reuse the existing protected page bootstrap and server user
validation. Only the exact `/mac.html` safe-next destination is added; existing
Auth logic and redirect-query restrictions remain. Anonymous, unconfirmed and
recovery sessions cannot mount the view. No board, draft, catalogue or profile
bootstrap is introduced. Current-identity checks discard stale asynchronous replies.

M1 cards are native keyboard-accessible anchors to `/mac?id=<id>&hafta=<round>`,
with a visible focus style and a descriptive label. The explicit back link uses
`/maclar?hafta=N`. ID and week are validated independently. ID must occur once and
be a safe positive decimal integer string (no signs/leading zeros); week retains
M1's 1–34 rules. Missing/invalid IDs show a safe error without a detail request.
The existing login safe-next contract does not preserve match query parameters;
a signed-out visitor can return to the protected shell and choose a match again.

Production transport: `client.functions.invoke('matches?id=<id>', {method:'GET'})`.
Local transport: same-origin `/__local/matches?id=<id>` only on the existing exact
localhost/127.0.0.1:4173 origins. Both use the same handler, provider and normalizer.
The local handler retains hosted Auth `getUser` verification before every cache
access. Browser-supplied league, season, endpoint, URL or extra backend query
parameters are rejected. The UI's `hafta` is never forwarded upstream.

The critical event response must match the requested ID, **league 11 / season
1539**, then pass the existing M1 event normalizer. Only then do three optional
GETs (lineups, incidents, stats) run concurrently with `Promise.allSettled`.
Event failure produces a page error; each optional failure affects only its own
section. Optional 404/204/empty resources become unavailable, not a page error.
Timeout is 18 seconds across detail/resources; response size is checked after
reading (2 MB each), with no redirect following. The frontend detail timeout is
30 seconds including Auth/transport. M1 timeouts and season behavior are unchanged.

Controlled detail errors: `INVALID_MATCH_ID`, `MATCH_NOT_FOUND`, `UNAUTHORIZED`,
`PROVIDER_UNAVAILABLE`. Raw BSD errors, URLs, tokens and JSON are not displayed.

## Normalized model and UI

Detail extends M1's `id`, competition, season, round, kickoff, normalized status,
home/away team IDs/names/local colors, score and venueId. It adds a nullable venue
**name**, statistics, lineups, chronological incidents, substitutions and per-section
availability (`available`, `unavailable`, `error`). Numeric venueId is never rendered;
there is no venue lookup. Status mapping and labels are shared with M1.

- Statistics: possession, shots, shots on target, corners, fouls, offsides, yellow
  cards, red cards and xG. Finite numeric values only; missing values are omitted
  or shown as `—`. Textual values accompany decorative comparison bars.
- **xG precedence:** direct team `expected_goals` wins. Only when absent/null does
  `xg.actual` serve as fallback. A present malformed primary value is unavailable,
  not silently replaced. Never average. Verified Beşiktaş conflict **2.13 / 2.15**
  resolves to **2.13**. Team-level estimation flags label estimated xG; the separate
  shotmap estimation flag is not used to relabel match-level values.
- Lineups preserve provider-designated starters/bench, IDs, shirt numbers and
  formation. No inferred XI or formation. Team IDs must match the detail sides.
  Confirmed/predicted/unknown confirmation states are labelled honestly. Broad
  positions map centrally: G→KL, D→DEF, M→ORT, F→FOR; no detailed position inference.
- Players use compact number/name/position rows with local team colors. No photos,
  club logos, official kit artwork or independent jersey implementation.
- Incidents sort by minute, added time, then original sequence. Goals, yellow,
  red, **yellowRed**, substitutions and unknown events remain safe. Added minutes
  render as `90+3′`. Timeline cards do not recalculate statistical card totals.
- Substitutions preserve incoming/outgoing identities and names, grouped by team,
  chronological within each group. No invented assists or stadium names.
- Upcoming matches show kickoff without fake scores and clean pre-match sections.
  Provider strings use textContent/safe DOM APIs. Media fields are discarded.
- “Maçı Stüdyoda Aç” is disabled with an accessible “Yakında” explanation. No M3.
  Attribution remains “Maç verileri: BSD Sports Data”, without a provider logo.

Layout uses existing local styles: desktop two-column lineups, comparison bars,
and stacked lineups below 650px. Headings, textual statuses, native anchors and
textual timeline labels provide semantics without depending on color/icons.

## Cache and quota

Per-ID, isolate-local memory cache; maximum 128 entries and 32 concurrent distinct
loads, with same-ID single-flight. Authentication precedes cache access. Finished
complete data: **3600 s**, because it changes infrequently. Live: **45 s** for
freshness. Upcoming: **300 s** to accommodate lineup publication. Other statuses:
**120 s**. Partial errors and incomplete finished data: **60 s**, so an optional
outage does not remain cached for an hour. Failures are not cached.

Edge success responses are private with remaining TTL; errors are no-store. Local
HTTP responses remain no-store while the server retains its memory cache. One
page load requests one normalized response, no per-section refetch or polling.
Cold detail costs four provider GETs; cache hits cost none. This is neither a
distributed cache nor a global quota limiter: separate cold instances still fetch.
The 7,500/day provider quota remains a deployment consideration.

## Files and reproducible checks

New source: `dist/mac.html`, `dist/match-detail.css`, `src/lib/match-id.js`,
`src/lib/match-detail.js`, `src/lib/match-detail-ui.js`,
`supabase/functions/matches/detail.js`.

Existing source extended: `dist/matches.css`, `src/lib/matches.js`,
`src/lib/matches-ui.js`, `src/lib/matches-transport.js`, `src/lib/page-routes.js`,
`src/lib/page-bootstrap.js`, `src/lib/auth-redirects.js`,
`supabase/functions/matches/provider.js`, `supabase/functions/matches/handler.js`,
`scripts/local-matches.mjs`, `scripts/serve-local.cjs`.

Tests: `tests/match-detail-provider.test.mjs`, `tests/match-detail-ui.test.mjs`,
`tests/helpers/match-detail-fixture.mjs`, updated `tests/matches-ui.test.mjs`.
Opt-in smoke: `scripts/verify-match-detail-local.mjs`.
Documentation: this file and M1 cross-reference.
Generated output: `dist/backend.js`, produced **only** by `npm run build`.
Dist HTML/CSS are hand-maintained source, not build outputs.

Results:

- 21 new M2 tests pass, including real installed-SDK request construction with
  mocked network; npm test is offline and does not depend on BSD.
- Full `npm test`: **300 passed, 0 failed/cancelled/skipped**, plus **9/9 board
  regression groups**. Existing Auth/recovery/profile/draft/sharing/catalogue/
  database/jersey/bench/board suites remain green.
- `npm run build` succeeded. `git diff --check` passed.
- Live read-only smoke (`node scripts/verify-match-detail-local.mjs`): real Node
  handler/provider with **mocked Auth**, existing process BSD token, 8 GETs total
  and repeated requests served from cache. No production Auth operation.
- Completed **215997**: 3–2, round 6, formations 4-2-3-1 / 4-1-4-1, 11 starters +
  10 substitutes per team, 33 incidents, 9 substitutions, xG 1.47 / 2.13; all three
  optional resources available.
- Future **216231**: upcoming, round 34, null scores, lineups/stats/incidents
  unavailable, zero incidents/substitutions. No fabricated pre-match data.
- Local server restarted to load M2. HTTP `/mac?id=215997&hafta=6`,
  `/mac.html?id=216231`, CSS: 200. Tokenless local detail: 401; invalid ID: 400.
- Browser-output scan (21 text assets): zero actual configured secret matches,
  secret-key literals, service-role JWTs, private keys or credential DB URLs;
  no BSD server token identifier/hostname or smoke fixture marker in the bundle.
  SDK generic detection strings are not credentials.

**Pending real browser QA:** the available computer tool reports no browsers or
apps. Therefore 1440/1024/390 viewport, actual overflow, signed-in click-through
and browser Network inspection are **not verified**. Deterministic transport/DOM
tests prove local routing and absence of provider/media rendering paths, and live
normalized payloads contain no media URLs; these do not prove an actual browser
request count. Do not report “zero browser media requests observed” until Network
QA is run. Local smoke is not a Supabase Deno gateway or real-user Auth test.
