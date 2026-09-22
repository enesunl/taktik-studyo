import {fetchSeason,fetchDetail} from './provider.js';
import {requestedMatchId} from '../../../src/lib/match-id.js';

export function detailTTL(data) {
  if (Object.values(data.availability || {}).some(v => v === 'error' || data.status === 'finished' && v !== 'available')) return 60;
  return data.status === 'finished' ? 3600 : data.status === 'live' ? 45 : data.status === 'upcoming' ? 300 : 120;
}

export function matchesOrigins(value = 'https://taktikstudyo.com') {
  const origins = value.split(',').map(s => s.trim());
  if (!origins.length || origins.some(s => {
    if (s === 'http://localhost:4173') return false;
    try {const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || /[*\s\\]/.test(s);} catch {return true;}
  })) throw Error('Invalid matches origins');
  return origins;
}

export function createMatchesHandler({authenticate,token,origins = matchesOrigins(),load = fetchSeason,loadDetail = fetchDetail,now = Date.now}) {
  let cached = null, expires = 0, pending = null;
  const details = new Map(), pendingDetails = new Map();
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin, Authorization','X-Content-Type-Options':'nosniff'};
    if (origin && origins.includes(origin)) Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type'});
    const reply = (status,code) => new Response(JSON.stringify({error:{code}}),{status,headers});
    if (origin && !origins.includes(origin)) return reply(403,'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'GET') return reply(405,'method_not_allowed');
    const url = new URL(request.url), wantsDetail = url.searchParams.has('id'), id = requestedMatchId(url.search);
    if (wantsDetail && !id) return reply(400,'INVALID_MATCH_ID');
    if (url.search && (!wantsDetail || [...url.searchParams.keys()].some(key => key !== 'id'))) return reply(400,'invalid_request');
    const authorization = request.headers.get('authorization') || '';
    if (!/^Bearer \S+$/.test(authorization)) return reply(401,wantsDetail ? 'UNAUTHORIZED' : 'unauthenticated');
    try {
      const user = await authenticate(authorization.slice(7));
      if (!user?.id || user.is_anonymous || !user.email_confirmed_at) return reply(401,wantsDetail ? 'UNAUTHORIZED' : 'unauthenticated');
    } catch {return reply(401,wantsDetail ? 'UNAUTHORIZED' : 'unauthenticated');}
    if (wantsDetail) {
      try {
        let entry = details.get(id);
        if (!entry || now() >= entry.expires) {
          if (!pendingDetails.has(id)) {
            if (pendingDetails.size >= 32) return reply(503,'PROVIDER_UNAVAILABLE');
            pendingDetails.set(id,Promise.resolve().then(() => loadDetail({id,token})).then(data => {
              const ttl = detailTTL(data), value = {data,ttl,expires:now()+ttl*1000};
              if (details.size >= 128) details.delete(details.keys().next().value);
              details.set(id,value); return value;
            }).finally(() => pendingDetails.delete(id)));
          }
          entry = await pendingDetails.get(id);
        }
        return new Response(JSON.stringify(entry.data),{headers:{...headers,'Cache-Control':'private, max-age='+Math.max(0,Math.floor((entry.expires-now())/1000))}});
      } catch (error) {return reply(error?.message === 'MATCH_NOT_FOUND' ? 404 : 503,error?.message === 'MATCH_NOT_FOUND' ? 'MATCH_NOT_FOUND' : 'PROVIDER_UNAVAILABLE');}
    }
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
