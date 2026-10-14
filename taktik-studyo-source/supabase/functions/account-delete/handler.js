// ACCOUNT1 self-service account deletion. The target account is ALWAYS the one identified by the verified
// bearer token; the request body may only carry the re-entered password and the typed confirmation.
export const CONFIRMATION = 'HESABIMI SIL';
export const MAX_BODY_BYTES = 2048;
// Every table that stores data owned by an account. All reference auth.users ON DELETE CASCADE.
export const OWNED_TABLES = Object.freeze([
  ['profiles','id'],['studio_projects','user_id'],['player_overrides','user_id'],['weekly_lineups','user_id'],['shared_lineups','owner_id'],
]);

export function accountDeleteOrigins(value = 'https://taktikstudyo.com') {
  const origins = value.split(',').map(s => s.trim());
  if (!origins.length || origins.some(s => {
    if (s === 'http://localhost:4173') return false;
    try {const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || /[*\s\\]/.test(s);} catch {return true;}
  })) throw Error('Invalid account deletion origins');
  return origins;
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {return JSON.parse(text);} catch {return null;}
}

// authenticate(jwt) -> user | null (server-side Auth check)
// verifyPassword({email,password,userId}) -> true | false; throws {code:'rate_limited'} when Auth throttles
// countOwned(userId) -> {[table]: number}; throws when any owned table cannot be checked
// deleteUser(userId) -> resolves on success; throws on failure
export function createAccountDeleteHandler({origins, authenticate, verifyPassword, countOwned, deleteUser}) {
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin, Authorization','X-Content-Type-Options':'nosniff'};
    const reply = (status, body) => new Response(JSON.stringify(body), {status, headers});
    const fail = (status, code) => reply(status, {error:{code}});
    // Browser-only operation: an allowed Origin is required.
    if (!origin || !origins.includes(origin)) return fail(403, 'origin_denied');
    Object.assign(headers, {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type'});
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers});
    if (request.method !== 'POST') return fail(405, 'method_not_allowed');
    if (new URL(request.url).search) return fail(400, 'invalid_request');

    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/.test(authorization)) return fail(401, 'unauthenticated');
    let user = null;
    try {user = await authenticate(authorization.slice(7));} catch {user = null;}
    if (!user?.id || user.is_anonymous || !user.email || !user.email_confirmed_at) return fail(401, 'unauthenticated');

    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'invalid_request');
    // Rejects user_id or any other attempt to choose the target account.
    if (Object.keys(body).some(key => key !== 'password' && key !== 'confirmation')) return fail(400, 'invalid_request');
    if (body.confirmation !== CONFIRMATION) return fail(400, 'confirmation_mismatch');
    if (typeof body.password !== 'string' || !body.password.length || body.password.length > 1024) return fail(400, 'invalid_request');

    try {
      if (!await verifyPassword({email:user.email, password:body.password, userId:user.id})) return fail(403, 'reauthentication_failed');
    } catch (error) {
      return error?.code === 'rate_limited' ? fail(429, 'rate_limited') : fail(503, 'reauthentication_unavailable');
    }

    // Preflight: refuse to delete anything unless every owned table (including share ownership) is checkable.
    try {await countOwned(user.id);} catch {return fail(503, 'deletion_unavailable');}
    try {await deleteUser(user.id);} catch {return fail(500, 'delete_failed');}
    // Success is reported only after the cascades are confirmed.
    try {
      const remaining = await countOwned(user.id);
      if (Object.values(remaining).some(count => count !== 0)) return fail(500, 'verification_failed');
    } catch {return fail(500, 'verification_failed');}
    return reply(200, {deleted:true});
  };
}
