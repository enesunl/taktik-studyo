# PROD1 — Production readiness audit and release plan (updated PROD1.1, 15 Oct 2026)

**Audit and preparation only.** No commit, push, deployment, hosted migration, Edge Function deploy,
production account action or hosted change was made. Production was inspected read-only:
- Supabase connector metadata, aggregate counts, the public team catalogue, policies/grants, the
  deployed function source and advisors;
- public HTTP/TLS/DNS;
- `scripts/verify-live-backend.mjs --pre-release` (read-only).

Decisions recorded on 15 Oct 2026:
- Maçlar stays in the MVP and its licensing will be resolved first.
- The 8 legacy share links are disposable test data.
- No production release is authorised yet.

## PROD1.6 preflight (15 Oct 2026, local only; nothing pushed, deployed or written to hosted)

### Netlify (from the operator-verified settings; values not visible here)

| Item | Finding |
| --- | --- |
| Publish path | Base `taktik-studyo-source` + publish `dist` shows as `taktik-studyo-source/dist`: **correct**. `_redirects` lives in `dist/`; there is no `netlify.toml`. |
| Build | `npm run build` regenerates `dist/backend.js` from `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `TURNSTILE_SITE_KEY`. `AUTH_TURNSTILE_SITE_KEY` and `CATALOGUE_SOURCE` must stay **unset** (Auth CAPTCHA off; canonical default). |
| New guard | A Netlify build (`NETLIFY=true`) now **fails** if any of the three public values is missing in its deploy context, instead of publishing an unconfigured site (`tests/netlify-build.test.mjs`). |
| `NODE_VERSION` | Must be **≥ 22** (`package.json` engines). The value is not visible here; operator to confirm. |
| `SECRETS_SCAN_OMIT_KEYS` | Should list only the three public build values that intentionally appear in `backend.js`. Netlify must hold **no** secret: the BSD token, Turnstile secret and Supabase secret keys belong in Supabase Edge secrets. Operator to confirm the value. The scopes Functions/Runtime are unnecessary (no Netlify Functions) but harmless for public values. |
| Deploy contexts | Previews and branch deploys build with **production** Supabase values, so a preview can create real production accounts and shares. Until launch: disable deploy previews and branch deploys, or confirm the site password covers every deploy URL. |
| **Push = publish** | Auto-publishing builds and publishes `release/netlify-migration`. The local branch is the BSD-only frontend; published before the hosted import, every roster page would show "Takım kataloğu şu anda yüklenemedi". **Before any push:** Netlify › Deploys › *Stop auto publishing* (deploy lock), or push only at release step 6. |

### Verified locally in PROD1.6

| Area | Result |
| --- | --- |
| Edge Runtime (supabase-edge-runtime 1.74.3, Deno 2.1.4): `matches`, `lineups`, `account-delete` | All three boot (the shared `src/lib` imports resolve under Deno). Checks: no session → 401; foreign origin → 403; `matches` without `BSD_API_TOKEN` → controlled 502/503; anonymous or unconfirmed share POST → 401; unverifiable Turnstile token → 403 (action and hostname enforced); public share GET works; account deletion (wrong phrase 400, wrong password 403, extra field 400, success 200) removes profile, projects, overrides, Weekly XI and the owned share (link 404, login refused). **24/24 behaviour checks.** |
| Edge Runtime limits | The local Kong gateway answers CORS preflights itself (`*`), so the functions' own preflight logic is verified only by unit tests; check hosted preflights with `verify-live-backend.mjs` after deploy. A successful Turnstile share needs a real browser with the production site key (post-deploy smoke test). |
| Live BSD (token from the shell, read-only GETs) | The first live run was refused: one live name had a trailing space (`invalid_catalogue`). Fixed: provider names are space-normalized; control characters still abort (test added). Dry run: 635 live players vs 543 in the 24 Sep fixture (108 new, 16 to deactivate, 70 position, 9 number, 1 name changes), 25 duplicate shirt numbers, 15 position conflicts (warnings). **Applied to Supabase Local only:** run 5, 635 active, all 652 mappings deterministic, no existing UUID changed. The frontend reader loads 18/635 with a valid XI for every team. |
| Database | Anonymous access to `catalogue_*`, mappings and legacy tables → 401. Pending order: 12 migrations (`tests/migration-order.test.mjs`; restore rehearsal PROD2.1, 16 Oct 2026). The 8 test share links are removed only by `20261014150000` during the approved rollout. |

### Operator setup for the hosted import (step 4 below)

1. Use a machine with this repo and Node 22. **Do not** put keys in files.
2. In the shell only:
   - `SUPABASE_URL=https://zwhoailuklwtxaaawfaq.supabase.co`
   - `CATALOGUE_IMPORT_SECRET_KEY=<Supabase secret key>`
   - `BSD_API_TOKEN=<BSD token>`
