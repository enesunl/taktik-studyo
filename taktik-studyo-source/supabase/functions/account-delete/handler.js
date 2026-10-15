// ACCOUNT1 self-service account deletion. The target account is ALWAYS the one identified by the verified
// bearer token; the request body may only carry the re-entered password (with an optional captcha token)
// and the typed confirmation.
export const CONFIRMATION = 'HESABIMI SIL';
export const MAX_BODY_BYTES = 4096;
// SEC2.2: a Google-only account (no password) must have signed in with Google within this window.
export const REAUTH_WINDOW_SECONDS = 600;
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

// Server-set providers decide the method. Only an account whose identities are Google and not e-mail has no
// password; everything else (including missing data) keeps the stricter password check.
export function reauthMethod(user) {
  const providers = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
  return providers.includes('google') && !providers.includes('email') ? 'oauth' : 'password';
}
// Claims of a token that authenticate() has already verified with Auth (signature and live session).
export function tokenClaims(jwt) {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')), c => c.charCodeAt(0))));
  } catch {return null;}
}
// amr timestamps are set when the user authenticates and are kept when a session refreshes its token,
// so possession of an old session token is not enough: it needs a fresh Google sign-in.
export function recentOAuth(claims, nowSeconds, windowSeconds = REAUTH_WINDOW_SECONDS) {
  return Array.isArray(claims?.amr) && claims.amr.some(entry => entry?.method === 'oauth' && Number.isFinite(entry.timestamp)
    && entry.timestamp <= nowSeconds + 60 && nowSeconds - entry.timestamp <= windowSeconds);
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  try {return JSON.parse(text);} catch {return null;}
}

// authenticate(jwt) -> user | null (server-side Auth check)
// verifyPassword({email,password,userId,captchaToken}) -> true | false; throws {code:'rate_limited'|'captcha_failed'}
// countOwned(userId) -> {[table]: number}; throws when any owned table cannot be checked
// deleteUser(userId) -> resolves on success; throws on failure
export function createAccountDeleteHandler({origins, authenticate, verifyPassword, countOwned, deleteUser, now = () => Date.now()}) {
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
    if (Object.keys(body).some(key => !['password','confirmation','captchaToken'].includes(key))) return fail(400, 'invalid_request');
    if (body.confirmation !== CONFIRMATION) return fail(400, 'confirmation_mismatch');

    if (reauthMethod(user) === 'oauth') {
      if ('password' in body || 'captchaToken' in body) return fail(400, 'invalid_request');
      const claims = tokenClaims(authorization.slice(7));
      if (claims?.sub !== user.id || !recentOAuth(claims, Math.floor(now() / 1000))) return fail(403, 'reauthentication_required');
    } else {
      if (typeof body.password !== 'string' || !body.password.length || body.password.length > 1024) return fail(400, 'invalid_request');
      if ('captchaToken' in body && (typeof body.captchaToken !== 'string' || !body.captchaToken || body.captchaToken.length > 2048)) return fail(400, 'invalid_request');
      try {
        if (!await verifyPassword({email:user.email, password:body.password, userId:user.id, captchaToken:body.captchaToken})) return fail(403, 'reauthentication_failed');
      } catch (error) {
        return error?.code === 'rate_limited' ? fail(429, 'rate_limited')
          : error?.code === 'captcha_failed' ? fail(400, 'captcha_failed') : fail(503, 'reauthentication_unavailable');
      }
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
