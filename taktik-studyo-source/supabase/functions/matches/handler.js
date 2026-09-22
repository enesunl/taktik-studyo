import {fetchSeason} from './provider.js';

export function matchesOrigins(value = 'https://taktikstudyo.com') {
  const origins = value.split(',').map(s => s.trim());
  if (!origins.length || origins.some(s => {
    if (s === 'http://localhost:4173') return false;
    try {const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || /[*\s\\]/.test(s);} catch {return true;}
  })) throw Error('Invalid matches origins');
  return origins;
}

export function createMatchesHandler({authenticate,token,origins = matchesOrigins(),load = fetchSeason,now = Date.now}) {
  let cached = null, expires = 0, pending = null;
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin, Authorization','X-Content-Type-Options':'nosniff'};
    if (origin && origins.includes(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type'});
    const reply = (status,code) => new Response(JSON.stringify({error:{code}}),{status,headers});
    if (origin && !origins.includes(origin)) return reply(403,'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'GET') return reply(405,'method_not_allowed');
    // No user-selected league, season, URL, or even round is sent upstream.
    if (new URL(request.url).search) return reply(400,'invalid_request');
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/.test(authorization)) return reply(401,'unauthenticated');
    try {
      const user = await authenticate(authorization.slice(7));
      if (!user?.id || user.is_anonymous || !user.email_confirmed_at) return reply(401,'unauthenticated');
    } catch {return reply(401,'unauthenticated');}
    try {
      // Authentication precedes every cache hit. Single-flight cache is per
      // isolate, not durable/distributed, and cannot bypass the user check.
      if (!cached || now() >= expires) {
        if (!pending) pending = load({token}).then(data => {cached = data; expires = now()+300000; return data;}).finally(() => {pending = null;});
        await pending;
      }
      return new Response(JSON.stringify(cached),{headers:{...headers,'Cache-Control':'private, max-age=300'}});
    } catch (error) {return reply(error?.message === 'provider_limited' ? 503 : 502,'matches_unavailable');}
  };
}
