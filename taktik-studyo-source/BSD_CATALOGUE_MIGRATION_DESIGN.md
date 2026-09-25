# D2 — Provider-independent catalogue infrastructure

Status: LOCAL IMPLEMENTATION / PROPOSAL, 25 September 2026. No production phase executed.

## Scope and evidence

D1 (`BSD_CATALOGUE_COMPATIBILITY_AUDIT.md`) and D1.1
(`BSD_MIGRATION_BLOCKER_AUDIT.md`) are frozen evidence, not live guarantees.
`scripts/catalogue/audit-input.mjs` extracts their curated fields and checks the
old roster/seed to build `tests/fixtures/bsd-catalogue-audit.json` offline. Source
SHA-256 values are recorded in the fixture. No provider media or raw responses
are included. No new BSD request was required for D2.

Recomputed counts: 18 teams, 543 BSD players, 539 legacy players; 359 D1 HIGH +
29 D1.1 safe variants = **388 safe player aliases**. The remaining **151** are
88 MEDIUM, 61 below the safety threshold, and 2 AMBIGUOUS. Both Moussa Diakité
legacy IDs remain unresolved. This is not a fuzzy/name-only migration.

Implemented locally: additive SQL proposal, server-side fetch/normalization and
sync planner, transactional **PGlite-only** writer, identity resolvers, override
migration proposals, default XI selection, fallback generator and tests.

Deliberately not activated: browser catalogue reads, existing rosters.js,
existing BSD-to-FotMob map, override key validation, public sharing, drafts,
project loading and provider Edge Functions. They continue using the old path.
D2 is infrastructure, not completion of D2D–D2G.

## Identity ownership and staged schema

Migration: `supabase/migrations/20260925035438_catalogue_identity_foundation.sql`.
Created using the installed Supabase migration CLI; applied only in disposable
in-memory PGlite tests. Depends on `tactics_private` from football_backend.
No changes to existing table definitions, rows, policies, grants or functions.

We stage `public.catalogue_teams` and `public.catalogue_players` beside existing
`public.teams` and `public.players`. This avoids changing the latter's text IDs,
legacy roles/rank columns, existing consumers or rollback path. These new tables
ARE the proposed future canonical contract; a later rename to teams/players is
optional, not required. BSD IDs will never become the canonical players PK.

| Table | Contract |
| --- | --- |
| catalogue_teams | id text PK (product slug, 1–80), display_name (1–80), short_name (1–8), two hex colors, sort_order (0–10000), catalogue_active, created_at, updated_at |
| catalogue_players | id UUID PK (random UUID v4 on controlled sync creation), team_id FK RESTRICT, display_name (1–100), position_group G/D/M/F, specific_position (15 audited values), nullable shirt_number 1–99, catalogue_active, created_at, updated_at |
| team_provider_ids | provider + provider_id composite PK; team_id FK RESTRICT; unique(team_id,provider); created_at, updated_at |
| player_provider_ids | provider + provider_id composite PK; player_id UUID FK RESTRICT; unique(player_id,provider); created_at, updated_at |
| legacy_team_aliases | namespace='taktik-v1' + legacy_id composite PK; team_id FK RESTRICT; evidence, created_at |
| legacy_player_aliases | namespace='taktik-v1' + legacy_id composite PK; player_id UUID FK RESTRICT; evidence, created_at |

No starts, value, selection_rank, photo_url, source_url, FotMob role arrays or
provider-specific columns in canonical tables. Provider codes are extensible
validated text; initially only BSD mappings are populated. A future provider
gets a separately reviewed mapping to the SAME UUID. Name matching must not
generate or reassign UUIDs during routine sync. Provider mapping targets are
immutable to service_role; reassignment requires separate administrator review.

Team slugs are product decisions, not automatically regenerated from changing
names. Colors and UI abbreviations are PRODUCT UI METADATA, retained from the
current product palette. Their original hex-value provenance is not established
by these audits; they are not attributed to BSD, TFF or FotMob. BSD names are not
used as short UI labels. In this design team display_name is also product-owned.

