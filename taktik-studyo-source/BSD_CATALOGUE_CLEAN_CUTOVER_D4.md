# D4 — Clean canonical catalogue cutover

Baseline: `88c97c2 feat(catalogue): add local canonical catalogue cutover`. This phase supersedes D3's active compatibility decisions. D1/D2/D3 evidence and migrations remain intact. Production remains untouched and uses the safe legacy default. No commit, push, deployment, production migration, user-data deletion or provider media download was performed.

## Final active architecture

```text
BSD league 11 / season 1539 structured football data
    → server normalization and complete-scope transactional sync
    → catalogue_teams / catalogue_players
      team_provider_ids / player_provider_ids
    → internal team slug / internal player UUID
    → Classic, Comparison, Free Studio, Match Studio
```

The four canonical tables are the entire active football identity model. `readCanonicalState()` queries only those four. `providerIdentityResolver()` accepts internal IDs or explicit provider mappings; it neither indexes nor reads alias tables. Unknown BSD identities resolve to null, not to another provider's IDs.

The old 388 safe aliases, 151 unresolved players and 18 team aliases are no longer product dependencies. No new alias is created. D2's empty alias tables may still be created by its unchanged additive migration; they are obsolete migration-only structures. Historical D2 resolver/alias-writing utilities remain for audit tests and are never invoked by canonical application operation. There is no new reconciliation effort.

## Local operation and clean database

```powershell
npm run build
$env:CATALOGUE_SOURCE = 'canonical'
node scripts/serve-local.cjs 4173
```

Canonical local storage is now `.local/catalogue-d4`, separate from D3's database. No old local database is deleted or rewritten. The source switch is explicit; default `legacy` remains safe for current production. Canonical HTTP transport accepts only loopback origins and a validated authenticated owner. Auth/profile behavior is unchanged.

The fresh local PGlite bootstrap creates only the role/Auth stub/private trigger infrastructure needed by the canonical, Studio Project and override schemas. It applies these existing SQL files locally:

- `20260923135716_studio_projects.sql`
- `20260924094207_player_overrides.sql`
- `20260925035438_catalogue_identity_foundation.sql`
- `supabase/local/catalogue_override_keys.sql`

It does not apply `football_backend`, `catalogue_authenticated_read`, `profiles_ownership` or `seed.sql`. There is no legacy `public.teams` or `public.players` table in a fresh D4 database. Alias tables start empty and remain unused.

PGlite cannot connect to a linked production database. The bootstrap has no remote SQL URL or CLI push path. Tests use isolated in-memory PGlite instances; the persistent development database was not populated as a side effect of this task.

## Clean input and team metadata ownership

`tests/fixtures/bsd-catalogue-clean.json` contains only the frozen BSD football evidence for league 11 / season 1539: 18 provider team identifiers/names and 543 normalized players. It was projected from the already audited BSD fields; no fresh live provider verification is claimed. It contains no aliases, legacy identities, old roster evidence hash, unresolved-player cohort or media.

`scripts/catalogue/team-registrations.json` separately holds reviewed internal slugs and Taktik Stüdyo display metadata. Its 18 entries bind BSD IDs directly to internal slugs. It contains no intermediate catalogue ID. The product palette and abbreviations are retained as product decisions; their original external provenance is not inferred or attributed to BSD/TFF/FotMob. Display names also retain the existing product-owned D2 convention. The BSD fixture preserves provider names separately; active league membership comes from the configured provider scope.

The clean fixture plus explicit product registrations are passed through the same server-side `syncLocal()` implementation as normalized provider data. The historical `audit-input.mjs`/`dry-run.mjs` utilities are not the D4 bootstrap path. The application no longer reads their old catalogue/alias input.

`fetchBsdCatalogue()` constructs server-only team/squad/player-detail GETs with default league 11 and season 1539, validates complete registered scope and normalized player facts, and does not follow media URLs. The full frozen 18/543 mock exercises 562 structured API requests: 1 team-list + 18 squads + 543 specific-position details. These are mocked test requests, not live BSD traffic and not browser requests.

Routine sync preserves UUIDs, mappings and product team metadata. Missing players become inactive; returning players reactivate their previous UUID. New players receive a UUID once. A team removed from a reviewed complete scope and its absent players become inactive. Nothing is hard-deleted. Unknown teams, incomplete collection or inconsistent data abort rather than invent mappings. This is a single configured league/season scope; adding another league would require a reviewed partitioning of lifecycle updates.

## Domain fields and board identity

```text
Team:
  id, name, shortName, color, color2, sortOrder, catalogueActive
Player:
  id, teamId, name, number (nullable), positionGroup,
  specificPosition, catalogueActive
```

There are no active catalogue fields for legacy/player-provider identity, photo, photoSource, photo_url, roles, starts, value or selection_rank. New Classic board footballer objects also omit optional photo properties instead of copying undefined historical metadata.

`slotId != playerId != providerId`:

- Classic v1 uses numeric `id` for the slot and the existing `athleteId` field for the internal UUID. The name remains only for wire/draft/share compatibility; broad renaming would change validators and stored snapshot contracts. It is not a provider lookup key in canonical mode.
- Match/Free Studio use explicit internal `playerId`, distinct slot/person keys, coordinates and formation role. New project snapshots contain internal footballer IDs and enough embedded display data to render independently.
- BSD IDs remain server-side mapping inputs and, where relevant, separate match-event DTO identities. Ordinary board rendering uses the resolved internal ID, not the provider ID.

The 15 specific positions and G/D/M/F groups remain catalogue facts. Formation role is a slot assignment. D2's 13 conflict and 81 lossy-position policy tests still pass. No permanent tactical role is added to canonical people.

## Default XI, bench and match transport

Default XI remains: latest completed same-season confirmed BSD lineup, otherwise a deterministic current-canonical-squad arrangement. Selection does not use legacy ranks/roles. Fallback uses broad/specific compatibility, shirt number and stable UUID tie-breaking; it is not a performance prediction or "best XI".

Provider normalization now accepts an explicit team resolver. Production's default mapper is unchanged. The canonical local server supplies a resolver backed directly by `team_provider_ids` before event/detail normalization; it does not first create a legacy team ID and then translate it. This resolver is also supplied to recent-lineup reads.

The server resolves player IDs through `player_provider_ids` before creating `canonicalModel`. Unknown identities or unusable confirmed formations select safe canonical fallback; unknown teams produce a controlled unresolved result. UI rendering never creates catalogue rows.

Match event DTOs can carry a separate nullable internal `playerId` for presentation overlays while preserving the provider incident identity/minute. Match Center uses that internal key. It no longer asks a browser alias resolver to translate customization keys. Upcoming Match Center lists can render directly from the canonical board model when raw provider lineups are missing; this has an explicit page regression test.

## Overrides, drafts, projects and shares

Canonical override load filters SQL to `internal:%`; save/update/reset reject non-internal keys. Presentation reads only that internal identity. D3's alias inheritance, collision selection, inherited-key deletion, browser resolve action and project/draft preparation calls were removed. No old records are migrated or deleted. Legacy production override parsing remains when `internalOnly` is false.

New boards/drafts/projects use internal IDs. Existing embedded historical snapshots may still be displayed by their generic validators, but there is no additional old-ID migration logic and preservation of their active catalogue joins is not a D4 requirement. User data remains untouched in production.

The readonly shared viewer renders an internal-ID embedded snapshot without any catalogue/provider/alias lookup. The clean test deliberately installs a throwing roster getter in an independent viewer, then renders the snapshot successfully. Public read-only restrictions remain intact. Canonical local share publishing stays disabled to avoid production writes; only payload creation/validation/viewing were tested. Enabling real canonical share creation requires a separately approved environment/phase.

Generic jersey SVGs remain the player visual system. No media URL is copied into new canonical domain objects, and no provider photo/logo endpoint is fetched.

## Fallback and remaining legacy production code

The canonical static format is D2's inert JSON `{version:1, identity:'taktik-internal', teams, players}`, suitable for an explicit future `canonical-catalogue.json` asset. It contains internal IDs and canonical/product fields, not mappings or media. The generator/local fallback action is tested. No production fallback asset is switched; canonical DB failure remains an explicit error, not a silent fallback.

`dist/rosters.js` is retained for production but removed from canonical served script inputs. The Classic test fixture now has a canonical mode that never reads that file. Generic board adapters can still use the old global variable name for a minimal in-memory normalized wire model; that name does not imply loading the legacy asset.

Remaining production dependencies include the old catalogue adapter, old roster asset, legacy selection branch, old match default mapper, snapshot optional-field validators and old schemas/seed. They are intentionally retained behind the legacy path. Canonical UI shows neutral product wording and neither TFF membership attribution nor FotMob squad links.

The complete six-category occurrence inventory is `BSD_CATALOGUE_RUNTIME_REFERENCES_D4.md`, generated by `audit-clean-runtime.mjs`. It distinguishes actual catalogue dependency references from literal rejection guards and generic JavaScript `value`/prose tokens. Both excluded classes are listed explicitly; they are not silently deleted. The combined generated bundle contains the retained production path, so a literal grep of the bundle is not a measure of canonical dependency. Historical SHA256 media entries in `docs/ORIGINAL_SHA256.json` are documentation, not media requests.

## Clean-room verification

`tests/catalogue-cutover.test.mjs` now executes the page integration on the D4 clean bootstrap. It verifies 18 teams/543 UUID players, two bounded browser catalogue queries plus one defaults request, and rejects browser queries for old teams/players/aliases or the removed resolve action. After confirming empty aliases, it drops both alias tables in that isolated test database before exercising the pages.

Coverage includes actual Classic/Comparison engines, team/formation changes, bench exclusion, substitution, movement, account-isolated internal overrides, Free Studio, Match Studio and upcoming Match Center, new project persistence, UUID drafts, and independent readonly shared rendering. No rosters.js is loaded by the canonical Classic fixture.

`tests/catalogue-clean-sync.test.mjs` adds three tests:

1. Start with zero canonical rows and no old catalogue tables; remove alias tables, sync and repeat, verify stable UUIDs, new player allocation, missing/returning team/player lifecycle and immutable product metadata. Add empty dummy legacy tables and repeat successfully without populating them.
2. Feed 18/543 clean BSD data through the real collector with mocked fixed endpoints; verify normalization, request count and absent media/legacy fields.
3. Exercise the real match season normalizer with the canonical resolver; direct internal team resolution, unknown-provider rejection and defaults continue with no aliases.

Final verification: `npm test` **499 passed / 0 failed / 0 skipped**, all **9 board regression groups passed**, and `npm run build` succeeded. The generated browser bundle was then included in the final full test run. `dist/backend.js` was generated only by build.

One failure occurred before fixing/retrying: `D4 clean room: no old catalogue, aliases or roster script; actual SQL and page engines` failed with SQL `42883: function tactics_private.touch_updated_at() does not exist`. The override migration depends on that general metadata trigger. The clean bootstrap now defines just that security-invoker function with restricted grants, without loading the old football schema. Focused and full suites subsequently passed. No unexplained flaky test was observed.

RLS/column grants continue to be exercised by real PostgreSQL tests, consistent with [Supabase's distinction between table grants and row policies](https://supabase.com/docs/guides/database/postgres/row-level-security). No production settings were queried or changed to make the tests pass. Build secret scan and whitespace results are included in the final task report.

## Future cleanup plan — design only

Do not execute a destructive migration in D4. After an approved canonical production cutover and observation period:

1. Perform a read-only inventory of `studio_projects` by mode/version and identity namespace in starters/bench/working joins, `player_overrides` by key namespace, and `shared_lineups` by embedded identity/schema. Report aggregate counts and real-user/test-data classification without printing snapshot contents, tokens or personal fields.
2. Inventory FK, view, function, trigger, grant and application dependencies on old catalogue tables/columns. Include generic sharing validators and export paths. Browser drafts require a separate local retention decision; they cannot be inferred from DB counts.
3. Agree explicitly which real user-created snapshots/customizations must be retained. An absence of catalogue foreign keys does not prove that deleting embedded user data is safe. No deletion follows automatically from namespace counts.
4. Back up approved data and record a restore procedure. Only after separate approval, remove obsolete catalogue assets/adapters and prepare a scoped migration for `public.players`, `public.teams`, obsolete aliases and source/photo fields. Do not cascade into user-owned projects, profiles or shares.
5. Verify application imports, grants/RLS, shared viewing, project/draft loading and rollback against the reviewed candidate before production apply.

Candidates are old football catalogue tables, alias structures, old media/source columns and fallback assets. They are not permission to delete user data. No cleanup SQL is shipped/applied in D4.

## Production prerequisites and rollback

Before canonical production use: recheck BSD licence/usage authorization; review/approve the additive canonical schema and internal override key support; decide whether obsolete empty alias structures should be excluded from the future production proposal; provide a reviewed production server resolver/sync transport; populate canonical mappings transactionally; verify current season coverage, default XI, RLS, query bounds, internal overrides/projects/drafts/shares, and UI smoke tests in an approved environment. Confirm backups and an observation/rollback window before any cleanup.

D4 is fixture-backed local verification, not fresh provider coverage or live production Auth/share testing. Source selection is not a production deployment plan by itself. A production runner still requires concurrency/scope review; the only writer shipped here accepts local PGlite.

Local rollback: stop the server, set `$env:CATALOGUE_SOURCE = 'legacy'`, restart. D3 and D4 local data directories remain intact. Production remains on legacy throughout this task, so no production data rollback is required. A future rollback must distinguish retained legacy user records from new canonical UUID records; automatic reverse identity migration is not promised.

## Changed files

Modified: `.env.example`, `dist/app.js`, `dist/backend.js` (build only), `scripts/catalogue/local-database.mjs`, `scripts/catalogue/local-service.mjs`, `scripts/catalogue/sync.mjs`, `scripts/serve-local.cjs`, `src/lib/catalogue-canonical.js`, `src/lib/catalogue-identity.js`, `src/lib/catalogue-local-client.js`, `src/lib/catalogue-source.js`, `src/lib/match-detail-ui.js`, `src/lib/match-detail.js`, `src/lib/match-layout.js`, `src/lib/match-studio-ui.js`, `src/lib/page-bootstrap.js`, `src/lib/player-overrides.js`, `supabase/functions/matches/provider.js` (optional resolver parameter, default preserved, no deploy), `tests/catalogue-cutover.test.mjs`, `tests/helpers/classic-board-fixture.mjs`.

Added: `scripts/catalogue/audit-clean-runtime.mjs`, `scripts/catalogue/team-registrations.json`, `tests/catalogue-clean-sync.test.mjs`, `tests/fixtures/bsd-catalogue-clean.json`, this report and `BSD_CATALOGUE_RUNTIME_REFERENCES_D4.md`.

Untouched: actual `.env`, production migration files, legacy rosters/seed, historical D1/D2/D3 reports, Auth/recovery/profile security settings, and all production resources.