3. Dry run: `node scripts/catalogue/import.mjs --target hosted --fetch-bsd`. The first hosted run expects 18 teams, about 635 new players and 0 deactivations.
4. ⛔ Apply: `… --fetch-bsd --backup <path outside repo> --apply --confirm zwhoailuklwtxaaawfaq`. The tool re-reads and verifies after writing.
5. Keep the backup file private: it contains provider data. Clear the shell variables afterwards.

### Safe release order (supersedes the PROD1.5 order where they differ)

0. ⛔ Netlify: stop auto publishing (deploy lock); restrict or disable previews and branch deploys; confirm `NODE_VERSION`, `SECRETS_SCAN_OMIT_KEYS` and that no secrets are in Netlify.
1. ⛔ Commit; then ⛔ push. The build runs but is **not** published while the lock is on. Check that the build log ends with `Backend adapter built: configured; catalogue canonical`.
2. ⛔ Backup: hosted schema and data dump outside the repo; confirm the backup/PITR plan; record the Netlify deploy ID.
3. ⛔ Database: the 12 migrations in order (`db push --dry-run` must list exactly them). This includes the approved removal of the 8 test links (#8).
4. ⛔ Hosted catalogue import (setup above); verify 18 teams and about 635 players signed-in, and anonymous 401.
5. ⛔ Edge: `lineups` immediately after step 3; then `account-delete`; then `matches` with `BSD_API_TOKEN` (licence cleared). Supabase secrets: `TURNSTILE_SECRET_KEY`, `BSD_API_TOKEN`.
6. ⛔ Netlify: publish the locked build. Verify the `/backend.js` hash and that `/rosters.js` is 404. The password stays on.
7. ⛔ Smoke tests with disposable accounts, including a real Turnstile share and an account deletion. Run `verify-live-backend.mjs` (strict mode). Then ⛔ remove the password (after legal sign-off, `MVP_LEGAL_FINAL_CHECKLIST.md`).

**Recovery:** see the PROD1.5 table below.
- Catalogue: restore from the import backup.
- `matches`: `MATCHES_CATALOGUE=legacy` or redeploy the previous version (match pages unavailable).
- Frontend: before launch, fix forward behind the password. Rolling back to the old deploy restores FotMob data, and its share POST no longer works after step 3.
- Database: additive; fix forward; dump/PITR as a last resort.

## PROD1.5 update — BSD catalogue first (15 Oct 2026, tested locally only)

This section **supersedes** the migration row in section 2, steps C–E of section 5 and section 6.

The new frontend is a BSD-only build (SEC1.1). It must not go live before the hosted BSD catalogue is imported and verified. Production was not touched.

### Pending production migrations — exact order (verified by `tests/migration-order.test.mjs`)

| # | Migration | Depends on | Effect on existing rows |
| --- | --- | --- | --- |
| 1 | `20260924200000_legacy_catalogue_no_anon_read` (SEC1) | applied 5 | none (revokes anon SELECT on legacy teams/players) |
| 2 | `20260925035438_catalogue_identity_foundation` | — | none (new empty tables) |
| 3 | `20260925040000_catalogue_no_anon_read` (SEC1.1) | 2 | none (catalogue signed-in only) |
| 4 | `20261004234326_profile_onboarding_foundation` | profiles | none (new columns) |
| 5 | `20261013165455_weekly_lineups` | profiles | none (new table) |
| 6 | `20261014074114_weekly_snapshot_validation` | 5 | none |
| 7 | `20261014140000_seed_catalogue_teams` | 2 | inserts 18 teams (aborts on mismatch) |
| 8 | `20261014150000_shared_lineup_owner` | lineups RPC | **deletes all ownerless share links (the 8 test links)** |
| 9 | `20261015120000_player_override_internal_keys` (PROD1.5) | player_overrides | none (widens the key check) |
| 10 | `20261015120100_catalogue_sync` (PROD1.5) | 2 (explicit guard) | none (adds sync function + audit table) |
| 11 | `20261015190000_account_limits` (SEC2.2/2.3) | 5, 8 | none (limits, profile gate, owner share bucket) |
| 12 | `20261015200000_terms_acceptance` (SEC2.3) | profiles | none (new nullable columns; no backfill) |

- Wrong orders fail loudly; this is tested.
- Every migration except #8 leaves existing projects, overrides, shares, profiles and the legacy catalogue untouched; this is tested.
- **#8 conflicts with "do not delete the 8 share links"** (decision P5-1 below).
- `supabase db push` applies all twelve in one run.

### Release order (⛔ = explicit approval)

1. **Prepare.**
   - ⛔ Commit and push.
   - Decide P5-1.
   - Keep Netlify password protection **on** until step 7.
2. **Back up.**
   - ⛔ Dump the hosted schema and data outside the repo; confirm PITR.
   - Record the Netlify deploy ID and the `lineups` v7 reference (= repo `c16751c`).
   - `supabase db push --linked --dry-run` must list exactly the 12 migrations above.
3. **Database.** ⛔ Apply the 12 migrations. Read-only checks:
   - `catalogue_teams` = 18, `catalogue_players` = 0;
   - anon gets 401 on `teams`, `players` and `catalogue_*`.
4. **Catalogue import** (operator machine; secret key in the shell only):
   - `CATALOGUE_IMPORT_SECRET_KEY=… SUPABASE_URL=https://zwhoailuklwtxaaawfaq.supabase.co`
   - `node scripts/catalogue/import.mjs --target hosted --fetch-bsd` (dry run, about 562 BSD GETs, reads only).
   - Review the report: counts, duplicate numbers, deactivations.
   - ⛔ `… --fetch-bsd --backup <path outside repo> --apply --confirm zwhoailuklwtxaaawfaq`. The tool re-reads and verifies after applying.
   - `node scripts/verify-live-backend.mjs --pre-release` with a disposable `LIVE_TEST_ACCESS_TOKEN`: signed-in `catalogue_teams` = 18.
5. **Edge Functions.**
   - ⛔ `lineups` immediately after step 3 (#8 removes the 2-argument RPC).
   - ⛔ `account-delete`.
   - ⛔ `matches`, only after the licence conditions are met (`BSD_API_TOKEN`). It reads the catalogue with the injected server key.
   - Without `matches`, boards, Studio, Weekly XI saving and onboarding still work; match pages show their unavailable state.
6. **Frontend.**
   - ⛔ Deploy the default (canonical) build only after step 4 has verified 18/543.
   - Check that the deployed `/backend.js` hash matches the local build and that `/rosters.js` returns 404.
   - Password protection stays on.
7. **Smoke test, then launch.**
   - ⛔ Run the section 5F smoke tests.
   - ⛔ Remove the password only when they pass.

### Recovery (tested; does not use the legacy rollback build)

| Problem | Recovery | Evidence |
| --- | --- | --- |
| Bad catalogue update | Re-run the import with `--input <pre-apply backup>` (`--allow-deactivations` as reported). Mapped players keep their UUIDs, bad rows become inactive (never deleted), and the tool verifies afterwards. | Local drill on Supabase Local: bad update applied (rename, 2 removals, 1 bogus signing), then restored. The active catalogue equals the pre-incident backup; the bogus row stays inactive. Also `tests/catalogue-import.test.mjs`. |
| Import interrupted or concurrent | One transaction; a stale plan is refused (`stale_plan`); conflicts abort with nothing written. | `tests/catalogue-import.test.mjs` |
| Catalogue tables unreachable | Explicit "Takım kataloğu şu anda yüklenemedi" after the client's retries (about 7 s); no fallback data. | Browser run (Supabase transport, catalogue requests blocked) |
| `matches` problem | Redeploy the previous `matches` version, or set `MATCHES_CATALOGUE=legacy`. Match pages then show their unavailable state; the rest of the app is unaffected. | `tests/matches-canonical-handler.test.mjs` |
| Frontend defect **before** launch | Password still on: fix forward and redeploy. Do **not** restore the old FotMob deploy. | — |
| Frontend defect **after** launch | Netlify rollback only to an earlier **canonical** deploy, or a maintenance page. The pre-cutover deploy still ships `rosters.js` (FotMob) and must not be republished. | — |
| Schema problem | Every migration is additive (except #8); fix forward. PITR or dump restore as a last resort (it loses later user work). Restore only with the sequence below. | PROD2.2: restored copy identical to production (grants, RLS, policies, data); after the 12 migrations identical to the migration-built reference. |

**Dump restore sequence (PROD2.2, tested on a fresh Supabase stack with production versions).**

Root cause it fixes: `schema.sql` recreates the tables, so the restoring role's default privileges grant ALL to `anon`/`authenticated`/`service_role`; the dump only adds GRANTs, never REVOKEs. The dump re-creates the `postgres` defaults at its end.

Run each step only if the previous one succeeded; each is one transaction with `ON_ERROR_STOP`. `roles.sql` alters the reserved `supabase_admin` role and therefore needs a superuser:

```sh
PSQL='psql --single-transaction -v ON_ERROR_STOP=1'
$PSQL -U supabase_admin -f roles.sql \
&& $PSQL -U postgres \
  -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM postgres, anon, authenticated, service_role' \
  -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM postgres, anon, authenticated, service_role' \
  -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM postgres, anon, authenticated, service_role' \
  -f schema.sql -c 'SET session_replication_role = replica' -f data.sql \
&& $PSQL -U postgres -f history_schema.sql -f history_data.sql
```

Then apply pending migrations with the CLI against the restored database only.

### New decisions

- **P5-1:** migration #8 deletes the 8 legacy (test) share links. Options:
  - (a) approve the deletion, as decided in ACCOUNT1;
  - (b) a reviewed replacement migration that keeps ownerless links readable with `owner_id` nullable;
  - (c) export them first and accept the deletion.
- **P5-2:** BSD API token or licence for the live `--fetch-bsd` import. The frozen fixture is from 24 Sep 2026; a fresh pull is required.

## 1. Current production state

| Area | Verified state |
| --- | --- |
| Git | Local `release/netlify-migration` at `35e90ab` + uncommitted PROD1.1 changes; **19 commits ahead** of `origin` (remote at `5a32a19`). |
| Netlify | `taktikstudyo.com` is served by Netlify. **Site password protection is on (401).** `www`/http → apex 301; HSTS set. TLS: Let's Encrypt, apex + www, valid until 19 Dec 2026. Dashboard settings are not verifiable from here (section 4). |
| Supabase | `eu-central-1`, Postgres 17, healthy. **5 of 17** repo migrations applied (12 pending). |
| Edge Functions | `lineups` **v7** = repo `c16751c` (anonymous POST, 2-argument RPC, sharing live with Turnstile configured). `matches` and `account-delete` absent (404). |
| Data (counts only) | 2 Auth users (1 confirmed, 1 without profile); 1 profile; 2 projects; 2 overrides; 8 disposable share links; legacy catalogue 18 teams / 539 players; no `catalogue_teams` table. |
| Security | RLS on every public table; grants as designed. Advisors: INFO no-policy on server-only tables (intended); **WARN leaked-password protection disabled**. |
| Email | Contact: Google Workspace (MX `smtp.google.com`, SPF Google, DMARC `p=none`); send/receive confirmed by the operator. Auth sender DNS: Resend-style DKIM + `send.` subdomain. Supabase Auth SMTP/templates/URLs are **not readable here**. |
| Live check | `node scripts/verify-live-backend.mjs --pre-release`: **11 passed, 0 failed, 6 not run** (release pieces absent). |

## 2. Local vs production differences

| Component | Local | Production |
| --- | --- | --- |
| Migrations missing in production (apply order) | `20260925035438_catalogue_identity_foundation`, `20261004234326_profile_onboarding_foundation`, `20261013165455_weekly_lineups`, `20261014074114_weekly_snapshot_validation`, **`20261014140000_seed_catalogue_teams` (new)**, `20261014150000_shared_lineup_owner` | — |
| `lineups` | JWT-owned shares, 3-arg RPC | v7 anonymous, 2-arg RPC |
| `account-delete` | Implemented | Absent |
| `matches` | Implemented; now also returns `canonicalId` | Absent; **blocked on licensing** |
| Frontend | `35e90ab` + PROD1.1 favourite fix | Unknown deploy (password-protected) |

## 3. Blockers and their status

| # | Blocker | Status after PROD1.1 |
| --- | --- | --- |
| 1 | Empty `catalogue_teams` in production (favourite team unusable) | **Resolved locally.** Root cause: the identity migration creates empty tables, and the canonical sync writes to PGlite only. New idempotent, deterministic seed `20261014140000_seed_catalogue_teams.sql` (18 teams from the reviewed registry; values identical to hosted `public.teams`). It inserts missing rows only, aborts on any differing row, and touches no user data. Tested on PGlite and applied to Supabase Local (0 → 18; profiles/favourites unchanged; re-run is a no-op). |
| 2 | Maçlar licensing | **Open.** See `MATCHES_RELEASE_REVIEW.md`: display permitted by licence v4.0; release conditions listed (lawyer sign-off, Unlimited plan recommended, optional written provider confirmation, `BSD_API_TOKEN` as Edge secret). |
| 3 | Favourite match promotion broken in production (legacy `teamId` vs canonical slug) | **Fixed locally:** `matches` returns `canonicalId`; `promoteFavoriteMatch` accepts `teamId` or `canonicalId`. Requires deploying the `matches` function **and** the frontend. |
| 4 | Supabase Auth configuration unverified | Open, manual check (section 4). |
| 5 | Netlify configuration unverified | Open, manual check (section 4). |
| 6 | Share RPC switch | Planned maintenance window (section 5, steps C–E). |
| 7 | Legal drafts (39 markers, Google Workspace processor, sports-data source, lawyer approval) | Open. |
| 8 | Live verification script outdated | **Resolved:** rewritten for the authenticated-sharing architecture (section 7). |
| 9 | Legacy FotMob-sourced roster data (`public.players`, `dist/rosters.js`) | **New open question:** licence not reviewed (`MATCHES_RELEASE_REVIEW.md` §4.6). |

## 4. Manual verification checklists (no dashboard access from here)

**Netlify** (change nothing; record values):
1. Site linked to `taktikstudyo.com`: which Git repo/branch (expected `release/netlify-migration` or a
   release branch), or manual deploys only.
2. Auto-publishing / branch deploys / deploy previews: on or off. Recommend **auto-publish off** until
   launch.
3. Build command and publish directory:
   - Expected: publish `dist`, with either **no build command** (the committed bundle is
     production-configured), or `npm run build` **with** `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
     `TURNSTILE_SITE_KEY` set. Public values only; never secret keys.
   - Without those variables a build produces an unconfigured bundle.
   - Node version ≥ 22 if building.
4. Environment variables: only the three public values (if building). No `SUPABASE_SECRET_*`,
   `BSD_API_TOKEN` or service-role key.
5. `_redirects` is honoured (`/lineup/*`, `/haftanin-ilk-11i`, `/hos-geldin`). Extensionless routes
   (`/maclar`, `/mac-studyosu`, `/studyo`, `/profil`, `/mac`, `/calismalarim`, `/ilk-11lerim`) rely on
   Netlify's `.html` resolution, so check them in the smoke test.
6. Password protection: on until launch. Note the current deploy ID for rollback.
7. No `netlify.toml` exists. Adding one would override UI settings on the next deploy, so it is
   deliberately not added without approval.

**Supabase Auth** (Dashboard):
1. Site URL `https://taktikstudyo.com`.
2. Redirect allowlist: `https://taktikstudyo.com/auth-callback.html` and `/sifre-yenile.html`.
3. Email confirmation on; minimum password 12 characters.
4. **Custom SMTP** sender and domain (Resend?): test confirmation and recovery delivery. Templates use
   the token-hash links (see `supabase/templates`).
5. **CAPTCHA off** for Auth (the bundle sends no Auth CAPTCHA token).
6. Enable leaked-password protection if the plan allows.
7. Edge secrets present: `TURNSTILE_SECRET_KEY` (confirmed via `X-Sharing-Ready`); `LINEUPS_RATE_SALT`
   (optional); `BSD_API_TOKEN` (only when matches is cleared).

## 5. Release order (⛔ = explicit approval before the step)

### A. Preparation (no production change)

1. ⛔ Commit the PROD1.1 changes locally; then ⛔ push `release/netlify-migration`.
2. Clear the `matches` licensing conditions (`MATCHES_RELEASE_REVIEW.md` §6), or explicitly defer the
   `matches` deploy.
3. Legal drafts: add Google Workspace (contact mail) and the sports-data source; keep draft notices and
   `noindex`.
4. Complete the section 4 checklists.

### B. Backup and pre-checks

1. ⛔ Logical backup of hosted schema + data (`supabase db dump --linked` schema and data-only), stored
   outside the repo. Confirm backup/PITR status in the Dashboard.
2. Record rollback references: Netlify deploy ID; `lineups` v7 = repo `c16751c`.
3. `supabase db push --linked --dry-run` must list **exactly** these 6 migrations, in this order:
   `20260925035438`, `20261004234326`, `20261013165455`, `20261014074114`, `20261014140000`,
   `20261014150000`.
4. Run `node scripts/verify-live-backend.mjs --pre-release` (read-only). Expect 0 failed.

### C. Database (password protection stays on; maintenance window)

1. ⛔ Apply `20260925035438` → `20261004234326` → `20261013165455` → `20261014074114` (additive).
2. ⛔ Apply `20261014140000_seed_catalogue_teams` (data). Verify with a read-only count: 18 active
   teams.
3. ⛔ **Destructive:** apply `20261014150000_shared_lineup_owner` (deletes the 8 disposable links,
   replaces the RPC). Proceed **immediately** to D1.
   - `db push` applies all six in one run, in this order. Approving the push therefore approves C1–C3
     together.

### D. Edge Functions

1. ⛔ Deploy `lineups` immediately after C3. Until then share POSTs fail; reads are unaffected.
2. ⛔ Deploy `account-delete` (`ACCOUNT_DELETE_ALLOWED_ORIGINS` unset; injected keys).
3. ⛔ Only after the licensing conditions are cleared: set `BSD_API_TOKEN`, then deploy `matches`.
   Without it, Maçlar, match detail, Maç Stüdyosu match mode and Weekly XI week detection show
   controlled "unavailable" states.

### E. Frontend

1. ⛔ Deploy the approved commit (publish `dist`). Verify that the deployed `/backend.js` SHA-256 equals
   the local build of that commit. Keep the password protection on.
   - The frontend requires D1 (authenticated sharing) and benefits from D3 (favourite match
     `canonicalId`). Deployed alone, its sharing works only after D1.

### F. Smoke tests (⛔ approval to create disposable production accounts)

1. Sign-up → confirmation email → `/auth-callback.html`; login; onboarding shows 18 teams; favourite
   saved.
2. Studio project save/delete; Weekly XI save; player override set/reset; extensionless routes load.
3. Share while logged in; open the link in a private window; sharing while logged out is refused.
4. Maçlar (if D3): fixtures load, favourite match promoted, detail opens, Studio from match works,
   attribution visible.
5. Password reset email.
6. Profile → Tehlikeli Bölge: wrong password rejected; deletion redirects Home; read-only counts show 0
   owned rows; the share link returns 404.
7. Legal pages (`noindex`), legal links, no Google Fonts requests.
8. `LIVE_TEST_ACCESS_TOKEN=<disposable JWT> node scripts/verify-live-backend.mjs` (strict, still writes
   nothing). ⛔ `--probe-writes` only if approved. Re-run the advisors.

### G. Public launch

1. ⛔ Lawyer-approved legal texts; fill the placeholders; remove draft notices/`noindex`; update the
   "not live" markers.
2. ⛔ Remove the Netlify password protection. Monitor Auth, function and email logs for 24–48 h.

## 6. Rollback and recovery

| Change | Reversibility / recovery |
| --- | --- |
| C1 schema | Additive and forward-only. Prefer fix-forward; a down-script would drop new tables/columns (data loss). |
| C2 seed | Reversible (`delete from catalogue_teams` where no profile references the slug); normally unnecessary. |
| C3 owner migration | **Irreversible data deletion** of the 8 disposable links. Restoring the old contract needs the 2-arg RPC re-created, `owner_id` dropped, links restored from the B1 dump and `lineups` v7 (`c16751c`) redeployed. |
| D functions | Redeployable. `lineups` v7 does **not** work after C3 (RPC gone). Previous `matches`/`account-delete`: none (just undeploy). |
| E frontend | Netlify instant rollback. The old frontend works with the new backend except share POST (no JWT → 401). |
| Account deletions | Irreversible by design. |

## 7. `scripts/verify-live-backend.mjs` (updated in PROD1.1)

- **Read-only by default:** only GET/OPTIONS, plus POSTs to Edge Functions that are rejected before any
  DB access. No password and no account-deletion phrase is ever sent.
- Refuses to run unless `SUPABASE_URL` is the project in `supabase/project.json`.
- **Modes:**
  - default: strict post-release expectations;
  - `--pre-release`: current production;
  - `--probe-writes`: anonymous write attempts that RLS/grants must reject, opt-in and approval
    required;
  - `LIVE_TEST_ACCESS_TOKEN`: authenticated checks that still write nothing (payload 400/413/415, bot
    403, account-delete wrong confirmation 400, matches season GET).
- **Checks the new contract:** login required for share POST, `authorization` CORS header,
  `catalogue_teams` = 18, legacy 2-arg RPC removed (404), `account-delete`/`matches` 401 without
  session.
- Unit-tested: `tests/verify-live-backend.test.mjs`.

## 8. Decisions requiring approval

1. Licensing: lawyer sign-off; Unlimited plan; optional written confirmation from Bzzoiro; then
   `BSD_API_TOKEN` + `matches` deploy.
2. Legacy FotMob-sourced roster data: review its licence, or plan a canonical-catalogue production
   cutover.
3. Maintenance-window rollout (recommended) vs a zero-downtime two-step migration (extra code).
4. Every ⛔ in section 5.
5. Auth settings (SMTP, leaked-password protection) and the Netlify settings in section 4.
6. Legal updates and lawyer review.
