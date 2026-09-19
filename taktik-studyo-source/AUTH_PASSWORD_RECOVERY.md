# Password recovery — Phase 5 (local implementation)

Human-edited static pages: `/sifremi-unuttum.html` and `/sifre-yenile.html`.
They reuse `auth.css`; `recovery-ui.js` is bundled through `backend-entry.js`.
`dist/backend.js` is generated only by `npm run build`. The login page gains only
the forgot-password link. No framework, package version, database schema, policy,
profile bootstrap, board, catalogue, sharing or draft behavior is changed.

## Request and callback contract

The browser facade's `requestPasswordReset({email,captchaToken?})` validates and
trims email, maps the current origin to an exact allowlisted URL, checks optional
Auth CAPTCHA, awaits initialization and blocks existing login/recovery sessions.
The Auth controller repeats the session/input checks, then calls:

```js
supabase.auth.resetPasswordForEmail(email, {redirectTo, captchaToken})
```

Only these origin-to-URL mappings are allowed:

| Origin | Reset URL |
| --- | --- |
| `https://taktikstudyo.com` | `https://taktikstudyo.com/sifre-yenile.html` |
| `http://localhost:4173` | `http://localhost:4173/sifre-yenile.html` |

Other origins, ports, subdomains, protocol-relative/encoded URLs, queries and
trailing-path tricks are rejected. This is separate from the confirmation URL
allowlist; the internal navigation whitelist is unchanged.

Success and account-specific errors return the same `recovery_requested` result:
“Eğer bu e-posta ile bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.”
Network/rate-limit/mail errors use `recovery_request_failed` and generic text.
No raw error, account-existence detail or SDK response reaches the UI. Local
malformed input has clear validation feedback. Rate limits remain server-side.

## Installed SDK and CAPTCHA

