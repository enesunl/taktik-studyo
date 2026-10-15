# PROD1.4 — BSD catalogue production cutover plan (15 Oct 2026)

**Audit and plan only.** No code, data, configuration, migration, commit, push or deploy was changed.

Production was read with:
- the Supabase connector: migration list, aggregate counts, and grants/policies;
- one query returning only the catalogue IDs referenced by saved records (no user IDs, titles, coordinates or snapshot content);
- public HEAD requests.

**Decision (operator, 15 Oct 2026):** the public MVP uses the BSD canonical catalogue. It does not launch on the legacy FotMob snapshot.

## Status update — SEC1/SEC1.1 (15 Oct 2026, local only)

**Implemented locally** (nothing deployed or applied in production):
- `dist/rosters.js` removed from the published tree; no page loads a static roster.
- The legacy static fallback is gone. Every roster page loads the active catalogue, and a failure shows "Takım kataloğu şu anda yüklenemedi".
- Builds default to `CATALOGUE_SOURCE=canonical` (step A4). A hosted origin reads `catalogue_*` through the signed-in Supabase client; legacy is an explicit rollback build only.
- Misleading credits replaced (TFF note, showcase names re-sourced to BSD; step A9).
- Migrations written: SEC1 `20260924200000` (no anon read of `public.teams/players`) and `20260925040000` (no anon read of `catalogue_*`; plan item M1).

**PROD1.5 (local only):** done:
- **M2:** `20261015120000_player_override_internal_keys`.
- **M3:** `20261015120100_catalogue_sync`, a transactional, service-role-only writer.
- **A10:** `scripts/catalogue/import.mjs`, which replaces the planned data migration M5. It is dry-run by default, needs explicit confirmation, writes a backup outside the repo, and uses deterministic BSD-derived UUIDs.
- **A7:** `matches` canonical model from the catalogue tables (`supabase/functions/matches/canonical.js`).
- **Local Supabase transport:** `CATALOGUE_TRANSPORT=supabase`.

Release order and recovery: `PROD1_RELEASE_PLAN.md`, "PROD1.5 update".

**Still required before release:**
- the live BSD pull;
- the decision on share links (P5-1);
- A8: end-to-end sharing on hosted;
- every ⛔ step.

## 1. Current state and why production is still legacy

