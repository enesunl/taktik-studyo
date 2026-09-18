import {confirmationUrl, emailValid, usernameValid} from './auth-validation.js';
import {createProfileBootstrap} from './profile-bootstrap.js';
const fail = code => ({ok:false,error:{code}});

// Passed directly to the bundled UI, never attached to window.
export function createAuthPageApi({auth, client, origin, captchaConfigured = false}) {
  const profile = createProfileBootstrap(client, id => auth.getCurrentUser()?.id === id);
  const captchaCheck = token => !captchaConfigured || (typeof token === 'string' && token.length > 0 && token.length <= 2048);
  return Object.freeze({
    initialize:() => auth.initialize(), getState:() => auth.getState(),
    async signIn({email,password,captchaToken} = {}) {
      email = typeof email === 'string' ? email.trim() : '';
      if (!emailValid(email) || typeof password !== 'string' || !password) return fail('invalid_form');
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser()) return fail('existing_session');
      if (!captchaCheck(captchaToken)) return fail('captcha_required');
      const result = await auth.signInWithPassword({email,password,captchaToken});
      return result.ok ? {ok:true,profile:await profile()} : result;
    },
    async signUp({email,password,username,captchaToken} = {}) {
      email = typeof email === 'string' ? email.trim() : '';
      if (!emailValid(email) || !usernameValid(username) || typeof password !== 'string'
        || password.length < 12) return fail('invalid_form');
      const emailRedirectTo = confirmationUrl(origin);
      if (!emailRedirectTo) return fail('callback_origin_not_allowed');
      if (!captchaCheck(captchaToken)) return fail('captcha_required');
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser()) return fail('existing_session');
      // The confirmation field stays in the form; this API never receives it.
      return auth.signUpWithPassword({email,password,username,emailRedirectTo,captchaToken});
    },
    async verifyEmail(tokenHash) {
      const ready = await auth.initialize(); if (!ready.ok) return ready;
      if (auth.getCurrentUser() || auth.getState().status === 'password_recovery') return fail('existing_session');
      const result = await auth.verifyEmailToken(tokenHash);
      return result.ok ? {ok:true,profile:await profile()} : result;
    },
  });
}
