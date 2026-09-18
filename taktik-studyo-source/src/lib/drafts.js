import { stateValid } from './validation.js';
export const DRAFT_VERSION = 1;
export const DRAFT_BYTES = 1048576;
export function readDraft(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > DRAFT_BYTES) return null;
    const data = JSON.parse(raw);
    return data.version === DRAFT_VERSION && stateValid(data.state) ? data.state : null;
  } catch { return null; }
}
export function writeDraft(storage, key, state) {
  try {
    if (!stateValid(state)) return false;
    const raw = JSON.stringify({version:DRAFT_VERSION, savedAt:Date.now(), state});
    if (raw.length > DRAFT_BYTES) return false;
    storage.setItem(key,raw);
    return true;
  } catch { return false; }
}
