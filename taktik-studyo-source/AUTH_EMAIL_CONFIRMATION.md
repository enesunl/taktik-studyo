# Auth pages and email confirmation — Phase 4

This phase adds `/giris.html`, `/kayit.html`, `/auth-callback.html` and local
`auth.css`. These static files are human-edited. `src/lib/auth-ui.js` runs inside
the generated `dist/backend.js`; regenerate that bundle only with `npm run build`.
The existing studio/comparison pages, public sharing and draft behavior are unchanged.
No production settings, users, migrations, environment values or deployments were changed.

## Browser and Auth API

### Account-switch completion guards

Login and email verification retain a private result guard through server
validation, profile bootstrap and the final UI/navigation boundary. The guard
captures controller epoch, identity/status generation and user id. Identity/status
changes advance that generation synchronously; A -> B -> A cannot revive A's old
operation. Same-identity refresh events do not create a new identity generation.
The initial signed-out -> SDK-returned-user transition is allowed exactly once;
subsequent account changes return `state_changed` without bootstrap or navigation.

Profile bootstrap is pinned to the validated result's id and generation, never
retargeted to the mutable current user. `isCurrentResult(result)` checks a private
WeakMap guard before success UI and again before navigation; results expose only
the pinned `userId`, never generation counters, session or tokens. These guards
are lifecycle checks, not server authorization. Existing invalid/unconfirmed
session cleanup still rechecks identity/revision and SDK session before local
sign-out; stale completion never adds a compensating logout. Already-dispatched
SDK/network side effects are not made atomic or rolled back by these checks.

`tests/auth-navigation-race.test.mjs` uses deferred promises for validation,
verification and bootstrap races, A/B/A transitions, final UI gating, normal
login and unconfirmed cleanup regressions. No timeout-based synchronization is
used for these tests.

### Required confirmation gate (post-Phase 7 hardening)