Exact proposed automatic team aliases (all in namespace taktik-v1):

| Historical team ID | Internal team ID | BSD mapping |
| --- | --- | --- |
| fotmob-4678 | alanyaspor | 188 |
| fotmob-96498 | amedspor | 3380 |
| fotmob-1933 | basaksehir | 194 |
| fotmob-10188 | besiktas | 196 |
| fotmob-2166 | caykur-rizespor | 189 |
| fotmob-357274 | corum-fk | 3295 |
| fotmob-281467 | erzurumspor | 1346 |
| fotmob-4681 | eyupspor | 191 |
| fotmob-8695 | fenerbahce | 134 |
| fotmob-8637 | galatasaray | 125 |
| fotmob-4081 | gaziantep-fk | 183 |
| fotmob-7800 | genclerbirligi | 185 |
| fotmob-1925 | goztepe | 190 |
| fotmob-4685 | kasimpasa | 187 |
| fotmob-1569 | kocaelispor | 198 |
| fotmob-8622 | konyaspor | 192 |
| fotmob-9750 | samsunspor | 184 |
| fotmob-9752 | trabzonspor | 197 |

The fixture includes every one of the 388 player mappings with evidence class,
and every unresolved ID with its reason. HIGH is recomputed with D1's exact
normalized-name, same-team, known equal number and broad-position rules plus
global collision rejection. The 29 variants come from D1.1 Appendix A, with
team/number/group checks and checks against targets already claimed by D1.
The generator is evidence tooling only; it is NOT a recurring fuzzy sync.

## Position facts versus tactical roles

Canonical position_group and specific_position preserve both BSD values. The
15 values are GK, CB, LB, RB, DM, CM, AM, LW, RW, ST, LM, RM, DEF, MID, FWD.
The 14 null shirt numbers remain null; no invented number and no schema widening.

`bsd-specific-position.js` returns compatibility metadata without assigning a
permanent tactical role. The direct codes can prefer KL/STP/SLB/SĞB/ÖL/MO/OO/
SLK/SĞK/SF respectively. The 81 lossy/generic cases (LM 2, RM 4, DEF 23, MID 22,
FWD 30) have **no preferred tactical role**. Broad defensive/midfield/attacking
slots are eligible; LM/RM also allow the corresponding wing slot.

Conflict policy: preserve both fields; if they disagree, position_group governs
eligibility and specific preference is disabled. The 13 flagged audit players
are visible in dry-run conflict output and tests. LW/RW accepts M or F because
wing taxonomy spans both. Unknown future codes abort normalization for review;
they are not silently changed to a legacy role. Catalogue data never stores a
role selected by the formation algorithm or a user's override.

## Default XI and deterministic arrangement

`catalogue-default-xi.js` consumes normalized completed-match candidates. The
server adapter must supply internal teamId, exact seasonId, kickoff, confirmed
status and the existing normalized lineup shape (not raw BSD bodies).

1. Select the latest completed match of this team in the SAME season (kickoff,
   then stable match-ID tie-break).
2. Use it only when status is confirmed, validXI succeeds, formation is valid,
   and all starter/bench IDs resolve uniquely to active squad UUIDs.
3. Otherwise use deterministic current-squad fallback. No predicted lineup;
   no older-season data or starts/value/rank. A missing latest lineup does not
   silently search backwards for stale data.

Confirmed XI preserves the exact player set and bench membership; it is a
default arrangement, not a claim about real on-field coordinates. The source
normalizer does not promise formation-slot ordering, so product slot templates
place those 11 players deterministically. Common formations have explicit slot
templates; other valid 10-outfield formations use defensive/middle/attacking-line
templates. These roles belong to slots, not canonical people.

