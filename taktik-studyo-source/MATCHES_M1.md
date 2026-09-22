# Süper Lig maçlar — M1

## Release condition

- Provider: BSD Sports Data.
- Purpose: Süper Lig structured fixtures/results only; no media, lineups or M2 details.
- Published license reviewed: v4.0, effective **2026-10-01**.
- Original provider/license review date: **2026-09-21**; local implementation: 2026-09-22.
- **LOCAL DEVELOPMENT APPROVED**.
- **PRODUCTION DEPLOYMENT BLOCKED PENDING LICENSE RECHECK**.
- This is a project release condition, not legal advice. Do not call the data official league data.
- Reference: https://goaldir.com/docs/api-license/

## Routes and frontend

`/maclar` and `/maclar.html` use the existing `resolvePage` / `createProtectedPage`
bootstrap and server user validation. Anonymous, unconfirmed and recovery sessions
cannot mount the page. Only `/maclar.html` is added to the existing exact safe-next
allowlist. No query/external redirect allowances were added.

The page owns no board, drafts, profile bootstrap or catalogue fetch. The mounted
view/API check the guard's current-identity closure after asynchronous work; disposal
removes listeners and DOM. Stale account responses do not repaint the next account.

`src/lib/matches.js` contains normalized-model validation, the single
`client.functions.invoke('matches', {method:'GET'})` boundary and deterministic
round/date helpers. `matches-ui.js` renders with safe DOM/textContent calls, using
the existing authenticated navigation and local CSS. Cards keep `data-match-id`
but are not links/buttons: M2 navigation is intentionally absent.

One season request per mount; changing weeks makes no new request. `hafta` must
occur once and be a decimal integer 1–34. Selection uses history push/replace and
popstate. Default selection: live round first, otherwise most recently played
round; without completed matches, nearest kickoff. Before season: 1; after a
completed season: 34. Empty data: 1 with an explicit empty message. Malformed
query values use the same default. Round numbers come from provider fields, not
the number of completed matches.

UTC offsets are preserved/normalized to ISO UTC. `Intl.DateTimeFormat('tr-TR')`
uses the browser timezone; tests explicitly exercise Istanbul, UTC, New York and
date rollover. No manual three-hour adjustment.

## Edge and provider contract

`supabase/functions/matches/index.ts` uses the pinned existing Supabase JS 2.116.0
SDK and `auth.getUser(jwt)` with a **publishable** key, never a server/admin key.
Local config adds only `functions.matches`, with `verify_jwt=true`. The handler
additionally requires a confirmed, non-anonymous user before all cache hits.
No database/RLS/grants/schema, existing Auth controller or sharing function changes.

Only GET/OPTIONS. Query parameters are rejected. Browser cannot choose a provider
URL, league, season, page or arbitrary proxy operation. Constants are league 11,
season 1539, application season `2026-2027`. CORS uses exact origins, never `*`:
default `https://taktikstudyo.com`; optional local `http://localhost:4173`.

`provider.js` fetches 200 events per page, maximum 4 pages/800 rows, with a 12-second
overall abort signal. Every `next` must have the exact provider origin/path, fixed
scope/limit and the next offset; requests reconstruct that URL and reject HTTP
redirects. Count continuity and final raw count are checked. Duplicate IDs are
deduplicated; malformed events are skipped with numeric `quality.skipped` and
`quality.duplicates` diagnostics. Entirely invalid nonempty datasets fail closed.
JSON size is bounded after reading; the timeout also covers response reading.

Normalized match: `id`, `competition`, `season`, `round`, `kickoff`, `status`,
`home/away {providerId, teamId, name, color, color2}`, `score {home,away}`, `venueId`.
No raw/media fields are forwarded. Provider `notstarted` becomes `upcoming`;
`finished`, live, postponed and cancelled states are explicit. Unknown values
become `unknown`; score presence never determines status. Upcoming scores are
always null and only kickoff time is displayed. Missing finished scores use `—`.

`teams.js` explicitly maps the 18 BSD IDs to existing stable `fotmob-*` catalogue
IDs, display names and colors. It copies the current catalogue color values
without changing catalogue/board data. Tests verify the mapping against seed.sql.
Unknown teams retain a bounded provider name with neutral colors and null teamId.
Provider logos, photographs and video are not requested or rendered.

An isolate-local five-minute cache coalesces concurrent fetches. This is not a
distributed cache or a global quota/rate limiter: cold isolates still fetch.
Successful responses use **private, max-age=300**, not public shared caching that
could skip authentication. Errors use no-store. Rate limit/timeout/connection/
JSON failures return only `matches_unavailable` (503 for provider 429, otherwise
502); the UI offers a generic message and explicit retry. No raw errors/tokens.

## Future configuration — NOT applied by this task

- Server-only Supabase Function secret `BSD_API_TOKEN` must be configured before
  deployment. Never add it to browser defines, source or committed env files.
- The runtime uses `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS.default` (or singular
  `SUPABASE_PUBLISHABLE_KEY`); optional `MATCHES_PUBLISHABLE_KEY` overrides only the
  public Auth key. No service role is needed.