The hosted project must have **Authentication → Providers → Email → Confirm
email enabled**. Backend confirmation enforcement is the primary layer, not
something the browser can replace. No production setting was inspected or
changed for this fix. See [Supabase email/password configuration](https://supabase.com/docs/guides/auth/passwords).

The installed `@supabase/supabase-js` / `auth-js` 2.116.0 `User` type defines
`email_confirmed_at?: string`. The application uses that server `getUser()` field,
exposed internally as `emailConfirmedAt`; neither `confirmed_at` (which can also
represent phone confirmation), `phone_confirmed_at`, signup response, local
restored snapshot nor user-editable metadata is accepted as email proof.

`validateUser()` now requires a same-id server user with a nonempty email
confirmation timestamp. The current application supports email Auth only. Future
phone/OAuth flows require their own reviewed access contract rather than bypassing
this check. The protected guard only mounts after this successful validation;
unconfirmed users never reach studio/comparison/profile mount, catalogue load,
draft scope creation or the legacy-import prompt.

If the server returns an unconfirmed same-id user, validation rechecks generation,
identity and the public SDK `getSession()` before dispatching
`signOut({scope:'local'})`. It never removes SDK storage keys itself. A stale A
result after an account switch to B returns `state_changed` without logging B out.
This preserves the existing best-effort cross-tab checks; it is not an atomic
lock across tabs or SDK/network work already in flight.

Successful cleanup returns `email_not_confirmed`; protected pages use the existing
allowlisted login URL with the fixed `reason=email_not_confirmed` code. Login
renders a fixed verification-required message and never echoes arbitrary query
values. Cleanup error/exception returns `session_cleanup_failed`, leaves routes
closed with retry, and is not reported as successful logout. Transient validation
failures remain `user_validation_failed` without destructive cleanup; known invalid
session errors retain cleanup plus `unauthenticated` semantics.

`signInWithPassword` maps the typed SDK `AuthApiError.code=email_not_confirmed`
without reading or matching `error.message`. Even a successful password session
must pass `validateUser(expectedId)` before login success, profile bootstrap or
navigation. `verifyEmailToken` likewise requires confirmed same-id server evidence
after `verifyOtp(type:'email')`; callback parsing and synchronous URL sanitization
are unchanged. An unexpected signup session is also validated and cleaned if
unconfirmed, retaining the generic confirmation-pending response after cleanup.

**Configuration limit:** with Confirm email disabled, Supabase can auto-confirm
users on the server. An `email_confirmed_at` supplied by that server cannot tell
the browser whether a person clicked a verification email or the backend
auto-confirmed them. This patch cannot correct that configuration or retrospectively
prove an email click. Existing auto-confirmed accounts require a separate operational
review; this task changes no hosted settings, users or database rows.

`tests/auth-email-gate.test.mjs` covers the unconfirmed login/route/callback paths,
same-id server evidence, cleanup failure, account-switch races and a real installed
SDK with mocked HTTP/storage. The confirmed login/legacy-import/route regressions
remain in the full local suite.

Normal Auth, catalogue and profiles share the existing Auth-aware client. Phase 5
isolates password recovery completion in a dedicated non-persistent client; email
confirmation still uses the main client. No raw client, session, token or SDK error
is exported to `window`. Auth pages receive a
module-local facade (`auth-page-api.js`). Catalogue loading is skipped on these
pages; public catalogue/sharing initialization continues on existing pages.

- Login trims email, preserves the password exactly, prevents duplicate submits
  and navigates to the allowlisted destination only after confirmed server
  validation. Existing sessions block another login.
- Registration validates ASCII usernames (3–24 letters/digits/underscore), email,
  minimum 12-character passwords and matching confirmation. Password confirmation
  is checked only in the form and never passed to the API. No username availability
  query is made. Submitted passwords are cleared after the request; no application
  password persistence or logging is added.
- `auth.signUpWithPassword({email,password,username,emailRedirectTo,captchaToken?})`
  returns `{ok:true,status:'confirmation_pending'}` for success and obfuscated/
  known existing-account responses. Neither a null nor an unexpectedly non-null
  returned session exposes account existence or raw credentials. SDK session
  ownership remains with the SDK; the UI does not infer confirmation. A successful
  `confirmation_pending` result replaces the page with exactly
  `/giris.html?reason=confirmation_pending`, including after local cleanup of an
  unexpected unconfirmed session. No email, username, id, token or arbitrary
  message is carried in that URL. Failure never triggers this redirect.
- `auth.verifyEmailToken(tokenHash)` delegates to `verifyOtp({token_hash,type:'email'})`
  and returns only the existing limited `userView`. The page facade reduces this
  further to Auth success plus a separate profile outcome. Raw errors map to
  application codes and controlled text via `textContent`.
- Local sign-out scope, redirect destination whitelist and `password_recovery`
  classification are preserved; `validateUser()` enforces the confirmation gate above.

Login accepts exactly one `reason` with value `confirmation_pending` or
`email_not_confirmed`. Unknown values and duplicate parameters display no reason
message. The fixed Turkish copy is shown inside the login card above the form;
query text is never echoed. This is a UX hint, not proof of signup or confirmation.

## Callback contract and future Dashboard setup

**The following is a future configuration checklist, not an applied change.**

Target Site URL: `https://taktikstudyo.com`.
Add only the exact required redirect entries for the relevant environment:

- `https://taktikstudyo.com/auth-callback.html`
- `http://localhost:4173/auth-callback.html`

The application maps these two exact origins to fixed callback URLs. Arbitrary
origins (including `127.0.0.1`, another port, a subdomain or a supplied `next` URL)
cannot produce a registration callback. Local development must use localhost:4173.
Do not use wildcard redirect entries. Do not enable a localhost production entry
unless that testing mode is deliberately intended.

Keep email confirmation enabled in the future target Auth configuration. Pass the
allowlisted callback URL through signup `options.emailRedirectTo`. The **Confirm
signup** email template should link to:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">E-posta adresimi doğrula</a>
```

`.RedirectTo` receives `emailRedirectTo`, including the callback path; Site URL is
the project's fallback, not a substitute for that path. The template deliberately
uses TokenHash rather than a confirmation endpoint that consumes the token before
the application can ask for a click. See [email template variables and prefetching](https://supabase.com/docs/guides/auth/auth-email-templates)
and [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
All signup callers using this template must provide the validated callback URL.

Actual template availability, Confirm Email settings, SMTP configuration and
redirect entries have not been inspected or changed in production. Default SMTP
is restricted and is unsuitable for a general production rollout; use a properly
configured custom SMTP provider for production. Template customization may also
depend on the project's plan/creation date and SMTP setup (new Free projects after
June 3, 2026 with default SMTP have restricted templates). Check the actual project
before rollout; see [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)
and [template customization change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Token handling, collisions and cross-device behavior

The callback accepts exactly one `token_hash` and one `type=email`; missing,
duplicate, extra, invalid-encoded, empty, whitespace/control-character or oversized
tokens are rejected. Token characters are otherwise not restricted to a hash
alphabet. Maximum token length is 2048 characters.

On mount, the query is captured and `history.replaceState` immediately removes
query and fragment **before asynchronous Auth restoration**. The token stays in a
module closure; it is never written to localStorage/sessionStorage or logs. The
page's `no-referrer` meta precedes local assets; there are no remote fonts,
analytics or third-party scripts. Initial hosting request logs can still contain
the query. Client-side sanitization cannot prevent this or promise that a scanner
capable of clicking buttons will not consume the token.

Page load never calls `verifyOtp`. Only “E-posta adresimi doğrula” does. The local
token reference is discarded on submission, page exit and blocked/failed setup.
Retry after an error or reload requires reopening the original email link.

After that explicit click, successful `verifyOtp(type:'email')` and same-id
confirmed server validation are followed by the existing profile bootstrap.
`ready`, `profile_incomplete`, `username_conflict` and `profile_error` do not undo
Auth success: profile bootstrap is not the access boundary. The callback replaces
the page with exactly `/studyo.html`, without another email/password login.
No query-supplied `next` is accepted; an extra callback parameter remains invalid.

The callback facade captures the confirmed identity and checks it before/after
profile bootstrap. It returns only that user id plus the controlled profile result,
never the raw session/token. The UI checks the same current signed-in identity
again before navigation. A different account or recovery/signed-out state prevents
navigation. Invalid/expired tokens, unconfirmed/mismatched users, cleanup failures,
state changes and Auth/network failures retain controlled error UI without redirect.

A restored session (including password recovery) blocks verification. The session
is checked again at click time and in the Auth method. No automatic sign-out or
silent account switching is performed. The user must sign out and reopen the link,
or use a private window. This is not a cross-tab atomic lock against a session
change happening while a request is already in flight.

Signup on PC followed by opening the email on a phone works without the PC's PKCE
verifier: the phone submits TokenHash after a click. Its SDK persists the resulting
session on the phone only, and the phone continues directly to `/studyo.html` after
the explicit confirmation button succeeds. The PC receives no automatic session and can use normal
email/password login after confirmation. This differs from
[PKCE's same-browser verifier requirement](https://supabase.com/docs/guides/auth/sessions/pkce-flow);
see [`verifyOtp`](https://supabase.com/docs/reference/javascript/auth-verifyotp).
The callback deliberately rejects `type=recovery`; Phase 5's dedicated
[password recovery flow](AUTH_PASSWORD_RECOVERY.md) must be used instead of this
confirmation page.

## Profile bootstrap and security boundary

After successful login or confirmation, `profile-bootstrap.js` calls server-side
`auth.getUser()`, requires a confirmed non-anonymous user matching the current UI
identity, then selects only `id,username,display_name,created_at,updated_at` for
that ID. No wildcard or `avatar_url` is queried. If absent, a revalidated
`user_metadata.username` may seed an INSERT containing only the verified `id`
and `username`. Metadata never supplies ownership, roles or authorization.

An existing profile succeeds without overwriting it. INSERT errors cause another
own-row SELECT: a concurrent insert found there succeeds; a unique violation
without an own row yields `username_conflict`; other failures yield `profile_error`.
Missing/invalid seed yields `profile_incomplete`. No upsert or alternate username
UI exists. A profile error does not sign out or reverse successful Auth. Database
RLS/grants remain the actual boundary; this phase does not apply the Phase 1
profiles migration or claim it is already applied in production.

## Auth CAPTCHA and verification

`AUTH_TURNSTILE_SITE_KEY` is an optional, separate **public** build config hook.
No real environment value was added. Auth methods accept a per-call captcha token
via SDK `options.captchaToken`; they do not persist it. The actual Auth widget,
one-use token/reset wiring and production CAPTCHA setting are deferred to hardening.
With no Auth site key, mocked/offline UI testing works. If the key is configured,
current UI cannot obtain a token and submission fails closed with `captcha_required`;
do not enable/configure it as a completed production feature yet. Callback loads
no Turnstile script. Sharing's existing Turnstile keys and helpers are untouched.

`npm test` covers form/controller behavior, token parsing/sanitization, click-only
verification, collisions, duplicate submission, safe output, profile races and
real SDK calls with mocked HTTP on two separate device stores. All existing
sharing, catalogue, draft isolation, board and local database regressions remain
part of the suite. No real signup/login or production request is needed. Run the
static site locally at localhost:4173 with mock/offline config for UI checks;
do not treat merely serving production-configured assets locally as a network mock.
