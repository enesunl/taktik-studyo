# Local Supabase development — DEV1

Local development now uses **Supabase Local for Auth, profiles, RLS and onboarding**. The sports catalogue still uses the existing local canonical PGlite source. The normal production build remains configured for the existing hosted project. No hosted configuration, data, migration history or CLI link was changed.

## Audit and bootstrap

- The repository already had `supabase/config.toml`; no `supabase init` was needed. Its Auth service was disabled before DEV1.
- Docker Desktop 4.91.0 / Docker 29.8.0 was running with Linux containers. The installed, pinned Supabase CLI is 2.117.0.
- Previously the local server loaded `.env` and reused the production browser bundle. A localhost address therefore did not imply local Auth.
- The old local database had three historical migration versions (`20260913062133`, `20260918142336`, `20260918142348`) and zero Auth users, profiles and shared lineups. It contained no user content to preserve.
- All seven current migrations passed a fresh-start SQL test, with only Supabase's Auth prerequisites supplied. No application tables were manually patched into existence. The initial football migration supplies the private helpers; profile ownership precedes onboarding; O1.1 has no canonical catalogue FK or lookup dependency.
- The local stack was stopped with backups enabled, restarted, and reset using **`db reset --local --no-seed`**. The CLI reported target `local`. All seven repository migrations applied successfully:

```text
20260913063249_football_backend
20260920094922_catalogue_authenticated_read
20260920102243_profiles_ownership
20260923135716_studio_projects
20260924094207_player_overrides
20260925035438_catalogue_identity_foundation
20261004234326_profile_onboarding_foundation
```

Seed execution is disabled. The legacy `seed.sql` is not run. The historical catalogue migration creates its schema locally, but the running canonical catalogue transport uses the separate existing PGlite source; onboarding profiles do not require it in the Auth database.

## Start development

Run from `taktik-studyo-source`, with Docker Desktop running:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
.\node_modules\.bin\supabase.cmd start
npm run dev
```

Open **http://localhost:4173**. `node scripts/serve-local.cjs 4173` is equivalent to `npm run dev`. For shutdown, stop the frontend with Ctrl+C and optionally run:

```powershell
.\node_modules\.bin\supabase.cmd stop --project-id taktik-studyo
```

Do not reset on every start. To intentionally discard and rebuild this project's **local** database only:

```powershell
.\node_modules\.bin\supabase.cmd db reset --local --no-seed
```

That command deletes local user/project data. Never replace `--local` with a linked/remote target. DEV1 does not require `db push`, `link` or remote migration commands.

## Configuration and isolation

| Service | Verified local address |
| --- | --- |
| Frontend / Auth Site URL | `http://localhost:4173` |
| Supabase API | `http://127.0.0.1:54321` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Mailpit email capture | `http://127.0.0.1:54324` |

`scripts/local-supabase.mjs` reads the installed CLI's local JSON status privately and selects only its API URL and public key. The current stack reports a publishable key; legacy **anon** JWTs are also supported. Service-role credentials are rejected and never included in the browser configuration or printed. Values are not copied into a tracked file.

The local server checks Auth health before listening. Missing/stopped local Supabase is an error, with instructions to start it; there is no hosted fallback. Explicit hosted `SUPABASE_URL` environment configuration is rejected before any network call. Overrides must match the CLI-reported local values. HTTP requests are restricted to the expected loopback Host.

The server builds `/backend.js` **in memory** with this local public configuration, using the normal Supabase client. It does not edit `dist/backend.js`. Encoded asset paths also resolve to that local bundle. There is no fake-auth runtime or Auth bypass.

`scripts/serve-local.cjs` deliberately does **not** load `.env`. Optional local server settings belong in the already-ignored `.env.local` (for example `CATALOGUE_SOURCE=canonical` or a server-only `BSD_API_TOKEN`). Canonical is the default. No key copying is needed for local Auth. Do not add hosted Supabase overrides to this file or the process environment.

`npm run build` still reads the existing production `.env` and generates the production `dist/backend.js`. It is not a local Auth build command. The local server serves its own in-memory bundle, so running the production build does not switch the local frontend to production.

Canonical catalogue queries and local matches authorization use the new local user's normal access token, verified against local Auth. Existing canonical/PGlite data is not reset or migrated by DEV1. Old hosted users are not copied into local Auth; create new local users for testing. Sharing Edge deployment and external provider configuration are outside DEV1; local Edge runtime is disabled.

## Auth and email

Exact local redirect allowlist:

- `http://localhost:4173/auth-callback.html`
- `http://localhost:4173/sifre-yenile.html`

Login: `/giris.html`; signup: `/kayit.html`. Use `localhost:4173` in the browser to match the application's existing exact redirect allowlist.

Email confirmation is enabled. The local templates use the existing application contracts:

