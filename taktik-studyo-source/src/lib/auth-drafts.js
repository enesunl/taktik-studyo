import {createUserDraftScope, userDraftKey} from './draft-scope.js';

// Opt-in bootstrap hook for the future protected pages. Not called by today's
// public main/comparison/shared bootstrap. mount(scope) returns DOM/listener cleanup.
export function bindAuthenticatedDrafts({auth, storage, mount}) {
  let scope = null, mountedId = null, unmount = null, off = null, stopped = false, pending = null;
  const identity = () => {
    if (auth.getState().status !== 'signed_in') return null;
    const id = auth.getCurrentUser()?.id;
    return userDraftKey(id, 'main') ? id : null;
  };
  function clear() {
    scope?.dispose(); scope = null; mountedId = null;
    const cleanup = unmount; unmount = null; cleanup?.();
  }
  function sync() {
    if (stopped) return;
    // Resample current Auth state rather than trusting a queued old notification.
    const id = identity();
    if (id && id === mountedId && scope?.isActive()) return;
    clear(); if (!id) return;
    const next = createUserDraftScope({userId:id, storage, isCurrent:() => !stopped && identity() === id});
    scope = next; mountedId = id;
    try {
      const cleanup = mount(next);
      if (typeof cleanup !== 'function') throw new Error('Draft mount must return cleanup');
      unmount = cleanup;
    } catch (error) { clear(); throw error; }
  }
  function start() {
    if (pending) return pending;
    if (stopped) return Promise.resolve({ok:false, code:'disposed'});
    off = auth.subscribe(sync);
    pending = auth.initialize().then(result => {
      if (stopped) return {ok:false, code:'disposed'};
      if (!result.ok) { off?.(); off = null; clear(); return result; }
      sync(); return {ok:true};
    });
    return pending;
  }
  function dispose() { if (stopped) return; stopped = true; off?.(); off = null; clear(); }
  return Object.freeze({start, dispose});
}
