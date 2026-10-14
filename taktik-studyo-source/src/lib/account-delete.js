// ACCOUNT1 client side. The browser only proves identity (session JWT + re-entered password);
// the server derives the target account from the verified token. No user id is ever sent.
export const ACCOUNT_DELETE_CONFIRMATION = 'HESABIMI SIL';

export function createAccountDeletion({client, url, key, fetcher = (input, init) => fetch(input, init)}) {
  async function deleteAccount({password, confirmation}) {
    if (!client || !url || !key) return {ok:false, code:'unavailable'};
    let token = null;
    try {token = (await client.auth.getSession()).data?.session?.access_token || null;} catch {}
    if (!token) return {ok:false, code:'unauthenticated'};
    let response;
    try {
      response = await fetcher(url + '/functions/v1/account-delete', {method:'POST',
        headers:{'Content-Type':'application/json', apikey:key, Authorization:'Bearer ' + token},
        body:JSON.stringify({password, confirmation}), signal:AbortSignal.timeout(20000)});
    } catch {return {ok:false, code:'network'};}
    let body = null;
    try {body = await response.json();} catch {}
    // Success only when the server explicitly confirms the verified deletion.
    if (response.status === 200 && body?.deleted === true) return {ok:true};
    const code = typeof body?.error?.code === 'string' ? body.error.code : response.status === 401 ? 'unauthenticated' : 'unknown';
    return {ok:false, code};
  }
  return Object.freeze({deleteAccount});
}

// Keys written per signed-in user (see draft-scope, studio-autosave and weekly-xi). Device-wide
// preferences (theme, pitch colour/size) and other users' keys are left untouched.
export function userScopedPrefixes(userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId || '')) return [];
  return ['taktik:draft:' + userId + ':', 'taktik:studio:autosave:' + userId + ':', 'taktik:weekly-xi:' + userId + ':', 'taktik:studio:recovery:' + userId + ':'];
}

export function clearUserData({storage, sessionStorage, userId}) {
  const prefixes = userScopedPrefixes(userId);
  let removed = 0;
  for (const store of [storage, sessionStorage]) {
    if (!store || !prefixes.length) continue;
    try {
      const keys = [];
      for (let i = 0; i < store.length; i++) {const k = store.key(i); if (k && prefixes.some(p => k.startsWith(p))) keys.push(k);}
      for (const k of keys) {store.removeItem(k); removed++;}
    } catch {}
  }
  return removed;
}