Verified against installed `@supabase/supabase-js` **2.116.0** and its Auth package:
`GoTrueClient.d.ts` declares `resetPasswordForEmail(email, options?: {redirectTo?:
string; captchaToken?: string})`. `GoTrueClient.js` sends the token as
`gotrue_meta_security.captcha_token` in POST `/recover`. The real SDK/mock HTTP
integration test verifies that mapping. See the current
[reset API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
and [CAPTCHA guide](https://supabase.com/docs/guides/auth/auth-captcha).

`AUTH_TURNSTILE_SITE_KEY` remains an optional, separate public config hook. The
Auth widget is still deferred. If configured without widget wiring, login,
registration and reset-request forms fail closed with `captcha_required` rather
than bypassing CAPTCHA. Tokens are accepted per call, never cached for reuse or
persisted by this code. The reset-link completion page uses the recovery token;
it does not load a CAPTCHA script or invent a CAPTCHA requirement for updateUser.
Sharing Turnstile configuration and helpers are unchanged.

## Explicit reset submission

The reset page accepts exactly one `token_hash` and one `type=recovery`, with no
extra parameters. Duplicate, missing, wrong-type, malformed-percent-encoded,
empty, whitespace/control-character or over-2048-character tokens are rejected.
There is no narrow hash-alphabet regex.

On mount, the query is captured and `history.replaceState` removes query and
fragment synchronously before any asynchronous Auth call. TokenHash stays only
in a closure; it is not put in storage, cookies, DOM attributes/dataset, console,
analytics or errors. The local reference is dropped after submission or exit.
No `verifyOtp` runs at page load. A reload requires reopening the email link.

`no-referrer` appears before asset references. Only local CSS/JS is loaded; no
analytics, remote fonts or third-party script exists. Initial HTTP hosting logs
may still contain the query. Client code cannot remove that initial exposure or
guarantee that a scanner capable of submitting a form will never consume a token.

Both fields use `autocomplete="new-password"`. Minimum length is 12 characters,
password whitespace is preserved, and confirmation is checked only in the form:
it never enters the API. Native labels, keyboard submit, live feedback and the
existing focus styles are retained. Double submission is blocked. In-page links
are hidden during completion; browser close/back controls cannot be prevented.

## One operation and recovery state

`src/lib/recovery-client.js` creates a **fresh dedicated client per completion**,
using the same public Supabase URL/publishable key, with:

```js
{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, debug:false}
```

It supplies no custom token storage. The SDK owns its in-memory session; a distinct
per-operation `taktik:recovery:<hostname>:v1:<sequence>` SDK namespace avoids sharing
the main client's storage/lock identity. This namespace is not written to browser
storage. The pinned SDK also disables session broadcasting when persistence is off.
The client is private, never exported to `window`, and disposed/released at the end.
See [client configuration](https://supabase.com/docs/reference/javascript/initializing).

The **main** client in `supabase.js` keeps `persistSession:true`,
`autoRefreshToken:true`, `detectSessionInUrl:false` and its original
`taktik:auth:<hostname>:v1` storage key. Normal login, catalogue, profiles,
registration, email confirmation and `requestPasswordReset()` use that client.
Only recovery completion uses the dedicated client.

`completePasswordRecovery({tokenHash,password})` is the single UI-facing operation:

1. Validate, await main initialization, reject any current login/recovery session.
   Re-read main `getSession()` before consuming the token to catch delayed events.
2. Set the internal recovery lifecycle and create the dedicated client.
3. Dedicated `verifyOtp({token_hash:tokenHash,type:'recovery'})`.
4. Match returned user/session, dedicated client's current identity and expected
   recovery identity. Recheck main session/identity changes before updating.
5. Dedicated `updateUser({password})` inside that verified context only.
6. Dedicated `signOut({scope:'local'})` before returning success.

See [`verifyOtp`](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[`updateUser`](https://supabase.com/docs/reference/javascript/auth-updateuser) and
[`signOut`](https://supabase.com/docs/reference/javascript/auth-signout).

The lifecycle marker contains identity/phase information, not a token or an
authorization proof, and is not on `window`. During verification it reports
`password_recovery` with no recovery user in the main identity snapshot.
Dedicated `SIGNED_IN`, `USER_UPDATED` and `TOKEN_REFRESHED` events are observed
privately; they never populate the main Auth user or promote it to `signed_in`.
Completion (including cleanup failure) returns main state to `signed_out` unless
an independent normal main login occurred, in which case that main identity is
preserved and the recovery operation reports the race. No recovery credentials
are copied to the main client. Normal sign-in/signup/confirmation cannot start
concurrently through the controller while recovery is active. No profile bootstrap runs.

## Account races and SDK dispatch

An identity change is latched: observing A → B → A cannot make the operation valid
again. Main-account changes abort completion; dedicated identity is rechecked
after verification and update. Cleanup calls only the dedicated client and never
signs out, updates or clears storage of the main account.

SDK `updateUser()` asynchronously re-reads its current session before sending a
request. The dedicated client's memory session cannot be overwritten through
main persistent storage. In addition, `recovery-transport.js` checks only
the relevant Auth requests during an active operation at fetch dispatch. Password
update and cleanup must use the exact credential returned by successful verifyOtp
and satisfy the current recovery checks. A different credential or an invalidated
operation is blocked locally; the wrong-account request is not sent. Verification
is also rechecked at dispatch. The main client's ordinary timeout fetch is not
wrapped by recovery transport, so catalogue/profile/login requests are independent
of recovery transport state.

This uses only the dedicated client's supported custom fetch hook, not SDK
private methods. A short-lived private credential comparison
is created from the verify response and released after the operation. No raw SDK
storage read/write/removal is added, and no credential is returned to the UI.
Even a same-account token rotation that changes this credential fails closed.

The controller returns `state_changed` after account races. If transport detects
a changed credential, it does not start another cleanup operation with an
untrusted session. If recovery still clearly owns its dedicated session, it attempts
local cleanup even after a main-account switch. This is not an atomic transaction
across tabs or the network.
Already dispatched requests cannot be undone; SDK-internal storage effects during
an in-flight update/logout cannot be made transactional by this wrapper. In
particular, the SDK may clear its memory session after a logout error. The main
persistent session is separate and unaffected. No manual storage repair is attempted.

## Failure and interruption

- Verification failure: `recovery_failed`; never call updateUser.
- Password update failure/exception: attempt local cleanup, then return
  `password_update_failed`; request a fresh link because the token may be spent.
- Cleanup failure: `recovery_cleanup_failed`, never ordinary success. A boolean
  `passwordUpdated` distinguishes a confirmed successful password update from
  a failed/uncertain update without exposing a user or session. The dedicated
  client is disposed/released even if logout fails; it cannot create a normal
  persistent session. The main client is not signed out by cleanup.
- Success: `password_updated`; show “Şifren güncellendi. Yeni şifrenle giriş
  yapabilirsin.” The user chooses the login link; there is no automatic navigation.

**Reload/crash isolation is a design guarantee of this completion flow:** recovery
session persistence is disabled. No recovery session is written to localStorage,
sessionStorage, cookies or the main `authStorageKey`. A new page's main client
cannot restore it as `INITIAL_SESSION`/normal `signed_in`, even if the old page
crashed after verification but before update/logout, or logout failed. This does
not depend on preserving the memory marker, custom token storage, or manually
reading/deleting SDK storage. Normal login persistence remains enabled separately.

Interruption can still consume a one-use token, leave the password unchanged, or
leave an uncertain update result if the server completed a request before the
connection was lost. A fresh reset link may be required. Memory-only storage does
not revoke a server-issued credential by itself; local sign-out is still attempted
when the operation can finish. Already dispatched requests cannot be undone.

Phase 6 guards must accept only `status === 'signed_in'` for normal protected
navigation and reject `password_recovery`. Recovery reload isolation now comes
from the dedicated non-persistent client, not merely from those future guards.
No protected routes or new database authorization rules are added in this phase.

## Cross-device and future Dashboard configuration

A PC can request the email and a phone can open it, enter a new password, submit,
and finish local recovery sign-out without any PKCE verifier from the PC. The PC
can then log in with the new password. This flow does not assume that the PC's old
session becomes a new login or that local sign-out revokes every issued JWT.

**Documentation only — none of these Dashboard changes were applied:**

- Site URL remains the intended `https://taktikstudyo.com`.
- Add the exact production reset URL and, if deliberately enabled for local
  testing, the exact localhost URL from the table. No wildcard redirects.
- Configure the **Reset password** email template around `.RedirectTo`, populated
  by the request's `redirectTo`, with a TokenHash link:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Şifremi yenile</a>
```

Do not use the confirmation page or `type=email` for recovery. See
[template variables](https://supabase.com/docs/guides/auth/auth-email-templates)
and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
Actual project template availability, SMTP and redirect settings were not changed
or tested in production. Custom SMTP/template customization may be prerequisites;
default SMTP has recipient/rate restrictions and is not a general production mail
service. Refer to the existing [email configuration notes](AUTH_EMAIL_CONFIRMATION.md)
and [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## Local verification

`npm test` includes fake-client lifecycle/UI/parser tests and the installed real
SDK with fully mocked HTTP/storage: two devices, CAPTCHA wire format, call order,
state transitions, event races, late main storage switching, cleanup errors, and no
profile calls. A regression pauses after dedicated verification before update,
disposes the old controller, and initializes a new main client against the same
untouched persistent storage: no recovery entry, null user and `signed_out` are
required. Construction tests verify all client flags, separate fetch hooks and
zero persistent storage writes during recovery. Normal login restore is tested
separately after recovery. Existing registration/confirmation, drafts, sharing, catalogue,
database and board regressions remain included. No real reset email, production
Auth request, environment value change, migration, deploy or publish is performed.
