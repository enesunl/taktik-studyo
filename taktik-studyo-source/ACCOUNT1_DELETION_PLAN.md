# ACCOUNT1 — Secure account deletion

Status (14 Oct 2026): **approved option A + purge legacy links; implemented and verified LOCALLY
only.** Nothing is deployed and the hosted database is unchanged. Hosted rollout needs separate
approval (section 7).

## 7. Implementation (local) and hosted rollout

Implemented:

- **Migration** `20261014150000_shared_lineup_owner.sql`
  - Deletes the legacy unowned links.
  - Adds `shared_lineups.owner_id NOT NULL REFERENCES auth.users ON DELETE CASCADE`.
  - Replaces the share RPC with `create_shared_lineup(payload, bucket, owner)`, executable by
    `service_role` only.
- **`lineups` function:** `POST` requires a confirmed user JWT (`getUser`); the owner comes only from
  that token. `GET` is unchanged and never returns the owner.
- **Share client:** sends the session JWT and refuses to share without a session.
- **`account-delete` function** (`verify_jwt = true`):
  - origin allowlist
  - `getUser(token)` → confirmed, non-anonymous user
  - body accepts only `{password, confirmation}`
  - server-side password re-check with a revoked one-off session
  - preflight count of every owned table
  - `auth.admin.deleteUser`
  - success only when all counts are 0
- **Profile → Hesap → Tehlikeli Bölge:**
  - modal listing what is and isn't deleted
  - password + `HESABIMI SIL` required
  - cancel/Escape sends nothing
  - success only after server confirmation, then guard stop, local sign-out, user-scoped key cleanup
    and redirect to `/`
- **Local Edge runtime enabled** in `supabase/config.toml`.

Verified:

- Unit and real-SQL tests: `tests/account-delete.test.mjs`.
- Local integration against Supabase Local, two disposable users:
  `node scripts/verify-account-delete-local.mjs`.
- Headless-browser end-to-end check (login → Profile → failed attempt → deletion → Home, cleanup
  checked).

Hosted rollout order (each step needs approval):

1. Apply pending migrations. Hosted is missing the onboarding, catalogue and weekly migrations, plus
   this one. Note that this migration deletes the 8 legacy links.
2. Deploy `lineups` immediately after, since the old 2-argument RPC no longer exists.
3. Deploy `account-delete` with `ACCOUNT_DELETE_ALLOWED_ORIGINS` unset (defaults to
   `https://taktikstudyo.com`).
4. Rebuild and deploy the site.
5. Smoke-test with a disposable production account.

## 1. Audit findings (verified 14 Oct 2026)

