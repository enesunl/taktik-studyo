import {confirmationUrl, emailValid, usernameValid, recoveryUrl, emailTokenValid, TERMS_VERSION} from './auth-validation.js';
import {createProfileBootstrap} from './profile-bootstrap.js';
const fail = code => ({ok:false,error:{code}});

// Passed directly to the bundled UI, never attached to window.
// providerSettings: public Auth settings (GET /auth/v1/settings). Google appears only when the project enables it.
export function createAuthPageApi({auth, client, origin, captchaConfigured = false, providerSettings = async () => null}) {
  const resultGuards = new WeakMap();
  function completed(result, current) {
    resultGuards.set(result,current);
    return result;
  }
  async function finishSignIn(result) {
    if (!result.ok) return result;
    const userId = result.user.id;
    const current = () => auth.isCurrentResult(result)
      && auth.getState().status === 'signed_in' && auth.getCurrentUser()?.id === userId;
    if (!current()) return fail('state_changed');
    const ownProfile = createProfileBootstrap(client, id => id === userId && current());
    const profile = await ownProfile();
    if (!current()) return fail('state_changed');
    // Keep the generation guard private; only the pinned identity reaches UI.
    return completed({ok:true,userId,profile},current);
  }
  const captchaCheck = token => !captchaConfigured || (typeof token === 'string' && token.length > 0 && token.length <= 2048);
  return Object.freeze({
    initialize:() => auth.initialize(), getState:() => auth.getState(),
    isCurrentResult:result => resultGuards.get(result)?.() === true,
    async signIn({email,password,captchaToken} = {}) {
      email = typeof email === 'string' ? email.trim() : '';
      if (!emailValid(email) || typeof password !== 'string' || !password) return fail('invalid_form');
      const entered = auth.getState();
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser()) return fail('existing_session');
      if (entered.status !== 'idle' && entered !== auth.getState()) return fail('state_changed');
      if (!captchaCheck(captchaToken)) return fail('captcha_required');
      const result = await auth.signInWithPassword({email,password,captchaToken});
      return finishSignIn(result);
    },
    async signUp({email,password,username,captchaToken,termsAccepted} = {}) {
      email = typeof email === 'string' ? email.trim() : '';
      if (!emailValid(email) || !usernameValid(username) || typeof password !== 'string'
        || password.length < 12) return fail('invalid_form');
      if (termsAccepted !== true) return fail('terms_required');
      const emailRedirectTo = confirmationUrl(origin);
      if (!emailRedirectTo) return fail('callback_origin_not_allowed');
      if (!captchaCheck(captchaToken)) return fail('captcha_required');
      const entered = auth.getState();
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser()) return fail('existing_session');
      if (entered.status !== 'idle' && entered !== auth.getState()) return fail('state_changed');
      // The confirmation field stays in the form; this API never receives it.
      const result = await auth.signUpWithPassword({email,password,username,emailRedirectTo,captchaToken,termsVersion:TERMS_VERSION});
      if (!result.ok) return result;
      const current = () => auth.isCurrentResult(result);
      return current() ? completed(result,current) : fail('state_changed');
    },
    async googleAvailable() {
      try {return (await providerSettings())?.external?.google === true;} catch {return false;}
    },
    async startGoogle() {
      const redirectTo = confirmationUrl(origin);
      if (!redirectTo) return fail('callback_origin_not_allowed');
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser()) return fail('existing_session');
      return auth.startOAuth({redirectTo});
    },
    // Signs in (or reauthenticates the same account); a new Google account gets its profile in onboarding.
    async completeOAuth(code) {
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      return finishSignIn(await auth.exchangeOAuthCode(code));
    },
    async verifyEmail(tokenHash) {
      const entered = auth.getState();
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser() || auth.getState().status === 'password_recovery') return fail('existing_session');
      if (entered.status !== 'idle' && entered !== auth.getState()) return fail('state_changed');
      const result = await auth.verifyEmailToken(tokenHash);
      return finishSignIn(result);
    },
    async requestPasswordReset({email,captchaToken} = {}) {
      email = typeof email === 'string' ? email.trim() : '';
      if (!emailValid(email)) return fail('invalid_form');
      const redirectTo = recoveryUrl(origin);
      if (!redirectTo) return fail('recovery_invalid');
      if (!captchaCheck(captchaToken)) return fail('captcha_required');
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser() || auth.getState().status === 'password_recovery') return fail('existing_session');
      return auth.requestPasswordReset({email,redirectTo,captchaToken});
    },
    async completePasswordRecovery({tokenHash,password} = {}) {
      if (!emailTokenValid(tokenHash)) return fail('recovery_invalid');
      if (typeof password !== 'string' || password.length < 12) return fail('invalid_form');
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser() || auth.getState().status === 'password_recovery') return fail('existing_session');
      // Credential reset never bootstraps a profile.
      return auth.completePasswordRecovery({tokenHash,password});
    },
  });
}
