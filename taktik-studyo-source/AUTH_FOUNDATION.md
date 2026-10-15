# Auth foundation (Phases 2–5, local source only)

`src/lib/supabase.js` owns the main persistent Supabase client. Catalogue, normal
Auth and profiles share it. Password recovery completion alone uses a dedicated
non-persistent client from `src/lib/recovery-client.js`; reset email requests stay
on the main client. Supabase JS remains pinned to 2.116.0. The public sharing
adapter still calls the lineups Edge Function using fetch, independently of Auth.

Auth uses `persistSession: true`, `autoRefreshToken: true`,
`detectSessionInUrl: false`, `debug: false` and the deterministic SDK storage key
`taktik:auth:<Supabase hostname>:v1`. There is no custom token/session storage.
Existing `taktik:draft:*` keys are unchanged. The existing public Turnstile site
key remains in the build. Phase 4 adds a separate optional public Auth CAPTCHA
config hook; no real Auth CAPTCHA setting or environment value is changed.

## Module API

Import `auth` and `safeInternalRedirect` from `src/lib/auth.js`; neither is a
window global. `backend-entry.js` starts initialization without gating public
catalogue or sharing. Phase 4 adds login/register/confirmation pages; see
[Auth email confirmation](AUTH_EMAIL_CONFIRMATION.md) for the callback, profile
bootstrap and deferred production configuration. Phase 5 adds
[password recovery](AUTH_PASSWORD_RECOVERY.md); protected-route guards remain deferred.

| Method | Result |
| --- | --- |
| `initialize()` | Single-flight restore; `{ok:true,state}` is the initial snapshot |
| `getState()` | Current immutable `{status,user,event}` snapshot |
| `getCurrentUser()` | Local identity snapshot or null; not authorization evidence |
| `validateUser()` | Calls SDK `getUser()` on every invocation; `{ok:true,user}` on success |
| `signInWithPassword({email,password,captchaToken?})` | Delegates to SDK; `{ok:true,user}` |
| `signUpWithPassword({email,password,username,emailRedirectTo,captchaToken?})` | Validates input/callback; generic `{ok:true,status:'confirmation_pending'}` |
| `verifyEmailToken(tokenHash)` | Click-only email verification caller; limited `{ok:true,user}` |
| `requestPasswordReset({email,redirectTo,captchaToken?})` | Exact recovery URL; generic `{ok:true,status:'recovery_requested'}` |
| `completePasswordRecovery({tokenHash,password})` | Verify recovery → password update → local sign-out; `{ok:true,status:'password_updated'}` |
| `signOut()` | SDK `signOut({scope:'local'})`; `{ok:true,state}`; no draft deletion |
| `subscribe(listener)` | Deferred state delivery, including initial snapshot; returns unsubscribe |
| `dispose()` | Unsubscribes controller, cancels pending notifications; allows reinitialization |
| `safeInternalRedirect(value)` | Allowed root-relative route or null; never navigates |

User snapshots contain only `id`, `email`, `emailConfirmedAt`; no metadata or
tokens. Async failures return `{ok:false,error:{code}}` without copying SDK error
messages, credentials, stack traces or sessions. Codes include `auth_unavailable`,
`session_restore_failed`, `invalid_credentials`, `sign_in_failed`,
`sign_out_failed`, `user_validation_failed`, `unauthenticated`, `state_changed`.
After `state_changed`, a caller must reconsider the current identity before
retrying. Validation failure does not erase a local session or draft.

Initialization subscribes once before restoring. Late restore/validation results
cannot replace newer Auth state. Repeated identical events and duplicate listener
registration are suppressed. Subscribers run in a later task, outside the SDK
Auth callback, and must unsubscribe during their own cleanup. `dispose()` affects
only this controller, not the shared SDK's refresh lifecycle or stored session.
`PASSWORD_RECOVERY` has the distinct `password_recovery` status and remains so
across same-session updates/refreshes until sign-out. Phase 5 starts this lifecycle
before verification; the email confirmation callback still accepts only `type=email`.

Local session/user information is for interface state only. Security-sensitive
callers use `validateUser()` and database RLS/grants remain the real data boundary.
Local sign-out does not instantly revoke previously issued JWTs at the server.

Redirects accept only `/studyo.html`, `/karsilastirma.html`, `/profil.html`.
Absolute URLs (even same-origin), encoded paths, backslashes, queries, fragments
and other paths return null. Callers can choose a fixed allowed fallback; never
navigate to the rejected original value. Future query support needs its own
allowlist and tests.

## Verification and deployment boundary