| Area | Finding |
| --- | --- |
| Profile UI | `profil.html` already has an account card, `#profileAccount` "Hesap", with edit, favourite team and logout. A "Tehlikeli Bölge" fits at the bottom of it. `studio-dialog.js` provides the existing accessible modal pattern. |
| Auth | supabase-js 2.116 provides `auth.admin.deleteUser(id)` (server-only, secret key) and `auth.reauthenticate()` (email OTP). The browser uses only the publishable key. |
| Server pattern | The `matches` function already verifies `Bearer` tokens server-side with `getUser(token)` and rejects anonymous or unconfirmed users. Handlers are plain JS with injected clients, so they can be unit tested. |
| Cascades (local, `pg_constraint`) | `profiles`, `studio_projects`, `player_overrides` and `weekly_lineups` reference `auth.users` with **ON DELETE CASCADE**. No other `public`/`tactics_private` table holds a user id. Storage is empty. |
| Cascades (hosted, read-only) | Same rules for the three tables that exist there. `weekly_lineups` is not deployed yet (schema drift). |
| **Share links** | `shared_lineups` has **no owner column**. `POST /functions/v1/lineups` sends only the publishable `apikey` and a Turnstile token, with **no user identity**. Rows hold team name, player names (including the user's custom names) and drawings, and are public by unguessable link. Hosted has 8 rows, none with `expires_at`. They **cannot be attributed to, or deleted with, an account.** |
| Sharing entry point | Only on `/studyo.html`, which is a protected (login-required) page. Every real sharer is therefore signed in, so attribution is feasible for future shares. |
| Browser data | User-scoped keys: `taktik:draft:<uid>:*`, `taktik:studio:autosave:<uid>:v1`, `taktik:studio:recovery:<uid>:*` (sessionStorage), `taktik:weekly-xi:<uid>:*`, plus the Auth session key. They exist only on the device where they were created. |
| Local Edge runtime | Disabled in `supabase/config.toml` (`[edge_runtime] enabled = false`). A local integration test of a real Edge Function needs it enabled (local-only config change). |

## 2. Proposed deletion architecture (no migration needed for this part)

**Edge Function `account-delete`** (`verify_jwt = true`, plain-JS handler like `matches`):

1. **Caller identity.** Require `Authorization: Bearer <access_token>`. Call `admin.auth.getUser(token)`.
   Reject missing, invalid or expired tokens, anonymous users and unconfirmed email. The **target id
   is always `user.id` from the verified token**. The body may contain only
   `{password, confirmation}`; any other field (for example `user_id`) returns 400.
2. **Recent verification.** Re-check the password server-side with a fresh, non-persisting
   publishable-key client: `signInWithPassword({email: user.email, password})`. The returned id must
   equal `user.id`. This needs no email delivery; the email-OTP alternative depends on the
   unverified mail setup.
3. **Typed confirmation.** The handler also requires `confirmation === 'HESABIMI SIL'`, so the check
   is not only client-side.
4. **Delete.** `admin.auth.deleteUser(user.id)` (hard delete). The cascades remove profile, projects,
   overrides and Weekly XI. Owned share links are covered by the decision in section 3.
5. **Verify, then report.** Re-count the user's rows in every owned table. Return `{deleted:true}` only
   when all counts are 0; otherwise return a 500 with a generic error.
6. CORS/origin allowlist as in `lineups`. No secrets in the response. Generic errors. Supabase Auth's
   own sign-in rate limits apply to password attempts.

**Profile UI:**

- "Tehlikeli Bölge" block in Hesap with a red "Hesabımı Sil" button. The modal lists what is deleted
  and what is not (section 4).
- Inputs: a password field and a text field that must match `HESABIMI SIL`. Confirm stays disabled
  until both are filled.
- Cancel or Escape closes with no request. Errors (wrong password, expired session, network,
  partial failure) are shown in the modal.
- Success is shown only after the server confirms. Then:
  1. local `signOut({scope:'local'})`,
  2. remove the user-scoped keys listed above for this uid,
  3. `location.replace('/')`.

**Secrets:** the function uses the existing Edge env secret keys. The frontend never receives them.

## 3. Shared links — decision required (blocks enabling deletion)

| Option | What it does | Needs |
| --- | --- | --- |
| **A (recommended)** | Migration: `shared_lineups.owner_id uuid null references auth.users(id) on delete cascade` plus an index. The share POST sends the signed-in user's access token; the `lineups` function verifies it with `getUser` and stores `owner_id`. GET never returns the owner. Deleting the account then removes that user's future links through the cascade. | Migration approval, `lineups` function and share-client change, redeploying `lineups` |
| A + legacy policy | Existing unattributed links (8 hosted, likely test data from 2 accounts): **(a)** keep and disclose; **(b)** give them an expiry, e.g. 30 days; or **(c)** purge them all before launch. | Product decision; (b)/(c) are data changes on hosted, with separate approval |
| B (no migration) | Enable deletion with an explicit notice: "Paylaştığın bağlantılar hesabına bağlı değildir ve silinmez; kaldırılması için iletişime geç." | Product/legal acceptance. The contact mailbox currently has **no MX** (LEGAL1.2), so this removal channel does not work yet. |

Recommendation: **A + (c)** before public launch (or **A + (b)** if any link must keep working), plus a
later "Paylaşımlarım" list for revoking links.

## 4. Retention limitations to disclose (any option)

- Supabase backups keep deleted rows until backup rotation (plan-dependent, **unverified**). After a
  restore, recorded deletions must be re-applied.
- Provider logs (Supabase Auth/API, Netlify, email provider, Cloudflare) are kept for provider-defined
  periods and cannot be deleted per user.
- Browser drafts on **other devices** remain until the user signs in there or clears that browser.
- Legacy share links depend on the section 3 decision.
- `share_limits` keeps only daily salted IP hashes and clears itself within 2 days.

## 5. Test plan (after approval, local disposable accounts only)

- **Handler unit tests (fakes):**
  - missing, invalid or expired token → 401
  - extra `user_id` field → 400; the target is always the token user
  - wrong password / wrong confirmation → 403 with no delete call
  - `deleteUser` failure or non-zero recount → error, never success
- **Local integration (Supabase Local):**
  - Create users A and B with rows in profiles, projects, overrides and Weekly XI, plus share links
    (owned by A, owned by B, unowned under option A).
  - Delete A through the real handler, with real Auth, admin API and cascades: A's rows are gone;
    B's rows and the unowned links remain.
  - A's token cannot delete B. Expired tokens fail.
  - Requires temporarily enabling the local Edge runtime, or running the handler in Node against local
    Auth.
- **UI tests:**
  - cancel sends no request
  - mismatched text keeps confirm disabled
  - failure messages; success only after server confirmation
  - local cleanup removes only this user's keys
  - redirect to `/`
- Then `npm test`, `npm run build`, `git diff --check`.

## 6. Other prerequisites and blockers

- Hosted schema drift: `weekly_lineups` and onboarding migrations are not applied in production.
  Deletion still works through the cascades that exist there.
- Contact mailbox (MX) is not working. Relevant to option B and to legal requests.
- Deploying the new function and redeploying `lineups` to hosted needs separate approval (not done here).