| Item | Evidence |
| --- | --- |
| Source selection | `createCatalogueSource()` defaults to `legacy` ([catalogue-source.js:9](src/lib/catalogue-source.js#L9)). Only the local server injects `TAKTIK_CATALOGUE_CONFIG={source:"canonical"}` ([serve-local.cjs:65,98-100](scripts/serve-local.cjs#L65)). The production build has no such switch ([build-backend.mjs](scripts/build-backend.mjs)). |
| Canonical transport | `createLocalCatalogueClient()` refuses non-loopback origins ([catalogue-local-client.js:5](src/lib/catalogue-local-client.js#L5)). In canonical mode, catalogue, overrides, projects, `defaults` and the `canonicalModel` of matches are served by the local PGlite service ([local-service.mjs](scripts/catalogue/local-service.mjs)), not by Supabase. |
| Canonical data | Frozen fixture `tests/fixtures/bsd-catalogue-clean.json`: 18 teams / 543 players, BSD data observed on 24 Sep 2026. Sync writes only to PGlite ([sync.mjs](scripts/catalogue/sync.mjs)). |
| Production DB | 5 of 12 migrations applied. No `catalogue_*`, `weekly_lineups` or profile-onboarding tables. Legacy `public.teams` = 18 and `public.players` = 539 (FotMob snapshot, 12 Sep 2026). |
| Sharing | Disabled in canonical mode (`sharingReady()` false, `saveLineup` throws; [backend-entry.js](src/backend-entry.js)) to avoid local writes reaching production. |

Production stays legacy because D3/D4 built the canonical path as **local-only by design**. Four things are missing:
1. a production data transport;
2. a production sync writer;
3. a production build switch;
4. the corresponding migrations (never approved or applied).

**New findings in this audit:**
- **Anonymous read of the FotMob snapshot.** Production grants `anon` SELECT and has `players_public_catalogue` / `teams_public_catalogue` anon policies. Anyone with the public publishable key can read all 539 FotMob-sourced rows through REST, independently of the Netlify password.
- **Weekly XI cannot work on legacy.** Both the client (`canonicalWeeklySnapshot`, [weekly-lineups.js:6](src/lib/weekly-lineups.js#L6)) and the DB check (`20261014074114`, line 18) require UUID player IDs. The cutover is therefore a prerequisite for launching Weekly XI.
- **Old Classic drafts duplicate players.** A localStorage draft holds legacy numeric `athleteId`s. Restored against a canonical squad, `sameAthlete()` never matches a UUID ([app.js:92,124,282](dist/app.js#L92)), so on-pitch players reappear on the bench.

## 2. Recommended production architecture

```text
BSD (league 11, season 1539)
  └─ operator-run sync (server-side, secret key, dry-run by default)
       └─ RPC tactics_private.apply_catalogue_sync(payload)  [service_role only, one transaction]
            ├─ catalogue_teams / catalogue_players (UUID)      → authenticated read only
            ├─ team_provider_ids / player_provider_ids          → server only
            └─ legacy_*_aliases (reviewed, safe only)           → server only
Browser (production build CATALOGUE_SOURCE=canonical)
  ├─ catalogue: 2 PostgREST reads (teams, players), 5-min cache, no fallback
  ├─ overrides: internal:<UUID> keys
  └─ legacy-ID drafts are not restored in canonical mode (no resolver; see section 4)
Edge Function matches (service key inside function only)
  ├─ team/player resolution via *_provider_ids → canonicalModel
  └─ ?defaults → recent confirmed XI (existing catalogue-default-xi logic)
```

**Data model:** the D2 tables in `20260925035438_catalogue_identity_foundation.sql` are kept unchanged:
- team: product slug, display name, short name, colours, `sort_order`, `catalogue_active`;
- player: UUID v4, `team_id`, `display_name`, `position_group` G/D/M/F, `specific_position` (15 values), nullable `shirt_number`, `catalogue_active`;
- 14 of the 543 players currently have no shirt number.

**Stable IDs:**
- UUIDs are allocated **once** and recorded in the reviewed import file, so local, staging and production share identical IDs.
- Sync never reassigns a provider mapping. A missing player becomes inactive, and a returning player reactivates their old UUID (D4 lifecycle).

**Read access:** authenticated only. Every page that uses the catalogue is protected, and the shared viewer renders the embedded snapshot. This narrows licence §4 exposure (no anonymous dataset API).

**Sync writer:**
- A Node operator script (`scripts/catalogue/sync-hosted.mjs`) reuses `fetchBsdCatalogue()` + `planSync()`. It refuses any project other than `supabase/project.json`, prints only counts, and needs `--apply` plus a typed confirmation.
- The secret key lives only in the operator's shell environment.
- An Edge Function is not recommended for the full sync: a cold full pull is 562 BSD requests, which at a polite ≤5 req/s is about 2 min and close to the Edge wall-clock limit.
- Routine syncs should fetch position details only for new players (about 19 + n requests).

**Updates:**
- Manual weekly sync during the season, plus after the January transfer window.
- New season (2027/28): update `LEAGUE_ID`/`SEASON_ID`, review team registrations (promotions and relegations), then sync. That is a separate, reviewed scope change.

## 3. Saved-work references vs the D3 mapping (production, 15 Oct 2026)

Mapping: `tests/fixtures/bsd-catalogue-audit.json` (388 safe aliases = 359 `D1_HIGH` + 29 safe variants; 151 unresolved = 88 `MEDIUM`, 61 `NO_SAFE_MATCH`, 2 `AMBIGUOUS`).
- `MEDIUM` means same team and same normalised name, but a different shirt number or position.

| Saved data | Production records | Player refs (distinct) | Safe alias | Unresolved |
| --- | --- | --- | --- | --- |
| Studio projects | 2 (both `free`, v1, `probable-local`) | 122 | 92 | **30** (16 MEDIUM, 14 NO_SAFE_MATCH) |
| Player overrides | 2 (`local:` keys) | 2 | 2 | 0 |
| Shared lineups | 8 (all Galatasaray; **disposable**, deleted by `20261014150000`) | 17 distinct / 88 refs | 15 | 2 MEDIUM (Leroy Sané, Barış Alper Yılmaz) |
| Weekly XI | table absent in production | 0 | — | — |
| Classic/Comparison drafts | browser localStorage only; not measurable server-side | unknown | — | — |

- Project team IDs `fotmob-10188`, `fotmob-1933`, `fotmob-8695` and `fotmob-9750` all have a team alias (besiktas, basaksehir, fenerbahce, samsunspor).
- The only profile in production is one confirmed account, so these records are probably operator test data. **Confirm (decision D-2).**

**Unresolved players used by the 2 projects:**

| Group | Players | Proposed handling |
| --- | --- | --- |
| **MEDIUM (16)**: same team and name, only number/position differ | Tanguy Coulibaly, Can Keleş, Oğuz Aydın, Ernest Poku, Batuhan Çelik, Amara Diouf, Kerem Fidan, İlhan Fakılı, Edin Višća, Emre Kilinç, Eldor Shomurodov, Václav Cerny, Milot Rashica, Andreas Skov Olsen, Yusuf Sarı, Mason Greenwood | Human review. Each has exactly one same-team BSD candidate with the same or a diacritic-variant name. If approved, add as `REVIEWED_MEDIUM` aliases. |
| **NO_SAFE_MATCH, close spelling variants (7)** | İrfan Kahveci → İrfan Can Kahveci; Alper Pazar → Alper Efe Pazar; Anto Sekongo → Antoine Sekongo; Efe Töruz → Efe Berat Törüz; Azem Yortac → Mustafa Yortaç (needs care); Kouadou Assoumou → Jaures Assoumou (needs care); Fahri Ay | Review one by one. Never alias automatically. |
| **No BSD candidate (7)** | Ömer Beyaz, Abbosbek Fayzullayev, Francis Nzaba, Oskar Öhlenschlaeger, Kuzey Sapaz, Berkay Aslan, Marius Mouandilmadji | Possibly left the squad. Keep as historical embedded players. |

None of this blocks rendering. Project snapshots embed `name`, `number` and `position`, and opening them uses `projectBoardState(snapshot)` without a catalogue join ([match-studio-ui.js:33-40](src/lib/match-studio-ui.js#L33-L40)).

## 4. Migration strategy for existing work

**Update 15 Oct 2026 (operator):** the 2 projects, 2 overrides and 8 share links are disposable test data. Choose the simplest safe strategy. Build no compatibility logic only for them, and delete nothing without approval.

Rules:
- FotMob and BSD numeric IDs are never equated.
- Stored snapshots are never rewritten.
- An unmatched player is never replaced.
- Every migration is additive. Legacy tables stay until a separate cleanup phase.

| Data | Strategy (simplified) |
| --- | --- |
| Studio projects | Leave untouched. They still open from their embedded snapshot (no catalogue join). No resolver and no aliases. |
| Overrides | Production migration extends the `player_key` check to `internal:<UUID>`. Old `local:` rows stay stored but are ignored in canonical mode (`internalOnly`). No copy migration. |
| Shares | The 8 test links are deleted only by the already planned `20261014150000` (⛔ its approval covers that deletion). New shares embed UUID `athleteId`s. Re-enable publishing in canonical production mode. |
| Weekly XI | Launch canonical-only. No legacy records exist. |
| Classic/Comparison drafts | In canonical mode, a browser draft containing non-UUID `athleteId`s is **not restored**: it is left in storage unchanged and the board starts from the canonical squad. This avoids the duplicate-bench defect without a resolver. |
| Favourite team | Slugs are already canonical (`catalogue_teams` seed `20261014140000`). After cutover, `teamId` becomes the slug. |

The D3 alias review (section 3) is therefore **not required** for launch. It stays documented as evidence only.

## 5. Runtime dependency audit

| Page | Production now (legacy) | Canonical requirement | Gap |
| --- | --- | --- | --- |
| Taktik Tahtası (Classic, `studyo.html`) | `public.teams/players` via `catalogue.js`; fallback `rosters.js` (script tag); TFF note; "Kadro verisi: FotMob" link (`app.js:138`) | Canonical reader on Supabase; no fallback | Build switch, Supabase transport, HTML/script removal, draft resolver |
| Stüdyo (Free Studio) / Comparison | Same catalogue; projects in Supabase | Same; projects keep Supabase | Same as above; old projects open from embedded data |
| Maç Stüdyosu (`mac-studyosu.html`) | `matches` absent in production; legacy probable XI from `TAKTIK_ROSTERS` (`match-layout.js:42-51`) | `canonicalModel` and `defaults` from the `matches` Edge Function | Port `canonicalMatch`/`defaults` from `local-service.mjs` into `matches`; licence gate |
| Maç merkezi (`mac.html`) | loads `rosters.js` | Event `playerId` internal overlay | Same as above |
| Haftanın İlk 11'i | Catalogue via `loadCatalogue`; save **impossible** on legacy (UUID check) | Canonical catalogue + `weekly_lineups` migrations | Cutover required first |
| Onboarding / favourite | `catalogue_teams` (absent in production → seed migration queued) | Same | Showcase player names are copied from `rosters.js` ([onboarding-showcase.js:2](src/lib/onboarding-showcase.js#L2)); re-source from BSD |

## 6. Removing legacy usage, misleading credits and unsafe fallback

1. **Build switch.** Add a `CATALOGUE_SOURCE` build constant (default `legacy` until the cutover commit). The production bundle uses `canonical`. The loopback guard stays for the local transport only.
2. **HTML.** Remove `<script src="rosters.js">` from `studyo.html`, `mac.html` and `mac-studyosu.html`. Replace the `source-note` "Takım listesi: TFF · Gerçek kadrolar" with neutral wording, for example "Takım kataloğu · Taktik Stüdyo. Veriler resmî değildir."
3. **app.js.** Neutralise the "Kadro verisi: FotMob" branch (line 138). Keep the legacy adapter code until cleanup.
4. **Fallback.** A canonical failure shows the explicit error (already implemented). There is no silent fallback to legacy tables or to `rosters.js`.
5. **Published files.** `dist/` is the Netlify publish directory, so `dist/rosters.js` stays publicly downloadable even without a script tag. With approval, move it to an archive outside `dist/` (for example `legacy/catalogue/rosters.js`, kept in Git). Update the scripts and tests that read it.
6. **Database exposure.**
   - **Anonymous read:** handled separately by SEC1 (`20260924200000_legacy_catalogue_no_anon_read.sql`, local only, not applied in production).
   - **Signed-in read:** after cutover, also revoke `authenticated` SELECT with a reversible migration. Do not drop the tables until the cleanup phase.

## 7. Freshness and licensing

**Freshness**

| Item | Detail |
| --- | --- |
| Legacy snapshot | 12 Sep 2026 (FotMob) |
| BSD fixture | 24 Sep 2026 |
| Before launch | A fresh BSD pull is mandatory. It produces the import file, diffed against the fixture, with counts reviewed. |

**BSD licence v4.0** (verified 15 Oct 2026; see `MATCHES_RELEASE_REVIEW.md` §3):

| Clause | Effect on this plan |
| --- | --- |
| §2 | Storing and retaining data for internal use and displaying it in our own app is allowed, so a DB catalogue is allowed. |
| §4 | No mirroring or redistribution as a dataset or API. Hence: authenticated-only read, no bulk export, no anonymous REST, and the 543-player import file kept in a **private** repo only. |
| §5 | On termination, stop serving the data. A kill switch is needed (`catalogue_active=false` or a grant revoke); the policy for saved projects that embed names is open (lawyer). |
| §7 | Data must not be presented as official. |

**Plan and fair use:**
- A full sync costs about 562 requests; routine syncs about 20+.
- The free tier's 7,500/day is sufficient, but Unlimited ($5/month) is still recommended for the matches traffic.

**Still open for the lawyer:**
- upstream league/TFF rights;
- player names under KVKK;
- whether user shares count as Derived Output;
- whether past FotMob use requires any action. The data has never been public: password-protected site, private repo. The anonymous REST grant is the exception.

## 8. Historical portraits

| Location | Status |
| --- | --- |
| Working tree | `dist/faces/` is empty (removed in `5a32a19`). |
| Git history | 473 PNGs and `images.fotmob.com` URLs in `918feb2`, reachable from `origin/release/netlify-migration`. GitHub returns 404 without authentication, so the repo appears **private**. History was not rewritten. |
| `taktikstudyo.com/faces/554534.png`, `/rosters.js` | **401** (Netlify password). The current deploy's content is unknown: it may still contain `faces/`. |
| `www` | 301 to apex. |
| Guessed `*.netlify.app` names | 404 (not this site). The real Netlify subdomain and deploy permalinks are **not verifiable from here**. |

**Action:**
- Before removing the password, check in the Netlify dashboard whether the deploy you will publish contains `faces/`. It will not if it is built from current `dist/`.
- Check that password protection covers deploy permalinks and branch deploys.
- Keep the repository private. Re-decide history only if it ever becomes public.

## 9. Ordered implementation plan (⛔ = explicit approval checkpoint)

### Phase A — local implementation (no production effect)

| Step | Files | Notes |
| --- | --- | --- |
| A1 Fresh BSD pull + reviewed import file | `scripts/catalogue/sync.mjs` (reuse), new `scripts/catalogue/export-import.mjs`, `scripts/catalogue/team-registrations.json`, new `supabase/catalogue/bsd-2026-27.import.json` (private) | ⛔ live BSD reads (about 562 GETs). Fixed UUIDs; diff vs fixture. |
| ~~A2 Alias review~~ | — | Dropped (test data). |
| A3 Migrations (local) | see the migration list below | Tested on PGlite + Supabase Local. |
| A4 Build switch + Supabase transport | `scripts/backend-build.mjs`, `scripts/build-backend.mjs`, `src/backend-entry.js`, `src/lib/catalogue-source.js`, `src/lib/page-bootstrap.js` | Local client only on loopback; production uses the SDK client. |
| A5 Overrides | `src/lib/player-overrides.js` | `internalOnly` in canonical production; read-only fallback for legacy keys of resolved players. |
| A6 Legacy draft guard | `dist/app.js` (draft restore) | Canonical mode skips restoring drafts with non-UUID `athleteId`s; storage is left unchanged. |
| A7 matches canonical | `supabase/functions/matches/handler.js`, `provider.js`, `teams.js`, new `catalogue.js` in the function (port of `canonicalMatch`/`defaults`) | Service key only inside the function. |
| A8 Sharing in canonical mode | `src/backend-entry.js`, `src/lib/sharing-ui.js` | Validate UUID payloads end-to-end against local `lineups`. |
| A9 Credits/fallback | `dist/studyo.html`, `dist/mac.html`, `dist/mac-studyosu.html`, `dist/app.js:138`, `src/lib/onboarding-showcase.js`, `scripts/serve-local.cjs` (now redundant rewrite) | ⛔ move `dist/rosters.js` out of `dist/`. |
| A10 Hosted sync tool | new `scripts/catalogue/sync-hosted.mjs` | Dry-run default; project-ref guard; counts only. |
| A11 Verification tooling | `scripts/verify-live-backend.mjs` | Authenticated catalogue count 18/543±; anonymous read denied on `catalogue_*` and (after M6) `teams/players`. |

**Proposed migrations** (none written yet; ⛔ each is approved before creation):

| # | Name (proposed) | Type | Content |
| --- | --- | --- | --- |
| — | `20260925035438_catalogue_identity_foundation` | existing, unapplied | Tables, server-only mappings and aliases |
| M1 | `…_catalogue_read_authenticated_only` | additive | Revoke `anon` SELECT on `catalogue_teams/players`; policies to `authenticated` |
| M2 | `…_player_override_internal_keys` | constraint | Production version of `catalogue_override_keys.sql` |
| M3 | `…_catalogue_sync_rpc` | function | `tactics_private.apply_catalogue_sync(jsonb)` (service_role only, single transaction, no deletes, no mapping reassignment, complete-scope guard) + `tactics_private.catalogue_sync_runs` audit table |
| ~~M4~~ | — | — | Dropped: no legacy resolver needed (records are test data) |
| M5 | `…_seed_catalogue_players` | data | Initial import (543±, fixed UUIDs, provider mappings, no aliases) through the M3 function |
| SEC1 | `20260924200000_legacy_catalogue_no_anon_read` | grants | **Written and tested locally.** Revoke `anon` SELECT on `public.teams/players`. Separate from this plan. |
| M6 | `…_legacy_catalogue_revoke_signed_in_read` | grants | After cutover, revoke `authenticated` SELECT on `public.teams/players` (reversible) |
| ~~M7~~ | — | — | Dropped: no override copy |

**Required tests:**
- **Import and sync:** import idempotent with identical UUIDs; repeat sync is a no-op; lifecycle rules (inactive, returning, new); mapping reassignment refused; incomplete scope aborts.
- **Access control (RLS):** anon denied on all catalogue and alias tables; authenticated reads only active rows; alias/mapping tables never client-readable.
- **Overrides:** internal key accepted; legacy keys still loaded; the copy keeps originals.
- **Classic drafts:** in canonical mode a legacy-ID draft is not restored, storage is unchanged, and no bench duplicates appear.
- **Projects:** the production-shaped legacy project fixture (2 free projects, 30 unresolved) opens unchanged; no catalogue query is needed to render it.
- **Weekly XI:** end-to-end save on canonical.
- **Matches:** `canonicalModel` / `defaults` from the Edge handler with mocked BSD; unknown player falls back without fabricating anyone.
- **Sharing:** creates a share with UUID payloads; the share viewer works without the catalogue.
- **Production bundle:** contains no `rosters.js` reference, FotMob/TFF credit, `faces/` or secret.
- **Full suite:** `npm test`, the board regression, `npm run build`, `git diff --check`.

### Phase B — backup and staging

| Step | Action |
| --- | --- |
| B1 | ⛔ Logical dump of the hosted schema + data, stored outside the repo. Confirm PITR/backups in the Dashboard. Record the Netlify deploy ID. |
| B2 | ⛔ Optional but recommended: a Supabase branch or second project as staging. Apply all migrations, run the sync and a full UI smoke test with test accounts. |

### Phase C — production (password protection stays on; maintenance window)

| Step | Action |
| --- | --- |
| C1 | ⛔ Apply the PROD1 queue in order (`20260925035438` … `20261014150000`). |
| C2 | ⛔ Apply M1, M2, M3. |
| C3 | ⛔ M5 import (or `sync-hosted --apply`). Verify read-only: 18 teams, expected player count, 0 duplicate mappings. |
| C4 | — (dropped) |
| C5 | ⛔ Deploy `lineups`, `account-delete`, and `matches` (canonical) only once the licence conditions are met. Without `matches`, Match Studio, match mode and Weekly XI week detection show the controlled unavailable state. |
| C6 | ⛔ Deploy the frontend built with `CATALOGUE_SOURCE=canonical`. Verify the bundle hash. |
| C7 | ⛔ Smoke tests with disposable accounts: Classic, Comparison, Free Studio, opening the 2 historical projects, override set/reset, Weekly XI save, share create/view, onboarding/favourite, Match Studio. |
| C8 | ⛔ M6 (revoke signed-in legacy read) after 24–48 h of observation. SEC1 (anonymous read) is applied separately and earlier. |

### Phase D — later cleanup (separate approval)

Archive or drop `public.teams/players`, the alias tables if unused, the legacy adapter in `catalogue.js`/`app.js`, `seed.sql` legacy data and the legacy tests. This follows D4's "Future cleanup plan" and never cascades into user data.

### Rollback

| Layer | Method |
| --- | --- |
| Frontend | Rebuild **the same commit** with `CATALOGUE_SOURCE=legacy` (legacy tables are untouched until M6/D). Do not roll back to a pre-D3 deploy: it rejects `internal:` override keys and fails to load overrides ([player-overrides.js:45](src/lib/player-overrides.js#L45)). |
| Database | M1–M5 are additive, so leave them in place. M6 is reversed by re-granting. Data created after cutover (UUID projects, internal overrides, Weekly XI) stays readable because snapshots are embedded. |
| Import | Re-running is a no-op. A bad import is corrected with a fix-forward sync (inactivate), never by deleting mapped players. |
| Restore | Use the B1 dump only for catastrophic cases. It would lose post-cutover user work. |

## 10. Decisions required before implementation

1. **D-1 Licence:** lawyer sign-off on BSD for catalogue + matches, and whether to take the Unlimited plan. Optionally, written provider confirmation that authenticated in-app display of the stored catalogue is acceptable.
2. ~~D-2 Existing records~~ **Resolved:** test data. Use the simplified strategy (section 4).
3. ~~D-3 Alias review~~ **Not needed** for launch.
4. **D-4 Sync method:** operator script (recommended) vs an Edge/cron job; and the update cadence.
5. **D-5 Staging:** use a Supabase branch/staging project (cost) or go straight to the maintenance window.
6. **D-6 Public files:** move `dist/rosters.js` out of `dist/`; neutral credit wording.
7. **D-7 Anonymous legacy read:** handled by SEC1, separately. It still needs ⛔ approval to apply in production.
8. **D-8 Matches timing:** cut over the catalogue first and keep `matches` undeployed until licensing clears (Match Studio/Weekly XI week detection degraded), or ship both together.
