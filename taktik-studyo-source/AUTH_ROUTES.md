# Auth routes and board lifecycle

Phase 6 uses plain HTML/CSS/JavaScript. No router framework, database change or
production configuration change is included.

## Routes

| Route | Behavior |
| --- | --- |
| `/`, `/index.html` | Public landing, Auth-aware navigation |
| `/?lineup=<UUID>` | Public shared lineup, no login requirement |
| `/lineup/<UUID>` | Legacy public shared lineup, same parser and draft contract |
| `/giris.html`, `/kayit.html` | Public login/registration |
| `/auth-callback.html` | Public email confirmation |
| `/sifremi-unuttum.html`, `/sifre-yenile.html` | Public password recovery |
| `/studyo.html` | Protected main tactics board |
| `/karsilastirma.html` | Protected independent left/right boards |
| `/profil.html` | Protected profile shell, no profile data queries/editing |

`page-routes.js` resolves root share requests before landing. Presence of `lineup`
means a share request even when empty/invalid. Duplicate parameters and noncanonical
lowercase UUID v4 values fail before backend access and never fall back to landing.
The query wins over a legacy path; the legacy optional trailing slash remains
accepted. `_redirects` retains only `/lineup/* /index.html 200`.

## Bootstrap and guard

`app.js` and `comparison.js` now define small mount APIs without automatic board
creation. `backend-entry.js` starts route resolution at `DOMContentLoaded`, after
all classic `defer` definitions are available. There is no polling/timer-based
script-order workaround. Auth callback/recovery URL sanitization still occurs
synchronously in its existing entry path, before asynchronous Auth calls.

The normal index board markup is preserved in `studyo.html`'s template. Its mount
clones the template into a dedicated root and uses the existing board engine.
Index retains a hidden public shared viewer alongside the landing container;
the public shared engine/draft behavior is unchanged.

`protected-page.js` is the single protected lifecycle:

1. Keep protected content `hidden` and `inert`; initialize the main Auth controller.
2. Require `status === 'signed_in'` and a current user id.
3. Call `auth.validateUser()`, which calls the Auth server's `getUser()`.
4. Require a successful result with the same current user id and generation.
5. Create an immutable `createUserDraftScope` from that validated id.
6. Resolve optional legacy import choices, load catalogue on demand, then mount.