```text
confirmation: {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email
recovery:     {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

HTML templates escape the `&` as `&amp;`. Local mail is captured by Mailpit; no external SMTP configuration or real outbound email is required. CLI 2.117.0 accepts the configured `[inbucket]` section but emits a deprecation warning in favor of `[local_smtp]`; the running capture service is Mailpit at the verified address above.

1. Register a new local test account, for example with a `.test` address, at `/kayit.html`.
2. Open Mailpit and inspect the confirmation email.
3. Open its link in the same local application's `/auth-callback.html` page and explicitly confirm using the existing UI.
4. The callback retains the existing token sanitization and Auth checks. First protected navigation should route the incomplete local profile to `/hos-geldin` (or its `.html` alias).

Password recovery uses the separate existing reset page and its user-submitted verification flow; loading the link must not automatically consume the recovery token. No production email template, SMTP, CAPTCHA or Auth setting was changed.

## Schema verified on the actual local Postgres

- `profiles.favorite_team_slug`: nullable, default NULL.
- `profiles.onboarding_completed_at`: nullable, default NULL.
- `profiles.onboarding_version`: NOT NULL, default `0`.
- The profile's only foreign-key target is `auth.users`; there is no FK to `catalogue_teams`.
- RLS is enabled on `profiles`, `shared_lineups`, `studio_projects` and `player_overrides`.
- The post-bootstrap local Auth user count was zero. No local test users were created by DEV1 verification.

## Manual O2 acceptance checklist — not yet executed

The following are expected outcomes, **not a claim of a completed browser test**. Create users after the migration exists; existing profiles are deliberately backfilled as completed by O1.

**New account A:** before completion, read the owner's profile locally and confirm `favorite_team_slug=NULL`, `onboarding_completed_at=NULL`, `onboarding_version=0`. Confirm email, enter a protected page, and verify welcome onboarding appears. Progress through Welcome → Tactical Board → Matches → Saved Work → Favorite Team. Select Galatasaray and complete. Confirm `favorite_team_slug='galatasaray'`, non-null completion timestamp, version `1`. Logout/login must now reach the normal destination without onboarding.

**New account B:** confirm email, enter onboarding, choose **Atla**. Confirm null favorite team, non-null completion timestamp, version `1`. Logout/login must not show onboarding again.

Also exercise the five steps with keyboard, the team picker, back/forward, and desktop/narrow light/dark layouts. No O2 visual design was changed by DEV1.

## Verification

- `npm test`: **588 passing, 0 failing**, including local safety/configuration tests, all seven migrations from zero, existing local SQL/RLS tests, and O1/O2 lifecycle tests.
- Board regression (part of `npm test`): **9 passing groups**.
- `npm run build`: passed; `dist/backend.js` was generated by the production build only. `git diff --check`: passed (line-ending conversion notices only).
- Actual local checks: Auth health and email settings, Postgres schema/RLS, frontend route responses, local bundle API target, and unchanged production bundle target on disk.
- Manual registration/email/onboarding/Skip browser flow: **not executed**; checklist above remains required before declaring O2 runtime acceptance.

Official references: [local CLI development and telemetry opt-out](https://supabase.com/docs/guides/local-development/cli/getting-started), [local email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates), [local configuration](https://supabase.com/docs/guides/local-development/cli/config).

## DEV1.1 runtime repair

The first real catalogue request exposed a missing-parent defect: `.local` did not exist, while PGlite's NodeFS creates only its leaf directory. `openCatalogueDatabase` now recursively ensures filesystem directories before constructing PGlite. Memory/browser storage modes remain unchanged. Existing databases are neither removed nor reset.

Protected-page handling now distinguishes `page_error` after successful identity verification from the existing Auth `error`. Catalogue/mount failure displays “Sayfa verileri şu anda yüklenemedi. Tekrar dene.” and retains retry; it does not sign out the user or change Auth validation.

DEV1.1 verification: **593 tests pass**, including real temporary-disk bootstrap/reopen preservation, real loopback HTTP through the canonical team reader returning **200 / 18 active teams**, separate mount-failure and Auth-failure tests, and the existing onboarding/profile regressions. All **9 board regression groups**, `npm run build` and `git diff --check` pass. The HTTP integration substitutes only Auth verification at the test boundary; it is not a claim of a successful browser test with the existing local user.

Live follow-up: Docker Local Auth is healthy again and `/studyo` returns 200. A second filesystem issue was found in the actual OneDrive workspace: catalogue directories had the Windows read-only attribute (Node reported mode `0444`), preventing PGlite from removing/creating `postmaster.pid`. With the local server stopped, the stale PID file was preserved as `.local/catalogue-d4-postmaster-20261005-backup.pid`, and only the local catalogue directories' read-only attributes were cleared. No database data was deleted or reset. The same persistent catalogue then opened successfully with **18 active teams** and closed normally.

The restarted running server's unauthenticated `POST /__local/catalogue` now returns the expected **401 / auth_unavailable**, not a bootstrap 503. Authenticated 200 was verified in the isolated HTTP integration test; browser verification with the existing local user's session is still pending. Do not infer successful browser Auth from the unauthenticated check. If OneDrive reapplies directory attributes, diagnose that separately; the repair does not install a permission-changing startup hook.

The existing local profile was rechecked read-only and remains completed at version 1 with its original completion timestamp and null favorite team. A new local account is required for a fresh manual five-step onboarding test; do not clear the completed existing user's profile.