- Optional `MATCHES_ALLOWED_ORIGINS` is a comma-separated exact HTTPS-origin list;
  only `http://localhost:4173` is additionally permitted for local testing. This
  setting is independent from the existing sharing origin configuration.
- Recheck license applicability and complete real local browser/gateway QA before
  seeking any production rollout approval. No Netlify configuration change here.

## Validation

`npm test` includes static M1 provider/handler/UI/route tests and the existing board
regression. Tests do not require live BSD. `npm run build` alone generates
`dist/backend.js`; HTML/CSS in dist are hand-maintained source.

Opt-in: `node scripts/verify-matches-local.mjs` uses only the existing process
`BSD_API_TOKEN`, never reads/writes credentials or files, and calls the real
handler/provider with a test-only authentication dependency. It fetches the two
live BSD pages and checks 306 unique matches / 34 rounds / nine matches per round
plus a cache hit. It is NOT a Deno gateway or real-user Auth integration test.

During the initial M1 run Docker's Linux engine was unavailable and the browser tool
reports no browser surfaces. Consequently actual Supabase local serving and
1440/1024/390 visual/browser-Network QA remain pending. Deterministic DOM/API tests
check loading/error/retry/empty, week/history navigation, score/time rendering,
identity cancellation and no provider/media code paths, but cannot replace actual
viewport/overflow or browser Network inspection. No production user/login is used
as a substitute.

Local results (2026-09-22): 31 new M1 tests; full `npm test` **274 passed, 0 failed**,
plus all 9 board-regression groups passed. `npm run build` and `git diff --check`
passed. Backend bundle changed through build only. The build now asks esbuild to
escape template literals so SDK multiline strings do not create trailing whitespace
in generated output; no manual bundle rewriting.

Live Node handler verification: 306 unique fixtures, rounds 1–34, 9 per round,
zero skipped/duplicate rows, default week 6; 2 upstream GET requests followed by a
cache hit. Local static HTTP checks for `/maclar`, `/maclar.html`, `?hafta=6`, CSS
and backend.js all returned 200. Edge entry TypeScript/import graph compiled in
memory, which does not substitute for a Deno runtime test.

Browser-output scan covered 19 JS/HTML/CSS/JSON files: no actual configured BSD
token, secret-key patterns, service-role JWTs or private keys; backend.js contains
neither BSD_API_TOKEN nor the BSD API hostname nor local test fixture markers.
Actual browser Network/viewport results remain unverified as stated above.

## Local connection fix (2026-09-22)

The shared Supabase client derives `functions/v1/matches` from its existing hosted
SUPABASE_URL. Merely opening localhost does not change that URL. SDK requests send
the user's session JWT as Authorization and the publishable key as apikey.

The subsequently started local Edge runtime uses `SUPABASE_URL=http://kong:8000`;
local Auth is disabled in this project's config. Its separate JWT gateway and
getUser target do not automatically validate the hosted browser session. No local
or production JWT setting, existing Edge source or global Supabase URL was changed
for this fix. Docker now runs, but this is not a validation of hosted JWT acceptance.

**Selected approach C:** the existing `scripts/serve-local.cjs` server implements
one fixed `/__local/matches` endpoint. `matches-transport.js` selects it only at
`http://localhost:4173` or `http://127.0.0.1:4173`; every other origin uses the existing
SDK function invocation. Query strings cannot select an endpoint. This QA approach
does not call the local Edge port 54321 and does not need gateway JWT exceptions,
a second Auth setup or changes to production function behavior.

The local server binds 127.0.0.1 and checks exact Host/Origin. The existing handler
still requires a bearer JWT, verified with the configured hosted Auth **GET /user**
using the publishable key. Confirmed, non-anonymous users only; no automatic login,
signup, admin key, Auth mutation or authentication bypass. Authentication also
precedes cache hits. The browser session token remains internal to the transport;
it is never returned to UI, written to disk or logged.

`scripts/local-matches.mjs` reuses the existing matches handler/provider/normalizer,
including fixed competition, bounded pagination, errors and cache. BSD token stays
in the Node process; browser never contacts BSD. No generic URL proxy. The endpoint
exists only in this development server, not Netlify routing or the production bundle.
The browser transport selector itself is bundled but is inactive on production.

Run `node scripts/serve-local.cjs 4173` with BSD_API_TOKEN already in the process
environment. The server reads the existing `.env` public SUPABASE_URL and
SUPABASE_PUBLISHABLE_KEY without rewriting it. Restart an old local server after
updating the script, then reload `/maclar`. No second browser Supabase client is
created. Studio/Auth/Profile/Comparison retain their existing configuration.

Validation after fix: 5 additional tests (36 M1 tests total), full `npm test`
**279 passed, 0 failed**, all 9 board regression groups passed; build succeeded.
Local HTTP: page 200, tokenless matches 401, query override 400, foreign Origin 403.
Deterministic transport tests verify zero production matches calls on localhost,
exact server-side Auth GET, and no direct browser BSD/media call. Browser tooling
still reports no surfaces: real signed-in browser count/Network and 1440/1024/390
responsive QA remain pending; no real-browser success is claimed.
