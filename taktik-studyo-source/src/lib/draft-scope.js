import {readDraft, writeDraft} from './drafts.js';

export const legacyDraftKeys = Object.freeze({
  main:'taktik:draft:main:v1',
  left:'taktik:draft:comparison:left:v1',
  right:'taktik:draft:comparison:right:v1',
});
const slots = Object.keys(legacyDraftKeys);
// Canonical RFC UUID, including modern UUID versions; never a DOM/query/metadata ID.
export function userDraftKey(userId, slot) {
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)
    || !slots.includes(slot)) return null;
  return 'taktik:draft:'+userId+':'+(slot === 'main' ? 'main' : 'comparison:'+slot)+':v2';
}

// Caller supplies only Auth user.id, never a token/session. Each scope is immutable.
export function createUserDraftScope({userId, storage, isCurrent = () => true}) {
  if (!userDraftKey(userId, 'main')) return null;
  let disposed = false;
  const cleanups = new Set();
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cleanup of [...cleanups]) { try { cleanup(); } catch {} }
    cleanups.clear();
  }
  function active() {
    if (disposed) return false;
    try { if (isCurrent()) return true; } catch {}
    dispose(); return false;
  }
  function onDispose(callback) {
    if (!active()) { callback(); return () => {}; }
    cleanups.add(callback); return () => cleanups.delete(callback);
  }
  function context(slot) {
    const key = userDraftKey(userId, slot);
    if (!key || !active()) return null;
    return Object.freeze({key, isActive:active, onDispose,
      read:() => active() ? readDraft(storage, key) : null,
      createWriter({getState, canSave = () => true, eventTarget = globalThis.window,
        setTimer = setTimeout, clearTimer = clearTimeout}) {
        let stopped = false, timer = null, generation = 0;
        const cancel = () => { generation++; if (timer !== null) clearTimer(timer); timer = null; };
        const flush = () => {
          cancel();
          if (stopped || !active()) return false;
          try { return canSave() && writeDraft(storage, key, getState()); } catch { return false; }
        };
        const schedule = () => {
          cancel(); if (stopped || !active()) return;
          const scheduled = generation;
          timer = setTimer(() => { if (!stopped && scheduled === generation) flush(); }, 250);
        };
        const pagehide = () => { flush(); };
        let off = () => {};
        const stop = () => {
          if (stopped) return;
          stopped = true; cancel(); eventTarget?.removeEventListener('pagehide', pagehide); off();
        };
        if (active()) {
          eventTarget?.addEventListener('pagehide', pagehide);
          off = onDispose(stop);
        } else stopped = true;
        return Object.freeze({schedule, flush, cancel, dispose:stop});
      },
    });
  }
  function inspectLegacy() {
    if (!active()) return {ok:false, code:'inactive_scope'};
    try {
      return {ok:true, slots:slots.map(slot => ({slot,
        legacyExists:storage.getItem(legacyDraftKeys[slot]) != null,
        legacyValid:readDraft(storage, legacyDraftKeys[slot]) !== null,
        targetExists:storage.getItem(userDraftKey(userId, slot)) != null,
      }))};
    } catch { return {ok:false, code:'storage_unavailable'}; }
  }
  function importLegacy(slot, {confirmed = false} = {}) {
    if (!active()) return {ok:false, code:'inactive_scope'};
    if (!slots.includes(slot)) return {ok:false, code:'invalid_slot'};
    if (confirmed !== true) return {ok:false, code:'confirmation_required'};
    const key = userDraftKey(userId, slot);
    try {
      // Even a corrupt existing destination is preserved: never silently overwrite.
      if (storage.getItem(key) != null) return {ok:true, status:'skipped_existing'};
      const state = readDraft(storage, legacyDraftKeys[slot]);
      if (!state) return {ok:false, code:'invalid_source'};
      if (!active()) return {ok:false, code:'inactive_scope'};
      // Narrow the race window; localStorage has no atomic compare-and-set.
      if (storage.getItem(key) != null) return {ok:true, status:'skipped_existing'};
      return writeDraft(storage, key, state) ? {ok:true, status:'imported'} : {ok:false, code:'write_failed'};
    } catch { return {ok:false, code:'storage_unavailable'}; }
  }
  return Object.freeze({context, inspectLegacy, importLegacy, dispose, isActive:active});
}
