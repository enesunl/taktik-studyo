import {createUserDraftScope} from './draft-scope.js';
import {loginUrl} from './auth-redirects.js';

// UX/privacy guard. Server JWT/RLS remain the backend authorization boundary.
export function createProtectedPage({auth, storage, path, mount, show, navigate, drafts = true, beforeMount}) {
  let generation = 0, stopped = false, signingOut = false, logoutBlocked = false, scope = null, cleanup = null;
  let observed = null, off = null, offInvalidate = () => {};
  let validations = 0;
  const identity = () => {
    const state = auth.getState();
    return state.status === 'signed_in' ? state.user?.id || null : null;
  };
  const snapshot = () => auth.getState().status + ':' + (auth.getState().user?.id || '');
  function clear() {
    generation++; show('pending');
    scope?.dispose(); scope = null;
    const unmount = cleanup; cleanup = null; unmount?.();
  }
  async function check(force = false) {
    if (stopped || signingOut || logoutBlocked) return;
    // SDK cleanup can emit SIGNED_OUT before returning its error/result. Wait
    // for validation to confirm cleanup instead of racing it with a redirect.
    if (validations && auth.getState().status === 'signed_out') return;
    const key = snapshot();
    if (!force && observed === key) return;
    observed = key; clear();
    const id = identity(), turn = generation;
    if (!id) {navigate(loginUrl(path)); return;}
    const current = () => !stopped && !signingOut && turn === generation && identity() === id;
    let authVerified = false;
    try {
      let verified;
      validations++;
      try {verified = await auth.validateUser();} finally {validations--;}
      if (stopped || signingOut || logoutBlocked) return;
      const cleared = auth.getState().status === 'signed_out' && !auth.getState().user;
      if (!verified.ok && cleared && ['unauthenticated','email_not_confirmed','session_cleanup_failed'].includes(verified.error?.code)) {
        observed = snapshot();
        if (verified.error.code === 'unauthenticated') navigate(loginUrl(path));
        else if (verified.error.code === 'email_not_confirmed') navigate(loginUrl(path) + '&reason=email_not_confirmed');
        else {logoutBlocked = true; show('error');}
        return;
      }
      if (!current()) return;
      if (!verified.ok) {
        show('error');
        return;
      }
      if (verified.user?.id !== id) {show('error'); return;}
      authVerified = true;
      const validatedUser = Object.freeze({id,email:verified.user.email || null});
      if (beforeMount) {
        const redirect = await beforeMount({validatedUser,current});
        if (!current()) return;
        if (redirect) {navigate(redirect);return;}
      }
      const next = drafts ? createUserDraftScope({userId:id,storage,isCurrent:current}) : null;
      if (drafts && !next) {show('page_error'); return;}
      scope = next;
      // Only an empty shell/import decision is visible until mount completes.
      show('ready');
      const unmount = await mount(next,current,validatedUser);
      if (!current()) {unmount?.(); return;}
      cleanup = unmount;
    } catch {if (current()) {clear(); show(authVerified ? 'page_error' : 'error');}}
  }
  async function start() {
    clear();
    offInvalidate = auth.onInvalidate?.(() => {if (!stopped) {observed = null; clear();}}) || (() => {});
    const result = await auth.initialize();
    if (stopped) return;
    if (!result.ok) {show('error'); return;}
    off = auth.subscribe(() => {void check();});
    await check();
  }
  async function retry() {
    if (stopped || signingOut) return;
    logoutBlocked = false;
    const result = await auth.initialize();
    if (stopped) return;
    if (!result.ok) {show('error'); return;}
    if (!off) off = auth.subscribe(() => {void check();});
    await check(true);
  }
  async function signOut() {
    if (stopped || signingOut) return;
    signingOut = true; logoutBlocked = true; clear();
    try {
      const result = await auth.signOut();
      if (stopped) return;
      if (result.ok) navigate('/giris.html');
      else show('logout_error');
    } catch {if (!stopped) show('logout_error');}
    finally {signingOut = false; observed = null;}
  }
  function dispose() {if (stopped) return; stopped = true; off?.(); offInvalidate(); clear();}
  return Object.freeze({start,retry,signOut,dispose});
}
