# Supabase integration

Local domain update: the checked-in Edge source now defaults to
`https://taktikstudyo.com` and validates an explicit `ALLOWED_ORIGINS` override.
This update has not been deployed; production environment and Cloudflare widget
settings were not changed. Deployment and live validation results below describe
the earlier integration, not verification of the new domain in production.

## Current status

A separate project, `Taktik Stüdyo` (`zwhoailuklwtxaaawfaq`), was created in
`enesunl's Org`, Frankfurt (`eu-central-1`), after the user's selection. The connector
reported $0/month at creation. Existing story/vocabulary project was not modified.
The football schema, seed and `lineups` Edge Function are deployed.
Project identity is recorded in `supabase/project.json`.

## Existing application

Plain HTML/CSS/JavaScript, without React or an existing bundler. Authored public
files remain in `dist`. `app.js` owns an isolated closure-based state per board;
`comparison.js` creates two instances. `players` is the 11 pitch slots, with
coordinates in percentages, role and optional real `athleteId`/PNG path. Reserves
are derived from the catalogue excluding those IDs. Drawings use normalized
coordinates with pen/eraser strokes. No localStorage existed before this change.

The new esbuild step bundles only `src/backend-entry.js`. It does not rebuild
the UI or change the drag engine. Dependencies are pinned in package.json and
package-lock.json; Node >=22. Supabase JS 2.116.0 was checked against npm and
current releases on 2026-09-13.

## Frontend changes

- `dist/app.js`: optional remote team catalogue, validated draft restore, debounced
  saves after completed mutations, keyboard movement and drawing completion.
- `dist/comparison.js`: separate left/right draft keys; consistent select values.
- Both HTML entrypoints load the backend bundle before the existing app script.
- `dist/styles.css`: a small accessible status message for connection/storage errors.
- `src/lib/supabase.js`: the sole browser createClient call, with Auth persistence,
  URL session detection and token refresh disabled. No sign-in or Auth calls.
- `src/lib/catalogue.js`: required columns only, keyset pagination, single-flight
  requests and 5-minute memory cache. Incomplete/failed data falls back to the
  bundled catalogue without exposing database errors.
- `src/lib/drafts.js`: versioned JSON validation, independent `main`, `comparison:left`
  and `comparison:right` keys, 250ms debounce and pagehide flush. No server writes.
  Storage failures leave the active board usable. No credentials are stored.
- `src/lib/validation.js`: shared strict browser/Edge validation.

## Database design

Prepared migration: `supabase/migrations/20260913063249_football_backend.sql`.
Editable schema source: `supabase/schema/football.sql` (keep migration in sync before applying).

- `public.teams`: identity, names, optional logo/source URL, two team colors, ordering,
  timestamps. Explicit public SELECT policy `teams_public_catalogue`.
- `public.players`: stable existing IDs, restrictive team FK, name, position, number,
  existing local PNG path, positional roles and selection rank preserving the
  initial XI selection. Index on team_id. Policy `players_public_catalogue`.
- `public.shared_lineups`: UUID primary/public IDs, explicit public snapshots only,
  formation, JSON lineup/drawing data, creation/optional expiry. Database validates
  JSON shape, counts, types, positions and size. No draft or personal data.
- `tactics_private.share_limits`: daily rotating hashed client bucket and global
  counters. No raw IP addresses. Old buckets removed on the next successful request.

All four tables enable RLS. Only teams/players grant SELECT to anon. Their
USING(true) predicates deliberately authorize the whole public catalogue, not
ownership-based data. No anon/authenticated writes, shared table reads, or RPC
execution. No views, SECURITY DEFINER or project-wide default privilege changes.
`create_shared_lineup` is SECURITY INVOKER and service_role-only; helper functions
are in the private schema with an empty search_path and revoked PUBLIC execution.

The seed has 18 teams and 539 players copied from the existing site, not a new
independently verified transfer/roster update. 473 bundled PNGs remain in place;
players without a portrait retain the existing initials fallback. Team logos
remain optional; the existing colored badges are unchanged.

## Sharing UI and required bot verification

Each board has a small `Kadroyu Paylaş` button. Its dialog captures the board state,
loads an explicit Cloudflare Turnstile widget with action `share_lineup`, and only
allows saving after token completion. The token is sent in `x-bot-token` to the
existing Edge Function. Tokens are reset after submission and on expiry/error.
The browser never inserts shared_lineups or calls create_shared_lineup.

The returned backend UUID forms `/?lineup=<id>` using `window.location.origin`.
The index page reads it with URLSearchParams and validates a single UUID v4 before
calling the existing Edge GET?id flow, not table SELECT. Empty, invalid or repeated
lineup parameters show the existing load error without requesting a shared lineup.
New links require no deep-link rewrite. Legacy `/lineup/<id>` links still use
`_redirects` (or the local server rewrite); a query parameter takes precedence and
an invalid query never falls back to the legacy path. A root base URL resolves
all existing assets/PNG paths. The same board engine renders the server snapshot
in explicit `readonly` mode, without editor controls, mutation listeners or draft
reads/writes. Old shared-ID drafts are ignored without deletion; main and comparison
drafts remain intact. Shared DB snapshots remain immutable to clients. This change is local
and has not been deployed to production.

The Site remains owner-private. Opening shared links requires site access; this
update does not change the hosting audience. The dialog states this limitation.

Production `lineups` now fails closed without a Turnstile secret or valid token.
There is no verification bypass. Siteverify must report success with the expected
action and exact hostname. The live OPTIONS response reports only whether bot
configuration is present (`X-Sharing-Ready`); it never returns secret values.