`npm test` includes fake-client lifecycle tests, real-SDK/mocked-HTTP integration,
and Phase 1 PGlite tests proving authenticated catalogue SELECT permissions and
profiles ownership. No production Auth request or real account is needed.
Browser output is generated only by `npm run build`.

Phase 1 migrations are not applied to production by this work. Authenticated
catalogue access requires those grants/policies before a future production login
rollout. Frontend fallback is not proof that production permissions are ready.
Phase 3 draft isolation helpers and Phase 4–5 Auth UI are local implementations;
protected-route wiring remains a later phase. Production SQL, Auth
settings/templates, secrets and deployment require separate explicit approval.

## SEC2.2 Google sign-in — manual setup (not done; production stays off until approved)

The app shows "Google ile devam et" only when `GET /auth/v1/settings` reports `external.google = true`, so
nothing changes for users until the provider is enabled in Supabase. The Google client secret lives only in
the Supabase dashboard: never in Git, Netlify or the browser bundle.

**Order:**
1. Apply the `account_limits` and `terms_acceptance` migrations (approval). The new site needs `profiles.terms_version`: e-mail registration and onboarding record it, so without it new profiles cannot be created.
2. Deploy the `account-delete` Edge Function (Google reauthentication + captcha forwarding).
3. Deploy the site.
4. Enable Google in Supabase and test.
5. Publish the OAuth app.

`TERMS_VERSION` in `src/lib/auth-validation.js` must equal the effective date of the published Terms.

### 1. Google Cloud Console (Google Auth Platform)
1. Create or choose a project, e.g. "Taktik Stüdyo".
2. **Branding:**
   - App name: Taktik Stüdyo. Support email and developer contact: iletisim@taktikstudyo.com.
   - App home page: `https://taktikstudyo.com`.
   - Privacy policy: `https://taktikstudyo.com/gizlilik-politikasi.html`.
   - Terms: `https://taktikstudyo.com/kullanim-kosullari.html`. Both must be published, not drafts, before the app is published.
   - Authorized domains: `taktikstudyo.com` and `zwhoailuklwtxaaawfaq.supabase.co`.
   - Skip the logo unless you want brand verification.
3. **Audience:** External. Keep it in *Testing* (add your own test accounts) until the legal pages are live, then *Publish app*.
4. **Data access (scopes):** only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are non-sensitive, so no Google verification is needed. The app requests no extra scopes.
5. **Clients → Create client → Web application:**
   - Authorized JavaScript origins: `https://taktikstudyo.com`.
   - Authorized redirect URIs: `https://zwhoailuklwtxaaawfaq.supabase.co/auth/v1/callback`.
   - For a local test client, use a separate one with `http://127.0.0.1:54321/auth/v1/callback`.
   - Copy the client ID and secret straight into Supabase (step 2). Do not store them anywhere else.

### 2. Supabase dashboard (project `zwhoailuklwtxaaawfaq`)
1. **Authentication → Sign In / Providers → Google:**
   - Enable it and paste the client ID and secret.
   - Keep *Skip nonce checks* **off**.
   - Keep *Allow users without an email* **off**.
2. **Authentication → URL Configuration:**
   - Site URL `https://taktikstudyo.com`.
   - Redirect URLs must contain `https://taktikstudyo.com/auth-callback.html`. It is already used for e-mail confirmation and is also the OAuth return page.
3. **Identity linking:**
   - Leave *manual linking* **disabled**.
   - Supabase links a Google identity to an existing account automatically only when the e-mail is verified on both sides.
   - The app never links or merges accounts itself. Profiles are keyed by the Auth user id and usernames are unique, so a sign-in cannot create a duplicate profile.
4. Test with a Google test account:
   - A new user → onboarding asks for a username and Terms acceptance.
   - An existing e-mail user → same account, no new onboarding.
   - A Google-only user → Profil → Hesabımı Sil → "Google ile yeniden doğrula" → delete within 10 minutes.

### 3. Auth CAPTCHA (Turnstile) — only after the updated site and Edge Function are live
1. **Cloudflare Turnstile:**
   - Create a separate *Managed* widget "Taktik Stüdyo Auth" for `taktikstudyo.com`.
   - Put the site key in Netlify as `AUTH_TURNSTILE_SITE_KEY` (public build variable), then redeploy.
2. Check that login, register, forgot-password and account deletion all show the widget.
3. Only then, in **Supabase → Authentication → Attack Protection**, enable CAPTCHA, choose Turnstile and paste that widget's **secret**. Enabling it earlier would block every password sign-in, sign-up, reset and deletion check.
4. Google sign-in itself does not use a captcha. Its abuse is bounded by Google accounts and the Auth rate limits.

Local: `supabase/config.toml` keeps Google disabled, so local tests cover everything except the real Google consent screen.
