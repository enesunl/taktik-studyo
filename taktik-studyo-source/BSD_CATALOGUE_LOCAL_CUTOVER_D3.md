# D3 — Local canonical catalogue cutover

This is a local/development cutover, based on D2 commit `305e73d`. Production remains on the legacy catalogue. No production migration, data write, deployment, commit or push was performed. The site's privacy settings were not changed. No provider media was downloaded or introduced.

## Source switch and local operation

`createCatalogueSource()` is the application boundary. `CATALOGUE_SOURCE=legacy|canonical` selects the local server's source explicitly; the default is `legacy`. There is no user-facing toggle or automatic selection based on hostname. Canonical transport additionally rejects non-loopback origins as a safety constraint.

From the project directory, in PowerShell:

```powershell
npm run build
$env:CATALOGUE_SOURCE = 'canonical'
node scripts/serve-local.cjs 4173
```

The local server injects a same-origin configuration script into served HTML, removes the legacy `rosters.js` script from that response, and replaces the legacy TFF source note with neutral product wording. Static production HTML is unchanged. A production build alone does not activate canonical mode.

The local server lazily opens PGlite at ignored `.local/catalogue-d3`. It applies explicit local schema steps and the D2 fixture transactionally, retaining provider mappings and UUIDs across restarts. No Supabase CLI, linked database URL, `db push` or remote SQL is involved. Tests use isolated in-memory databases instead of this directory.

Existing Auth remains responsible for login. The local endpoint validates the supplied session through the existing server-side `getUser` path, then runs SQL as `authenticated` with the validated owner's `auth.uid()`. Auth validation is read-only. Catalogue, overrides and Studio Projects use the local data client in canonical mode; normal Auth/profile behavior is unchanged. No raw SDK client or session is added to the window API.

## Model and identity

Both sources expose this domain model:

```text
Team:   { id, name, shortName, color, color2, sortOrder }
Player: { id, teamId, name, number, positionGroup,
          specificPosition, catalogueActive }
```

Canonical team IDs are D2 product slugs, such as `galatasaray`; player IDs are internally allocated UUIDs. Product-owned names, abbreviations, colors and ordering stay separate from provider mappings. The local fixture contains 18 teams, 543 active players, 543 unique BSD player mappings, 18 legacy team aliases and 388 safe player aliases. The 151 unresolved legacy players are not guessed or automatically migrated.

The legacy adapter exposes the same domain fields while retaining explicit legacy identities. Existing Classic wire snapshots keep numeric player `id` as the board slot and `athleteId` as the footballer identity; new canonical snapshots put the UUID in `athleteId`. Match/Free Studio continue separating slot/person keys and coordinates from `playerId`. Existing v1 validators already support these IDs, so no snapshot version was silently changed.

Canonical records contain no FotMob roles, starts, value, selection rank, source URL or photo metadata. `positionGroup` and `specificPosition` retain BSD facts. D2's broad-group conflict rule and lossy-position compatibility remain unchanged: 13 conflicts and 81 lossy classifications are covered by the existing D2 tests. Tactical role belongs to the formation slot, not permanently to a player.

## Reader, errors and private resolution

The canonical reader queries only `catalogue_teams` and `catalogue_players`, with active filters, validation, UUID keyset pagination, single-flight loading and a five-minute reader cache. A page reuses its installed model.

For 18 teams and 543 players, the browser issues exactly **two catalogue queries**: one teams query and one players page. It also makes **one separate defaults-context request**. Owner override/project queries and bounded alias resolution are separate operations; there is no per-player catalogue query.

The local endpoint only permits fixed table, column and operation allowlists and parameterized SQL. Actual PostgreSQL grants and RLS still execute. Provider/alias tables cannot be queried through this endpoint. The resolver accepts at most 500 explicit legacy/BSD keys per request and returns only the requested UUID/null associations; it never exposes the mapping tables or makes provider IDs the board identity.

Errors distinguish `schema_unavailable`, `catalogue_empty`, `catalogue_malformed`, `provider_mapping_unresolved` and `network_failure`. User-facing errors remain generic. A broken canonical catalogue does not fall back to legacy Supabase tables or `dist/rosters.js`.

## Default XI and Match Studio

The server resolves confirmed BSD lineup IDs through private D2 mappings before building canonical boards. Recent-XI selection reuses `catalogue-default-xi.js`:

1. Most recent completed match in the configured provider season, with a valid confirmed XI, valid formation, fully resolved active squad IDs and compatible goalkeeper count.
2. Deterministic canonical squad arrangement when those requirements are not met.

Predicted XI is not a dependency. Missing mappings or invalid formation never fabricate a catalogue player. Match Studio receives an internal-ID `canonicalModel`; raw match event/provider DTO fields remain separate. Canonical event team metadata is replaced from the internal catalogue, including when the old DTO's FotMob team ID is null.

With a configured server-only BSD token, the local server can read season/detail data using the existing provider adapter, caching defaults for five minutes and deduplicating detail requests. Without available confirmed data, the fallback is labelled as a default arrangement. D3 verification used mocked provider responses and did not perform live BSD requests. It does not claim a freshly verified live 18/18 confirmed lineup result.

## Page integration

| Page | Canonical behavior and verification |
| --- | --- |
| Classic Taktik Tahtası | 18-team catalogue, UUID footballers, formation/team switching, XI/bench exclusion, substitution, movement, player editor and no legacy source attribution. |
| Comparison | Actual comparison mount creates two scoped canonical boards; changes on one side do not affect the other, including the same footballer on both boards. |
| Free Studio | Canonical selector and team construction; selected-side changes retain the opposite team and pitch. Existing drawing/board regressions remain passing. |
| Match Studio | Server-resolved internal team/player IDs, 22-player page mount, confirmed XI when valid, canonical fallback when not. No browser BSD request or legacy-roster dependency. |

Generic jerseys remain the visual system. No BSD/FotMob photos or logos are used.

## Overrides, drafts, projects and shares

New canonical customization keys are `internal:<UUID>`. Existing `local:<legacy-id>` and `bsd:<id>` keys remain supported. Explicit internal override wins; otherwise exactly one safely resolved legacy override can supply a presentation overlay. Ambiguous collisions do not guess. Unresolved overrides remain stored and usable by their original historical key.

Explicit reset can remove the uniquely resolved inherited override so it does not immediately reappear; conflicting inheritance returns a controlled conflict. There is no automatic bulk migration. Account-current checks, owner filtering and RLS remain in place.

`supabase/local/catalogue_override_keys.sql` extends the override key check **only in the local harness**, allowing `internal:<UUID>`. It does not change ownership policies or grants and is not in the production migration queue. Production cannot accept these keys until a separately reviewed additive migration is approved.

Classic and Comparison drafts resolve known identities for safe comparisons/overlays without rewriting stored snapshots. New drafts use UUIDs. Historical unresolved players retain their embedded identity and display data. The public shared-draft key behavior is unchanged.

Studio Projects in canonical development mode are stored in local PGlite. Save/list/reopen/rename/delete run through the real local SQL/RLS path. Snapshots retain source/bench/working identities; opening a historical project does not update its stored snapshot. Safe overrides are presentation overlays. Historical rendering is not a promise that a protected canonical page can work while the entire canonical catalogue service is unavailable.

Public shared viewing remains the existing read-only embedded-snapshot flow via Edge GET. New internal IDs pass the existing share validator. Canonical local **publishing is disabled** to prevent accidental writes to production `shared_lineups`; no end-to-end creation of a production share was attempted. Legacy publishing behavior is unchanged.

## Static fallback and remaining legacy references

D2's generator produces a replacement-format canonical fallback in memory during integration tests and through the local fallback action. It contains internal IDs, product metadata and normalized football fields, without mapping IDs, legacy ranks/roles or provider media. Production `dist/rosters.js` is retained unchanged. The generated canonical fallback is deliberately not an automatic recovery path for a broken canonical test database.

`BSD_CATALOGUE_RUNTIME_REFERENCES_D3.md` inventories every matching code/HTML/SQL line under src, dist, supabase, scripts and tests. Its generator does not read env or database files. Historical Markdown and JSON fixtures are separately classified in the inventory's scope notes.

The `ACTIVE_RUNTIME` matches are the generic `athleteId` snapshot field, not active FotMob lookup dependencies. Legacy references remain in the isolated old catalogue adapter, static rosters, schema/seed/history, old default-XI/attribution branches, match DTO compatibility and tests. The generated bundle includes both adapters for rollback. The canonical path does not need a FotMob ID, URL, rank or media request.

## Rollback and production prerequisites