Fallback defaults to 4-3-3. For each slot: unused player with direct compatible
preference, then broad-compatible player, then another outfield player if the
squad lacks that group. Ties: shirt number (null last), then internal UUID ASCII
order. A goalkeeper is required for KL and never used as an outfield fallback.
Incompatible emergency placement is marked compatibilityFallback. Less than
11 usable players fails instead of fabricating people. Remaining squad players
form the bench. This is a **default arrangement**, never a “best XI”.

## Server sync and ownership

Flow: BSD structured data → server GET collector → complete normalized input →
transactional canonical upserts/mappings → Supabase catalogue → browser.
No browser imports, every-user 18-squad fetches, provider media, or embedded token.

`scripts/catalogue/sync.mjs` fetches the scoped team set, all registered team
squads and player details for specific_position. It fixes the provider origin,
constructs paths from validated IDs, denies redirects, caps bodies/time/team/
squad counts and rejects pagination/incomplete scope or inconsistent detail
identity. Errors are controlled codes, never raw responses or credentials.
No live fetch was executed for D2; mocked GET contracts are tested.

Existing team registrations must be supplied from reviewed product metadata
and persisted mappings. Unknown clubs or changed league scope abort for review.
The audit fixture is a frozen bootstrap/test input, not a live registration DB.

`planSync` defaults to a pure plan. `syncLocal` defaults to dryRun and accepts
only a real in-process PGlite. **No remote database writer is shipped.** This
allows real SQL tests without any possible production connection string path.
Offline plan: `node scripts/catalogue/dry-run.mjs`.

New players get random UUIDs on initial transaction; existing mappings always
reuse their stored UUID. Dry-run UUIDs are provisional, not an allocation
manifest. Actual approved population must persist the plan transactionally.
Transactions rollback player updates when an alias conflicts. Provider IDs and
canonical references are protected by unique constraints/FKs.

Only player football fields (name, membership, number, broad/specific positions)
and active flags change during updates. Product team metadata never changes
automatically. No override/project/drawing/snapshot operation exists in sync.

Complete successful scope only: previously mapped BSD players missing from the
current registered teams become inactive, retaining their last team and mapping.
Return to the squad reactivates the same UUID. Transfers reuse the UUID and
update team membership. No hard deletes. Partial or malformed response aborts
the run; it must not trigger deactivation. League club changes require reviewed
registration/scope updates, including explicit team lifecycle decisions.

Future remote runner requirements before production: distributed single-run
lock, transactional read/plan/write, rollback on any identity conflict, bounded
retry/rate-limit handling, provider completeness monitoring and approved schema
fingerprint. Do not replace local PGlite with a browser Supabase client or execute
hundreds of independent non-transactional PostgREST writes.

## Compatibility and user data

**Historical snapshot identity is preserved; active catalogue identity is provider-independent.**

`catalogue-identity.js` takes explicit identity namespaces. A numeric string is
not enough to infer its provider. Missing/ambiguous aliases return null, never a
guessed player. Resolution does not overwrite embedded names, numbers, roles,
coordinates or user choices, even for resolved players.

| Surface | D2 contract / later activation |
| --- | --- |
| Studio Projects v1 | Keep teams.home/away players + bench and working slotKey/personKey joins intact. Resolve in a sidecar. Never bulk rewrite stored snapshots. Unresolved embedded players remain renderable. |
| New projects | createInternalProjectSnapshot is for NEW projects only; replace playerId with UUID and key with internal:side:team:UUID; rewrite all working joins together or abort. Same v1 field/length validators accept this. This converter is not called by existing loading code. |
| Classic drafts | athleteId already accepts up to 80 characters, so UUID fits v1; role remains slot/user data. Old numeric IDs resolve only through legacy aliases, not overwritten in persisted old drafts. New canonical board construction can serialize UUIDs. No draft key/scope/version change needed. |
| Public shares | Existing embedded values render without catalogue or alias lookup. Existing shared_lineups rows stay untouched. New UUID athleteId fits existing strict share schema, with the same Edge-only access. No direct table grants. |
| Match Studio | Resolve BSD player/team IDs server-side through mappings before building new canonical boards. Unknown people may display event embedded values; no browser insertion, no speculative identity. New canonical project creation waits for controlled sync/resolution if a canonical ID is needed. |
| Player overrides | Future primary key namespace internal:UUID. planOverrideAliases produces owner-scoped proposals, preserving name/number/role. No current override writes or validator changes in D2. |

