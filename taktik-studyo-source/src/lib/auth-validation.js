export const usernameValid = value => typeof value === 'string' && value.length >= 3 && value.length <= 24 && !/[^A-Za-z0-9_]/.test(value);
export const emailValid = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const emailTokenValid = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\s\u0000-\u001f\u007f-\u009f]/u.test(value);
const callbackUrls = new Map([
  ['https://taktikstudyo.com','https://taktikstudyo.com/auth-callback.html'],
  ['http://localhost:4173','http://localhost:4173/auth-callback.html'],
]);
export const confirmationUrl = origin => callbackUrls.get(origin) || null;
export const confirmationUrlValid = url => [...callbackUrls.values()].includes(url);
const recoveryUrls = new Map([
  ['https://taktikstudyo.com','https://taktikstudyo.com/sifre-yenile.html'],
  ['http://localhost:4173','http://localhost:4173/sifre-yenile.html'],
]);
export const recoveryUrl = origin => recoveryUrls.get(origin) || null;
export const recoveryUrlValid = url => [...recoveryUrls.values()].includes(url);

export function consumeRecoveryLink(location, history) {
  const search = location.search;
  try { history.replaceState(null, '', location.pathname); }
  catch { return {ok:false, error:{code:'recovery_invalid'}}; }
  try { decodeURIComponent(search); }
  catch { return {ok:false, error:{code:'recovery_invalid'}}; }
  const params = new URLSearchParams(search);
  if ([...params.keys()].length !== 2 || params.getAll('token_hash').length !== 1
    || params.getAll('type').length !== 1 || params.get('type') !== 'recovery'
    || !emailTokenValid(params.get('token_hash'))) return {ok:false, error:{code:'recovery_invalid'}};
  return {ok:true, tokenHash:params.get('token_hash')};
}

// Parse then clean synchronously, before any async initialization. No storage/logging.
export function consumeEmailLink(location, history) {
  const search = location.search;
  try { history.replaceState(null, '', location.pathname); }
  catch { return {ok:false, error:{code:'confirmation_invalid'}}; }
  try { decodeURIComponent(search); }
  catch { return {ok:false, error:{code:'confirmation_invalid'}}; }
  const params = new URLSearchParams(search);
  if ([...params.keys()].length !== 2 || params.getAll('token_hash').length !== 1
    || params.getAll('type').length !== 1 || params.get('type') !== 'email'
    || !emailTokenValid(params.get('token_hash'))) return {ok:false, error:{code:'confirmation_invalid'}};
  return {ok:true, tokenHash:params.get('token_hash')};
}