Stop the local server, set `$env:CATALOGUE_SOURCE = 'legacy'`, and restart it. This restores the current legacy data path; the local database remains available for later development. No production data rollback is needed because no production mutation occurred.

Before any production cutover:

- Review and explicitly approve the additive D2 catalogue migration and a production-safe internal override key extension.
- Recheck BSD licensing/usage authorization; this implementation is not a current licence confirmation.
- Implement and review a production server transport/resolver; the D3 loopback PGlite endpoint is not a production service.
- Populate the canonical catalogue/mappings/approved aliases and verify stable UUID sync, active state and same-season confirmed-XI coverage.
- Run a dual-read smoke comparison and review unresolved/ambiguous identities without automatic guessing.
- Verify override precedence/reset across every page and historical project/draft/share regressions with approved test accounts.
- Verify canonical share creation in an approved non-production environment before enabling it in production.
- Verify safe rollback through the source switch, retained legacy data and compatibility-aware application version. An older pre-D3 build does not understand the new internal override key contract.

## Verification and limitations

Verification used real PGlite SQL/grants/RLS, isolated local HTTP serving, actual board/comparison engines and deterministic DOM/Auth/provider fixtures. No live authenticated production UI smoke test or provider media fetch was performed.

- `npm test`: 496 passed, 0 failed, 0 skipped, including D2 identity stability, position policy, DB, Auth, bootstrap, overrides, projects and D3 tests.
- D3 additions: two files, 12 reported tests including the parent integration test and its nine subtests.
- Board regression: all nine PASS groups.
- `npm run build`: successful; `dist/backend.js` generated only by build.
- `git diff --check` and checks for all 11 new files: no whitespace errors.
- Browser secret scan: 27 text assets checked against local secret values, zero matches. Bundle checks also found zero actual `sb_secret_` keys, service-role JWTs, private keys, credential-bearing database URLs, server secret variable names, D3 mock token fixtures or PGlite imports. No matching values were printed.

Failures recorded during development, not hidden by rerunning:

1. Full suite `real SDK main singleton persists normal Auth; dedicated recovery construction never persists` (`tests/auth-integration.test.mjs:112`): `TypeError: Converting circular structure to JSON` (Timeout → TimersList → `_idleNext`). D3 had exposed the legacy SDK client through the new window boundary. The boundary now exposes only the local transport in canonical mode; the raw SDK is absent. This was an implementation bug, not an unexplained flaky test.
2. `same-season completed confirmed XI resolves provider IDs only on server; predicted ignored`: `ERR_ASSERTION`, actual `'default-arrangement'`, expected `'recent-confirmed'`. The assertion expected the wrong team: the fixture represented Amedspor/Beşiktaş, not Galatasaray. It now derives the internal team from the fixture's provider ID.
3. `D3 explicit local switch serves canonical config, removes legacy scripts/attribution, no production asset rewrite`: `ERR_ASSERTION: 200 !== 404`. Node fetch did not preserve the test's custom Host header. It now uses `node:http.get` with an explicit Host header.

All were corrected before the final successful suite. No unexplained flaky test remained.

The runtime inventory command also encountered sandbox `spawnSync rg EPERM`; the same local report generator succeeded with authorized elevated child-process execution. This was an environment restriction, not a test failure or production action.

## Changed artifacts

Hand-maintained source/config: `.env.example`, `.gitignore`, `dist/app.js`, `scripts/serve-local.cjs`, `src/backend-entry.js`, `src/lib/match-detail.js`, `src/lib/match-layout.js`, `src/lib/match-studio-ui.js`, `src/lib/page-bootstrap.js`, `src/lib/player-overrides.js`.

New implementation: `src/lib/catalogue-canonical.js`, `src/lib/catalogue-source.js`, `src/lib/catalogue-local-client.js`, `scripts/catalogue/local-database.mjs`, `scripts/catalogue/local-service.mjs`, `scripts/catalogue/audit-runtime.mjs`, `supabase/local/catalogue_override_keys.sql`.

Tests/docs: `tests/catalogue-cutover.test.mjs`, `tests/catalogue-local-server.test.mjs`, this document and `BSD_CATALOGUE_RUNTIME_REFERENCES_D3.md`.

Generated browser output: `dist/backend.js`. Actual `.env`, production migrations, old rosters/seed, Auth/recovery/profile/Edge Function source and production resources are unchanged.
