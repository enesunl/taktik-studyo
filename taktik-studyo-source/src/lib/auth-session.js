import {usernameValid, emailValid, emailTokenValid, confirmationUrlValid, recoveryUrlValid} from './auth-validation.js';
import {isAuthApiError, isAuthSessionMissingError} from '@supabase/supabase-js';
// Verified against auth-js 2.116.0 error-codes.ts and Supabase Auth error docs.
// Unknown errors (including bare 401/403) are non-destructive validation failures.
const invalidSessionCodes = new Set(['session_not_found','session_expired','bad_jwt',
  'user_not_found','refresh_token_not_found','refresh_token_already_used']);
const invalidSessionError = error => isAuthSessionMissingError(error)
  || (isAuthApiError(error) && invalidSessionCodes.has(error.code));
const failure = code => Object.freeze({ok:false, error:Object.freeze({code})});
const success = value => Object.freeze({ok:true, ...value});
const userView = user => user && typeof user.id === 'string' && user.id
  ? Object.freeze({id:user.id, email:typeof user.email === 'string' ? user.email : null,
    emailConfirmedAt:typeof user.email_confirmed_at === 'string' ? user.email_confirmed_at : null})
  : null;

// SDK owns session persistence and token refresh. This controller keeps only a
// UI identity snapshot; it is never an authorization proof. RLS remains decisive.
export function createAuthSession(client, createRecoveryClient = null) {
  let state = Object.freeze({status:'idle', user:null, event:null});
  let subscription = null, pending = null, epoch = 0, revision = 0, liveEvent = false;
  let identityRevision = 0;
  const resultGuards = new WeakMap();
  let recovery = null, recoveryBusy = false;
  const listeners = new Map();
  const invalidators = new Set();
  function captureIdentity() {
    const generation = epoch, version = identityRevision, id = state.user?.id, status = state.status;
    return () => epoch === generation && identityRevision === version
      && state.user?.id === id && state.status === status;
  }
  function trackResult(result) {
    resultGuards.set(result,captureIdentity());
    return result;
  }
  const isCurrentResult = result => resultGuards.get(result)?.() === true;
  function beginSignIn() {
    const generation = epoch, version = identityRevision, id = state.user?.id;
    const unchanged = captureIdentity();
    // Only the operation's first signed-out -> returned-user transition is allowed.
    // A -> B -> A cannot regain ownership just because the final id matches.
    return {unchanged, accepts:user => unchanged() || (!id && epoch === generation
      && identityRevision === version + 1 && state.status === 'signed_in'
      && state.user?.id === user?.id)};
  }
  function notify(listener, marker, snapshot, generation) {
    // Do not run consumer Auth calls inside the SDK's synchronous callback/lock.
    setTimeout(() => {
      if (epoch !== generation || listeners.get(listener) !== marker) return;
      try { Promise.resolve(listener(snapshot)).catch(() => {}); } catch {}
    }, 0);
  }
  function publish(user, event) {
    const currentUser = userView(user);
    // Also retain recovery classification for an event broadcast by another tab.
    if (!recovery && event === 'PASSWORD_RECOVERY' && currentUser)
      recovery = {userId:currentUser.id,changed:false,phase:'external'};
    if (recovery && !recoveryBusy) {
      if (event === 'SIGNED_OUT') {
        if (recovery.phase !== 'cleanup') recovery.changed = true;
        if (!recoveryBusy) recovery = null;
      } else if (currentUser) {
        if (recovery.userId && recovery.userId !== currentUser.id) recovery.changed = true;
        else recovery.userId = currentUser.id;
      }
    }
    const status = recovery && event !== 'SIGNED_OUT' ? 'password_recovery'
      : currentUser ? (event === 'PASSWORD_RECOVERY' ? 'password_recovery' : 'signed_in') : 'signed_out';
    const next = Object.freeze({status, user:currentUser, event});
    if (JSON.stringify(next) === JSON.stringify(state)) return;
    const identityChanged = state.user?.id !== next.user?.id || state.status !== next.status;
    if (identityChanged) identityRevision++;
    state = next;
    // Synchronous privacy teardown only; callbacks must not call async SDK APIs.
    // Ordinary subscribers/validation still run outside the SDK callback lock.
    if (identityChanged) for (const invalidate of invalidators) {try {invalidate();} catch {}}
    for (const [listener, marker] of listeners) notify(listener, marker, state, epoch);
  }
  function initialize() {
    if (pending) return pending;
    if (!client) return Promise.resolve(failure('auth_unavailable'));
    const generation = epoch, start = revision;
    // Defer setup so pending is assigned even for synchronously emitting fakes.
    pending = Promise.resolve().then(async () => {
      try {
        if (generation !== epoch) return failure('state_changed');
        if (!subscription) {
          subscription = client.auth.onAuthStateChange((event, session) => {
            if (generation !== epoch) return;
            if (!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED','PASSWORD_RECOVERY'].includes(event)) return;
            if (event === 'INITIAL_SESSION' && liveEvent) return;
            if (event !== 'INITIAL_SESSION') liveEvent = true;
            if (recoveryBusy && recovery) {
              // Only main-client events enter this snapshot. Dedicated recovery
              // events never publish a user into normal application Auth state.
              recovery.mainUser = event === 'SIGNED_OUT' ? null : userView(session?.user);
              recovery.mainEvent = event;
              if (recovery.mainUser || event === 'SIGNED_OUT') recovery.changed = true;
            }
            revision++;
            publish(event === 'SIGNED_OUT' ? null : session?.user, event);
          }).data.subscription;
        }
        const result = await client.auth.getSession();
        if (generation !== epoch) return failure('state_changed');
        // A late restore must not resurrect a session after logout/account change.
        if (revision === start) {
          if (result.error) return failure('session_restore_failed');
          publish(result.data?.session?.user, 'INITIAL_SESSION');
        }
        return success({state});
      } catch { return failure('session_restore_failed'); }
    }).then(result => {
      if (!result.ok && generation === epoch) {
        subscription?.unsubscribe(); subscription = null; pending = null;
      }
      return result;
    });
    return pending;
  }
  async function signInWithPassword(credentials) {
    const entered = state.status === 'idle' ? null : captureIdentity();
    const ready = await initialize();
    if (!ready.ok) return ready;
    if (entered && !entered()) return failure('state_changed');
    if (state.user || recoveryBusy || recovery) return failure('existing_session');
    if (!credentials || typeof credentials.email !== 'string' || !credentials.email.trim()
      || typeof credentials.password !== 'string' || !credentials.password) return failure('invalid_credentials');
    const generation = epoch, start = revision;
    const operation = beginSignIn();
    try {
      const options = typeof credentials.captchaToken === 'string' ? {captchaToken:credentials.captchaToken} : undefined;
      const result = await client.auth.signInWithPassword({email:credentials.email, password:credentials.password, ...(options ? {options} : {})});
      if (generation !== epoch || !operation.accepts(result.data?.user)) return failure('state_changed');
      if (isAuthApiError(result.error) && result.error.code === 'email_not_confirmed') return failure('email_not_confirmed');
      if (result.error || !result.data?.session || !userView(result.data.user)) return failure('sign_in_failed');
      if (revision === start) { revision++; liveEvent = true; publish(result.data.user, 'SIGNED_IN'); }
      else if (state.user?.id !== result.data.user.id) return failure('state_changed');
      // A session from the password endpoint is not proof of email confirmation.
      const verified = await validateUser(result.data.user.id);
      return verified.ok && !isCurrentResult(verified) ? failure('state_changed') : verified;
    } catch { return failure(operation.unchanged() ? 'sign_in_failed' : 'state_changed'); }
  }
  async function signOut() {
    const ready = await initialize();
    if (!ready.ok) return ready;
    const generation = epoch, start = revision;
    try {
      const result = await client.auth.signOut({scope:'local'});
      if (generation !== epoch) return failure('state_changed');
      if (result.error) return failure('sign_out_failed');
      if (revision === start) { revision++; liveEvent = true; publish(null, 'SIGNED_OUT'); }
      else if (state.user) return failure('state_changed');
      return success({state});
    } catch { return failure('sign_out_failed'); }
  }
  async function validateUser(expectedId) {
    const entered = state.status === 'idle' ? null : captureIdentity();
    const ready = await initialize();
    if (!ready.ok) return ready;
    if (entered && !entered()) return failure('state_changed');
    const generation = epoch, start = revision, id = state.user?.id;
    if (expectedId !== undefined && id !== expectedId) return failure('state_changed');
    const unchanged = () => generation === epoch && revision === start && state.user?.id === id;
    // getUser may itself clear a missing session. Accept only a single SIGNED_OUT
    // transition; A -> B (even B -> signed_out) must invalidate A's result.
    const sdkCleared = () => generation === epoch && revision === start + 1
      && state.status === 'signed_out' && !state.user && state.event === 'SIGNED_OUT';
    let cleaning = false;
    try {
      // Always ask Auth server; never accept the restored local user as proof.
      const result = await client.auth.getUser();
      const invalid = invalidSessionError(result.error);
      if (invalid && sdkCleared()) return failure('unauthenticated');
      if (!unchanged()) return failure('state_changed');
      if (result.error && !invalid) return failure('user_validation_failed');
      const user = userView(result.data?.user);
      // Only same-identity server evidence may trigger unconfirmed-user cleanup.
      if (!invalid && !user) return failure(id ? 'user_validation_failed' : 'unauthenticated');
      if (!invalid && user.id !== id) return failure('state_changed');
      // This application supports email Auth only. Do not fall back to the
      // phone-capable confirmed_at or user_metadata confirmation flags.
      const rejected = invalid ? 'unauthenticated' : !user.emailConfirmedAt ? 'email_not_confirmed' : null;
      if (rejected) {
        if (!unchanged()) return failure('state_changed');
        if (recoveryBusy || state.status === 'password_recovery') return failure('state_changed');
        // Read through the public SDK, never internal storage. This also catches
        // another tab's replacement session before its Auth event is delivered.
        const local = await client.auth.getSession();
        if (sdkCleared()) return trackResult(failure(rejected));
        if (!unchanged() || (local.data?.session?.user?.id && local.data.session.user.id !== id)) return failure('state_changed');
        if (local.error) return failure('user_validation_failed');
        // No await between the last identity/generation check and SDK dispatch.
        cleaning = true;
        const cleaned = await client.auth.signOut({scope:'local'});
        if (!unchanged() && !sdkCleared()) return failure('state_changed');
        if (cleaned.error) return failure('session_cleanup_failed');
        if (unchanged()) {revision++; liveEvent = true; publish(null,'SIGNED_OUT');}
        return trackResult(failure(rejected));
      }
      return trackResult(success({user}));
    } catch {
      if (!unchanged() && !sdkCleared()) return failure('state_changed');
      return failure(cleaning ? 'session_cleanup_failed' : 'user_validation_failed');
    }
  }
  async function signUpWithPassword({email, password, username, emailRedirectTo, captchaToken} = {}) {
    if (typeof email !== 'string' || !emailValid(email.trim()) || !usernameValid(username) || typeof password !== 'string'
      || password.length < 12 || !confirmationUrlValid(emailRedirectTo)) return failure('invalid_form');
    const entered = state.status === 'idle' ? null : captureIdentity();
    const ready = await initialize();
    if (!ready.ok) return ready;
    if (entered && !entered()) return failure('state_changed');
    if (state.user || recoveryBusy || recovery) return failure('existing_session');
    const generation = epoch;
    const operation = beginSignIn();
    try {
      const result = await client.auth.signUp({email:email.trim(), password,
        options:{data:{username}, emailRedirectTo, ...(typeof captchaToken === 'string' ? {captchaToken} : {})}});
      if (generation !== epoch || !(result.data?.session
        ? operation.accepts(result.data.user) : operation.unchanged())) return failure('state_changed');
      // Supabase can obfuscate existing accounts; do not disclose account existence.
      if (result.error && !['user_already_exists','email_exists'].includes(result.error.code)) return failure('sign_up_failed');
      // Never infer confirmation from signUp data. Unexpected sessions must also
      // pass server validation; an unconfirmed own session is cleaned locally.
      if (result.data?.session && userView(result.data.user)) {
        if (state.user?.id !== result.data.user.id) return failure('state_changed');
        const verified = await validateUser(result.data.user.id);
        if (!verified.ok && verified.error.code !== 'email_not_confirmed') return verified;
        if (!isCurrentResult(verified)) return failure('state_changed');
      }
      return trackResult(success({status:'confirmation_pending'}));
    } catch { return failure(operation.unchanged() ? 'sign_up_failed' : 'state_changed'); }
  }
  async function verifyEmailToken(tokenHash) {
    if (!emailTokenValid(tokenHash)) return failure('confirmation_invalid');
    const entered = state.status === 'idle' ? null : captureIdentity();
    const ready = await initialize();
    if (!ready.ok) return ready;
    if (entered && !entered()) return failure('state_changed');
    // Recheck at click time as well as page load; never silently replace a session.
    if (state.user || recoveryBusy || recovery) return failure('existing_session');
    const generation = epoch, start = revision;
    const operation = beginSignIn();
    try {
      const result = await client.auth.verifyOtp({token_hash:tokenHash, type:'email'});
      if (generation !== epoch || !operation.accepts(result.data?.user)) return failure('state_changed');
      if (result.error || !result.data?.session || !userView(result.data.user)) return failure('confirmation_failed');
      if (revision === start) {revision++; liveEvent = true; publish(result.data.user, 'SIGNED_IN');}
      else if (state.user?.id !== result.data.user.id) return failure('state_changed');
      const verified = await validateUser(result.data.user.id);
      return verified.ok && !isCurrentResult(verified) ? failure('state_changed') : verified;
    } catch { return failure(operation.unchanged() ? 'confirmation_failed' : 'state_changed'); }
  }
  async function requestPasswordReset({email, redirectTo, captchaToken} = {}) {
    if (typeof email !== 'string' || !emailValid(email.trim()) || !recoveryUrlValid(redirectTo)) return failure('invalid_form');
    const ready = await initialize(); if (!ready.ok) return ready;
    if (state.user || state.status === 'password_recovery' || recoveryBusy) return failure('existing_session');
    const generation = epoch;
    try {
      const result = await client.auth.resetPasswordForEmail(email.trim(), {redirectTo,
        ...(typeof captchaToken === 'string' ? {captchaToken} : {})});
      if (generation !== epoch) return failure('state_changed');
      // Account-specific errors receive the same response as an obfuscated success.
      if (result.error && !['user_not_found','identity_not_found','email_exists','user_already_exists'].includes(result.error.code))
        return failure('recovery_request_failed');
      return success({status:'recovery_requested'});
    } catch { return failure('recovery_request_failed'); }
  }
  async function completePasswordRecovery({tokenHash, password} = {}) {
    if (!emailTokenValid(tokenHash)) return failure('recovery_invalid');
    if (typeof password !== 'string' || password.length < 12) return failure('invalid_form');
    const ready = await initialize(); if (!ready.ok) return ready;
    if (state.user || state.status === 'password_recovery' || recoveryBusy) return failure('existing_session');
    const generation = epoch;
    if (typeof createRecoveryClient !== 'function') return failure('auth_unavailable');
    // Re-read through the public SDK API before consuming a token; another tab's
    // persistent login may be visible before its Auth event is delivered here.
    try {
      const main = await client.auth.getSession();
      if (generation !== epoch || main.error) return failure('state_changed');
      if (main.data?.session?.user || state.user || recoveryBusy || state.status === 'password_recovery') return failure('existing_session');
    } catch {return failure('recovery_failed');}
    const operation = {userId:null,changed:false,phase:'verify',mainUser:null,mainEvent:'SIGNED_OUT'};
    recovery = operation; recoveryBusy = true;
    revision++; liveEvent = true; publish(null,'RECOVERY_STARTED');
    const current = () => generation === epoch && recovery === operation;
    let recoveryUserId = null;
    const ownsSession = () => !!operation.userId && recoveryUserId === operation.userId;
    const canUpdate = () => current() && ownsSession() && !operation.changed && !state.user;
    let dedicated = null, recoverySubscription = null, transport = null;
    let code = 'recovery_failed', passwordUpdated = false;
    try {
      dedicated = createRecoveryClient();
      if (dedicated?.client === client) dedicated = null;
      if (!dedicated?.client) throw new Error('Dedicated recovery client required');
      recoverySubscription = dedicated.client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        const identity = event === 'SIGNED_OUT' ? null : userView(session?.user);
        recoveryUserId = identity?.id || null;
        if (event === 'SIGNED_OUT') {
          if (operation.phase !== 'cleanup') operation.changed = true;
        } else if (identity) {
          if (operation.userId && operation.userId !== identity.id) operation.changed = true;
          else operation.userId = identity.id;
        }
      }).data.subscription;
      transport = dedicated.transport.begin({
        canVerify:() => current() && !operation.changed && !state.user && operation.phase === 'verify',
        canMutate:() => ownsSession() && (operation.phase === 'cleanup' || canUpdate()),
        onBlocked:() => {operation.changed = true; operation.transportBlocked = true;},
      });
      const result = await dedicated.client.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
      tokenHash = null;
      transport?.authorize(result.data?.session?.access_token);
      if (userView(result.data?.user) && result.data?.session?.user?.id === result.data.user.id) {
        if (operation.userId && operation.userId !== result.data.user.id) operation.changed = true;
        operation.userId = result.data.user.id;
      }
      if (!current() || operation.changed) code = 'state_changed';
      else if (!result.error && result.data?.session && userView(result.data.user)
        && result.data.session.user?.id === result.data.user.id) {
        const id = result.data.user.id;
        const recovered = await dedicated.client.auth.getSession();
        recoveryUserId = recovered.data?.session?.user?.id || null;
        // Public SDK read catches a main-storage switch whose event is delayed.
        const main = await client.auth.getSession();
        if (main.data?.session?.user) {
          operation.mainUser = userView(main.data.session.user); operation.mainEvent = 'SIGNED_IN';
          operation.changed = true;
        }
        if (recovered.error || main.error || !current() || operation.changed || recoveryUserId !== id) {
          operation.changed = true; code = 'state_changed';
        }
        else {
          if (!canUpdate()) code = 'state_changed';
          else {
            operation.phase = 'update'; code = 'password_update_failed';
            const updated = await dedicated.client.auth.updateUser({password});
            if (!canUpdate()) code = 'state_changed';
            else if (!updated.error && updated.data?.user?.id === id) {passwordUpdated = true; code = null;}
            else if (!updated.error) {operation.changed = true; code = 'state_changed';}
          }
        }
      }
    } catch { if (!current() || operation.changed) code = 'state_changed'; }
    finally {tokenHash = null; password = null;}
    // Cleanup is isolated even if the main client changed account or was disposed.
    try {
      if (ownsSession() && !operation.transportBlocked) {
        operation.phase = 'cleanup';
        let cleaned = false;
        try {
          const result = await dedicated.client.auth.signOut({scope:'local'});
          if (!result.error && (!recoveryUserId || recoveryUserId === operation.userId)) cleaned = true;
        } catch {}
        if (!cleaned) return Object.freeze({...failure('recovery_cleanup_failed'),passwordUpdated});
      } else if (!current() || operation.changed || recoveryUserId) return failure('state_changed');
      if (!current() || operation.changed) return failure('state_changed');
      return code ? failure(code) : success({status:'password_updated'});
    } finally {
      transport?.release();
      recoverySubscription?.unsubscribe();
      // Public SDK lifecycle cleanup, not manual token/storage manipulation.
      try {await dedicated?.client?.auth.dispose();} catch {}
      recoveryBusy = false;
      if (current()) {
        recovery = null; revision++;
        const mainUser = operation.mainUser;
        publish(mainUser ? {...mainUser,email_confirmed_at:mainUser.emailConfirmedAt} : null,operation.mainEvent);
      }
      // Dropping this dedicated memory-only client cannot seed a future main
      // INITIAL_SESSION, even when signOut failed or the page crashed earlier.
    }
  }
  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Expected listener');
    if (!listeners.has(listener)) {
      const marker = {};
      listeners.set(listener, marker);
      notify(listener, marker, state, epoch);
    }
    const marker = listeners.get(listener);
    return () => { if (listeners.get(listener) === marker) listeners.delete(listener); };
  }
  function dispose() {
    epoch++; revision++; liveEvent = false;
    recovery = null;
    subscription?.unsubscribe(); subscription = null; pending = null;
    for (const invalidate of invalidators) {try {invalidate();} catch {}}
    invalidators.clear(); listeners.clear(); state = Object.freeze({status:'idle', user:null, event:null});
    // No signOut, storage clearing or SDK shutdown: client is shared with catalogue.
  }
  return Object.freeze({initialize, getState:() => state, getCurrentUser:() => state.user, isCurrentResult,
    onInvalidate(callback) {invalidators.add(callback); return () => invalidators.delete(callback);},
    signInWithPassword, signUpWithPassword, verifyEmailToken, requestPasswordReset, completePasswordRecovery,
    signOut, subscribe, validateUser, dispose});
}