See the [Supabase getUser contract](https://supabase.com/docs/reference/javascript/auth-getuser).
`getSession()`/a local snapshot alone cannot mount protected content. Validation
identity mismatch or transient network/Auth server failure keeps content closed
and offers retry/login. Explicit unauthenticated/invalid/expired session results
redirect to login. No raw SDK message is displayed. `password_recovery` is always
denied; the dedicated nonpersistent recovery client is not used by route guards.

Validation error hardening (installed supabase-js/auth-js 2.116.0): use the public
`isAuthSessionMissingError` helper, or `isAuthApiError` with `session_not_found`,
`session_expired`, `bad_jwt`, `user_not_found`, `refresh_token_not_found` or
`refresh_token_already_used`. These meanings are documented in the
[Auth error contract](https://supabase.com/docs/guides/auth/debugging/error-codes)
and present in the installed SDK's error types. No message matching or
status-only invalid-session decision is used. Retryable network errors, timeouts,
service errors and unknown/insufficient-AAL/status-only errors fail closed without
an application logout. A malformed user-less success response does not authorize
destructive cleanup of a restored session either.

For a confirmed invalid session, `validateUser()` rechecks its starting identity,
epoch/revision and the public SDK `getSession()` identity, then calls supported
`signOut({scope:'local'})`. There is no manual SDK storage access/removal. The SDK
can itself remove a `session_not_found` session during `getUser`; a single own
SIGNED_OUT transition is recognized without issuing a redundant logout. A changed
identity/generation causes `state_changed`, not application cleanup or a stale
redirect. These are checks before SDK dispatch, not an atomic cross-tab transaction
or a guarantee about already-dispatched SDK operations.

The guard waits for validation/cleanup completion before acting on its SIGNED_OUT
event. Cleanup failure returns `session_cleanup_failed` and stays on controlled
error/retry even when the SDK already removed its local session before returning
that error. Successful invalid-session cleanup permits the login form to open;
valid existing sessions keep the original login-page existing-session behavior.

**The client guard is a UX/privacy boundary, not backend authorization.** Supabase
JWT validation, existing RLS and minimum-privilege grants remain authoritative.
No policy, grant, RPC permission or schema is relaxed.

## Account changes, logout and navigation

The Auth controller offers a synchronous invalidation hook for privacy teardown
when identity/status changes. It only hides/disposes UI and draft writers; it does
not start asynchronous Auth calls inside the SDK callback lock. The existing
asynchronous subscriber then validates the new identity. Generation checks reject
stale results, including changes while importing or loading catalogue. Scope A
is disposed before B validates; it is never retargeted to B.

Logout immediately hides/disposes protected content, then calls existing
`auth.signOut()` with local scope. Failure stays closed with a controlled message;
success goes to login. No user, legacy or shared drafts are deleted. A scoped
board's cleanup also removes its body-mounted share dialog/widget and prevents
stale dialog publication; the sharing Edge/CAPTCHA protocol is unchanged.

`pagehide` tears down the protected mount. A persisted `pageshow` (browser back/
forward cache) reinitializes the page guard and revalidates before mounting again.

Login success navigates only to `/studyo.html`, `/karsilastirma.html` or
`/profil.html` through the existing exact allowlist. Missing, duplicate or invalid
`next` falls back to `/studyo.html`; external URLs, backslashes, unknown paths and
unexpected query/fragment values cannot become destinations. Profile bootstrap
outcomes do not revoke login success. Registration and confirmation have no new
automatic studio navigation.

## Drafts and opt-in import

| Board | Draft key |
| --- | --- |
| Main | `taktik:draft:<USER_ID>:main:v2` |
| Comparison left | `taktik:draft:<USER_ID>:comparison:left:v2` |
| Comparison right | `taktik:draft:<USER_ID>:comparison:right:v2` |
| Public shared, signed in or out | `taktik:draft:shared:<UUID>:v1` |

The guard directly reuses Phase 3 `createUserDraftScope`, its contexts, writers,
validation and importer. The earlier snapshot-only `bindAuthenticatedDrafts`
helper is not wired alongside the guard; there is no competing mount lifecycle.

`legacy-import-ui.js` inspects only the known legacy keys and current user's
targets. A valid legacy slot with no target offers **İçe aktar** or **Yeni taslakla
devam et**. No automatic import or cross-user key enumeration occurs. Left/right
decisions are separate. Import preserves the source and existing destinations,
including the existing second destination check before write. This narrows a race
window; localStorage does not provide an atomic compare-and-set guarantee.
The board mounts after the decision, so an accepted import is immediately visible.
Scope disposal dismisses an outstanding prompt without importing.

## Public share and catalogue independence

Public share bootstrap never consults the Auth guard, profile bootstrap or user
draft importer. Logged-in status does not change its public shared draft key.
`GET /functions/v1/lineups?id=...` still uses the direct publishable-apikey fetch,
without an injected Authorization header or direct browser `shared_lineups` query.
Auth initialization failure cannot gate this flow.

`TAKTIK_BACKEND.loadCatalogue()` loads the existing catalogue lazily. Landing,
Auth pages and profile shell do not start teams/players requests. Protected board
pages request catalogue only after validation/import decision; valid public share
requests load it without Auth validation. Invalid share requests make neither
catalogue nor shared GET requests. Existing fallback rosters remain available.

## Deployment dependencies and local verification

The authenticated catalogue SELECT grants/RLS and profiles foundation exist as
source migrations from earlier phases. **Production application of those changes
is outside this task.** Auth Site URL/redirect allowlists, SMTP/templates and Auth
CAPTCHA configuration likewise remain external deployment prerequisites; consult
`AUTH_EMAIL_CONFIRMATION.md` and `AUTH_PASSWORD_RECOVERY.md`. The separate Auth
CAPTCHA fail-closed contract is unchanged. No settings/secrets were changed here.

Hand-maintained files include `dist/*.html`, `dist/app.js`, `dist/comparison.js`,
`dist/routes.css` and `src/**`. `dist/backend.js` is generated only by
`npm run build`; it is never edited manually.

`npm test` covers route precedence, guard validation and event races, safe login
navigation, opt-in import, account-scoped wiring, landing navigation, profile
shell isolation, actual bundled DOMContentLoaded/bfcache bootstrap, public sharing
and the preexisting Auth/recovery/database tests. Board regression also exercises
the real studio/comparison mount APIs and cleanup. Tests use fakes/mocked SDK HTTP;
no production user, login or reset email is used. Browser visual verification
requires an available browser connection; it was unavailable in this session.