Override collisions: if local:<id> and bsd:<id> (or an existing internal key)
resolve to the same UUID, preserve both and mark explicit conflict. Do not choose
last-write-wins. Unresolved local overrides remain in the current owner-scoped
compatibility rows and apply only to matching historical identities, not guessed
active people. A separate additive ownership-preserving override migration and
API/validator update are required in D2D. No cross-user merge. Existing RLS and
account-generation cancellation remain unchanged.

Aliases/mappings are not exposed as client tables. During D2D a narrowly scoped
server adapter should resolve only requested IDs for authenticated compatibility
flows and include canonical IDs in normalized match responses. Public shares
need no such lookup. Do not ship the audit alias fixture to browsers. The current
hardcoded BSD→fotmob mapping stays until that adapter and browser tests exist.

## Replacing rosters.js and active FotMob fields

`scripts/catalogue/fallback.mjs` generates deterministic, inert JSON containing
only canonical teams/players, product colors/short labels and canonical position
facts. It rejects legacy player IDs and fotmob team IDs. Tests generate and parse
18/543 from the simulated canonical data. No mapping/alias, photo/source URL,
starts/value/selection_rank or provider token is serialized.

Later build flow: approved normalized DB snapshot with stable allocated UUIDs →
generateFallback → versioned local JSON artifact → browser canonical adapter.
Validate counts/FKs/checksum before publishing. Do not allocate fresh UUIDs in
every build, publish test UUIDs, or reuse legacy ranks under new field names.
The generator is not wired to npm build yet; no active catalogue switch in D2.

D2F must remove active references in src/lib/catalogue.js (old field selection,
source fallback), classic app selection logic, Free Studio roster adapter,
supabase/functions/matches/teams.js, seed-generation workflow and source
attribution UI. Replace old rosters.js artifact instead of leaving it as a second
permanent fallback. Keep old IDs only in isolated historical compatibility,
tests and migration evidence. Do not alter historical Git commits.

## Security model

All six new tables enable RLS and revoke inherited/default PUBLIC, anon,
authenticated and service_role grants before explicit grants. Canonical active
rows are SELECT-only to anon/authenticated; no INSERT/UPDATE/DELETE. Mapping and
alias tables have no client grants/policies. service_role gets bounded column
INSERT/UPDATE plus SELECT, no DELETE, no mapping-target UPDATE. Product team
metadata cannot be automatically updated even by the sync role. Trigger function
is SECURITY INVOKER in tactics_private with empty search_path, and uses a new
non-colliding name. Existing shared_lineups, Auth, profiles, overrides and project
privileges/policies remain unchanged.