The real public Turnstile site key `0x4AAAAAAEyi1ASiQO5Ao9Nz` is now configured
in the ignored frontend build environment and compiled into `dist/backend.js`.
The user configured the server secret in Supabase; its value was not retrieved.
No test/fake keys were installed. The real browser challenge and a successful
production POST with its single-use token still need a manual browser check:
this static Sites execution profile has no supported interactive browser preview.
Unit tests exercise token forwarding and the successful save/link/read workflow,
but are not evidence of a real Cloudflare challenge completion.

Existing atomic quotas, strict JSON validation and all RLS/grants remain unchanged.
The schema/seed was not modified or reapplied during this sharing integration.

## Configuration / repeatable deployment steps

1. Reuse the project in `supabase/project.json`. Inspect schema/exposure and advisors.
2. Migration and seed have already been applied; do not reapply the seed. Do not apply local
   `[auth] enabled=false` settings to an unrelated existing project.
3. Build-time `SUPABASE_URL`, modern `SUPABASE_PUBLISHABLE_KEY` and public `TURNSTILE_SITE_KEY` are configured in ignored
   `.env`; only these allowlisted public values enter `dist/backend.js`.
4. The default Edge keys are already available; `LINEUPS_PUBLISHABLE_KEY` is an optional override. Optionally configure
   `ALLOWED_ORIGINS` (defaults to `https://taktikstudyo.com` only when absent),
   `LINEUPS_SECRET_KEY` (preferred modern server-only secret), `LINEUPS_RATE_SALT`.
   The Edge runtime supplies the modern SUPABASE_SECRET_KEYS and SUPABASE_PUBLISHABLE_KEYS dictionaries by default; the function reads their `default` entries. No legacy key is used.
   Never supply server secrets to the frontend build. No secrets were fetched.
   The local origin parser accepts a comma-separated list of HTTPS origins,
   normalizes a trailing slash and removes duplicates. Empty/invalid entries,
   wildcards, credentials, paths, queries and fragments fail configuration.
   An explicit list replaces the default; subdomains are not implicitly allowed.
   Before an approved production rollout, check any existing origin override and
   the Cloudflare widget's allowed hostname. Turnstile verification is unchanged.
5. Deploy Edge Function `lineups` with verify_jwt=false because there are no user
   sessions. Its body validates the apikey header; default JWT verification does
   not support modern publishable keys.
6. Verify live SELECT, denied anon mutations, real function payload/size/quota checks;
   run Supabase Security and Performance Advisors and fix integration findings.
7. Set real TURNSTILE_SITE_KEY, rebuild and publish. Full browser/real-token checks are pending, as described below.

The configured catalogue adapter successfully loaded 18 teams and 539 players
from the live Supabase Data API using only the publishable key. SQL audit confirmed
zero public tables without RLS, zero SECURITY DEFINER functions in public, and no
anon access to the write RPC. Security Advisor reported only two INFO notices
for deliberately policy-free, client-inaccessible shared_lineups/share_limits.
Performance Advisor reported two INFO notices for new indexes not yet used.
No WARN/ERROR findings.

Live HTTP checks passed: team/player SELECT; denied anon INSERT, UPDATE and
DELETE on both catalogue tables; denied direct shared_lineups reads and write RPC;
Edge rejects unknown fields, invalid formation/player counts, streamed >128 KiB,
wrong content type, foreign Origin and invalid apikey. Valid create/read round-trip
passed; the sixth save in a 10-minute client window returned 429. The five test
snapshots were removed by exact IDs. The latest live test script creates no valid
snapshots: it verifies every forbidden grant, payload error, missing/invalid key,
missing/invalid bot token and unknown-ID response against the protected endpoint.

Local tests use PGlite PostgreSQL for schema/grants/constraints/quotas, request
handler tests, catalogue client mocks and the actual board regression harness.
Browser UI QA is unavailable for this plain-static Sites preview profile; no
replacement dev server or browser path was introduced just for testing. The
existing board code continues to pass drag, substitution, drawing, fullscreen and
draft persistence regression tests.

## Documentation checked

- https://supabase.com/changelog.md
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/api/securing-your-api
- https://github.com/orgs/supabase/discussions/45329
- https://github.com/supabase/supabase-js/releases

Relevant changes: explicit Data API grants are required independently of RLS;
modern publishable keys are not JWTs; current libraries require supported Node
versions. No deprecated auth.role(), legacy browser anon JWT or implicit grants.

## Latest validation and browser build boundaries

- Live team_id-filtered adapter returned Galatasaray with 31 players. The full
  adapter returned 18 teams / 539 players; the existing board regression suite
  passed using that live catalogue, including drafts and shared snapshot isolation.
- All 9 automated tests passed, including sharing dialog and bot verifier tests.
- All anon team/player mutations, shared table CRUD and privileged RPC were denied.
- Live Edge statuses: malformed 400; oversized 413; foreign Origin 403;
  missing/invalid apikey 401; missing/invalid bot token 403; unknown UUID 404.
- Security Advisor: 2 expected INFO notices, no WARN/ERROR; unchanged deny-by-default.
  Performance Advisor: 2 unused-index INFO notices; no index removed.
- Production bundle scan found none of the prohibited secret prefixes/variable
  names. The pinned SDK's generic server-key recognition branch is omitted only
  in the browser build, which accepts publishable keys exclusively. The original
  dependency files/lockfile are not patched, and server SDK behavior is untouched.
- Managed Sites has no supported browser preview for this plain-static project.
  Static entrypoint/route/asset checks and automated DOM/state tests passed; no
  real browser visual test or successful real-token end-to-end claim is made.