Indexes: active catalogue_players(team_id,id), unique provider IDs, unique
internal-ID/provider pairs, alias PKs and alias-target indexes. No public RPC or
SECURITY DEFINER function added. Grants/RLS choice follows the
[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Migration is a one-time versioned migration, not an idempotent SQL bootstrap.
Executing it twice fails on existing objects; transactional rollback prevents
partial second application. Never use IF NOT EXISTS to hide schema drift.

## Release phases and rollback (not executed)

1. **D2A additive schema:** review this migration, privileges and backup; explicit
   production approval; dry-run must show only approved changes. No data backfill.
2. **D2B BSD population:** implement/review remote transactional runner; confirm
   licensing; populate 18 teams and current complete BSD squads, persist UUID
   mappings. Audit counts/changes against current feed, not a permanent 543 rule.
3. **D2C compatibility aliases:** approve the frozen 388 safe aliases/18 teams,
   reconcile new evidence separately, retain 151 unresolved. Verify collisions
   and FK integrity. No guessing, no historical-row rewrite.
4. **D2D application dual-read:** server ID-resolution adapter, canonical browser
   catalogue adapter, override namespace migration with same ownership security,
   saved-project/draft/share compatibility and all feature/UI regression tests.
5. **D2E active switch:** gated configuration after verified dual-read deployment;
   monitor catalogue load failures, identity misses and override conflicts. New
   data uses internal IDs; historical snapshots remain self-contained.
6. **D2F fallback removal:** generate reviewed canonical JSON, remove active legacy
   source/rank/media/ID assumptions. Test offline/read-only/old-snapshot paths.
7. **D2G cleanup after observation:** separate reviewed migration only after all
   consumers moved and restore drill passed. No historic Git rewrite or forced
   deletion of unresolved historical data.

Rollback BEFORE deployment: keep old tables, rosters artifact and aliases; export
canonical UUID allocations/mappings so rollback/retry never reallocates people.
Before D2E, rollback is simply not activating the new reader; additive data can
remain dormant. After D2E, switch back to the **tested dual-read release** with
old active catalogue selected, keeping internal snapshot/override support. A
blind rollback to a pre-D2D build is unsafe for new internal-key overrides.
Freeze sync if necessary. Do not delete canonical rows/aliases or downgrade
snapshot fields, and do not roll back user work. Database restore must not erase
post-switch user writes. Additive-table DROP is not the operational rollback.

Production gates still open: applicable BSD structured-data license confirmation/
effective date; site privacy retained; secure remote runner; D2D integration;
override key/schema update; browser end-to-end compatibility; approved population
and alias manifest; backup/restore drill; monitoring; explicit production approval.
No claim that public/production licensing is active. Generic jersey rendering
continues; no provider logos, player photos or media downloads.

## Local verification

Commands: `node scripts/catalogue/audit-input.mjs`,
`node scripts/catalogue/dry-run.mjs`,
`node --test tests/catalogue-identity.test.mjs tests/catalogue-migration.test.mjs`,
`npm test`, `npm run build`, `git diff --check`.

Tests cover exact safe cohorts, all positions/conflicts, metadata protection,
new/returning/transferred identities, provider change, legacy/BSD/internal lookup,
unresolved snapshots, draft/share validators, project keys/joins/bench/drawings,
owner-scoped override proposals/collisions, confirmed XI and deterministic
fallback, frozen fixture extraction, bounded provider mock GETs, actual SQL/FKs/
grants/RLS, soft departure and transaction rollback. Existing DB and board tests
run through npm test. All simulations are in-memory, not a local/remote Supabase
project connection. dist/backend.js is build-only; no browser activation here.

Recorded verification on 25 September 2026:

- Offline fixture/dry-run: 18 teams, 543 active players, 18 team aliases,
  388 safe player aliases, 151 unresolved, 13 position conflicts.
- D2-focused suite: 18 tests (including seven SQL subtests), all passed.
- Final `npm test`: 484 tests passed, zero failed/skipped; nine board regression
  groups also passed. An earlier full run had one failure whose diagnostic was
  lost in truncated terminal output; the next two full runs passed. Its cause
  was not established, and no unrelated test or runtime code was modified.
- `npm run build`: passed; generated backend.js has no content diff.
- `git diff --check` and separate untracked-file whitespace checks: passed.
- Protected hashes for old rosters.js, seed.sql, D1 report and D1 script match
  pre-task evidence. D1.1 report/script were only read.
- Bundle check: no BSD token variable, server secret literal pattern, private
  key block, new test token fixture or D2 migration material found. Server
  modules are outside the browser entry graph.
- All tracked product files unchanged. Twelve new D2 files; four earlier D1/D1.1
  audit files remain untracked as before. No staging/commit/push/deploy or
  production mutation. No new provider request or media download.
