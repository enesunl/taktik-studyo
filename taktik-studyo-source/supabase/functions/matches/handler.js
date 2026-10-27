import {resolveProbableXI} from './probable.js';
import {fetchSeason,fetchDetail,PROVIDER_LIMITED} from './provider.js';
import {LOOKUP_FAILED} from './canonical.js';
import {requestedMatchId} from '../../../src/lib/match-id.js';

// Per-isolate cache for shared, non-user-specific provider data only (fixtures/details).
// Never caches sessions, tokens, user ids or projects; authentication still precedes every hit.
// Limitation: Supabase Edge isolates are ephemeral and may run in parallel, so this cache is neither
// durable nor shared. A cold isolate always refetches; it only reduces load while an isolate is warm.
const MINUTE = 60e3, HOUR = 60 * MINUTE;
export const CACHE_LIMITS = Object.freeze({
  seasonActiveTtl:300,          // a match is live or within 30 min before / 3 h after kickoff (unchanged from before)
  seasonIdleMaxTtl:1800,        // otherwise refresh at most every 30 min, and before the next active window
  staleSeasonMs:6 * HOUR,       // last good fixtures served during temporary provider failures
  staleDetailMs:24 * HOUR,
  failureCooldownMs:15e3,       // per key after a temporary provider error: no retry storm
  notFoundTtlMs:10 * MINUTE,    // repeated unknown ids do not reach the provider
  maxDetails:320,               // a whole season (306 matches) fits; LRU beyond that
  retryAfterMaxMs:24 * HOUR,    // 429 Retry-After is honoured as sent (BSD sends seconds until its reset)
  limitedBackoffBaseMs:1000,    // 429 without Retry-After: exponential back-off 1 s, 2 s, 4 s ...
  limitedBackoffMaxMs:60e3,
  accessReprobeMs:5 * MINUTE,   // 401/402/403 from the provider: re-check access at most every 5 min
});

export function detailTTL(data, now = Date.now()) {
  const availability = Object.values(data.availability || {});
  if (availability.includes('error')) return 60;
  if (data.status === 'live') return 45;
  const kickoff = Date.parse(data.kickoff);
  if (data.status === 'finished') {
    if (availability.every(v => v === 'available')) return 6 * 3600;
    // Recently finished: lineups/stats/incidents may still arrive. Older gaps are unlikely to fill.
    return Number.isFinite(kickoff) && now - kickoff >= 4 * HOUR ? 3600 : 60;
  }
  if (data.status === 'upcoming') {
    // Predicted/confirmed lineups may change at any time: keep the original 5-minute refresh.
    if (data.lineups) return 300;
    const until = kickoff - now;
    // Lineups are published about an hour before kickoff; stay at 5 min inside the final 2 h.
    return !Number.isFinite(until) || until <= 2 * HOUR ? 300 : until <= 24 * HOUR ? 1800 : 3600;
  }
  return 600; // postponed / cancelled / unknown
}

export function seasonTTL(data, now = Date.now()) {
  const kickoffs = (data?.matches || []).map(m => [m.status, Date.parse(m.kickoff)]);
  const active = kickoffs.some(([status, k]) => status === 'live' || (Number.isFinite(k) && k - now <= 30 * MINUTE && now - k <= 3 * HOUR));
  if (active) return CACHE_LIMITS.seasonActiveTtl;
  const next = Math.min(...kickoffs.map(([, k]) => k).filter(k => Number.isFinite(k) && k > now));
  const untilActive = Number.isFinite(next) ? Math.floor((next - 30 * MINUTE - now) / 1000) : CACHE_LIMITS.seasonIdleMaxTtl;
  return Math.max(CACHE_LIMITS.seasonActiveTtl, Math.min(CACHE_LIMITS.seasonIdleMaxTtl, untilActive));
}

export function matchesOrigins(value = 'https://taktikstudyo.com') {
  const origins = value.split(',').map(s => s.trim());
  if (!origins.length || origins.some(s => {
    if (s === 'http://localhost:4173') return false;
    try {const u = new URL(s); return u.protocol !== 'https:' || u.origin !== s || /[*\s\\]/.test(s);} catch {return true;}
  })) throw Error('Invalid matches origins');
  return origins;
}

// `canonical` (PROD1.5, optional): factory receiving this handler's cached loaders and returning
// {events, match} presenters that attach BSD canonical catalogue identities (canonical.js).
// `allowDetail` (PROD5.3): async account id -> 0 (allowed) or seconds until retry; throws when unavailable.
export function createMatchesHandler({authenticate,token,origins = matchesOrigins(),load = fetchSeason,loadDetail = fetchDetail,now = Date.now,canonical,allowDetail}) {
  let seasonEntry = null, seasonPending = null, blockedUntil = 0, limitedStreak = 0, accessDeniedUntil = 0;
  // SEC2: ids of the last successfully loaded season; details are fetched only for these.
  let scheduledIds = new Set();
  const details = new Map(), pendingDetails = new Map(), resolved = new Map(), pendingResolved = new Map();
  const cooldown = new Map(), notFound = new Map();
  const remember = (map, key, value, max) => {map.delete(key); if (map.size >= max) map.delete(map.keys().next().value); map.set(key, value);};
  const stamp = entry => ({...entry, fetchedAt:new Date(now()).toISOString()});

  // Licence §5: once access is invalid or revoked, retained raw data must not keep being displayed.
  // A load that started before a purge restores no access and fills no cache when it ends: its result
  // counts as lost access (`purges` fences it). Access returns only through a load started afterwards.
  let purges = 0;
  const revoked = message => Object.assign(Error(message), {accessDenied:true});
  function purge() {purges++; seasonEntry = null; scheduledIds = new Set(); details.clear(); resolved.clear(); notFound.clear(); cooldown.clear();}
  function noteSuccess() {limitedStreak = 0; accessDeniedUntil = 0;}
  function noteFailure(key, error) {
    const t = now();
    if (error?.accessDenied) {purge(); accessDeniedUntil = t + CACHE_LIMITS.accessReprobeMs; return;}
    if (error?.limited) {
      // Honour Retry-After for every 429 (burst or quota alike); without it, back off exponentially.
      const wait = error.retryAfterMs > 0 ? Math.min(error.retryAfterMs, CACHE_LIMITS.retryAfterMaxMs)
        : Math.min(CACHE_LIMITS.limitedBackoffBaseMs * 2 ** limitedStreak, CACHE_LIMITS.limitedBackoffMaxMs);
      limitedStreak++; blockedUntil = Math.max(blockedUntil, t + wait); return;
    }
    cooldown.set(key, {until:t + CACHE_LIMITS.failureCooldownMs, code:error?.message});
  }
  // Returns {error, staleAllowed} when the provider must not be called now.
  function closed(key, fallback) {
    const t = now();
    if (t < accessDeniedUntil) return {error:Error(fallback), staleAllowed:false};
    if (t < blockedUntil) return {error:Error(key === 'season' ? 'provider_limited' : 'PROVIDER_UNAVAILABLE'), staleAllowed:true};
    const c = cooldown.get(key);
    return c && t < c.until ? {error:Error(c.code || fallback), staleAllowed:true} : null;
  }
  const staleOrThrow = (entry, error, allowed = true) => {
    if (allowed && !error?.accessDenied && entry && now() < entry.staleUntil) return {...entry, stale:true};
    throw error;
  };

  async function season() {
    const t = now();
    if (seasonEntry && t < seasonEntry.expires) return seasonEntry;
    const gate = closed('season', 'matches_unavailable');
    if (gate) return staleOrThrow(seasonEntry, gate.error, gate.staleAllowed);
    if (!seasonPending) {
      const fence = purges;
      seasonPending = Promise.resolve().then(() => load({token})).then(data => {
        if (fence !== purges) throw revoked('matches_unavailable');
        const ttl = seasonTTL(data, now()), expires = now() + ttl * 1000;
        noteSuccess(); cooldown.delete('season'); scheduledIds = new Set(data.matches.map(match => match.id));
        return (seasonEntry = stamp({data, expires, staleUntil:expires + CACHE_LIMITS.staleSeasonMs}));
      }, error => {noteFailure('season', error); throw error;}).finally(() => {seasonPending = null;});
    }
    try {return await seasonPending;}
    catch (error) {return staleOrThrow(seasonEntry, error);}
  }

  // At most 32 provider detail loads run at once. Further cold loads wait in FIFO order (at most 64,
  // each for at most 5 s); a finished load hands its slot to the oldest waiter, so none starves.
  // Beyond that the request is answered from stale data or as overloaded, never with a provider call.
  let loading = 0;
  const loadWaiters = [];
  const overloaded = () => Object.assign(Error('PROVIDER_UNAVAILABLE'), {overloaded:true});
  function loadSlot() {
    if (loading < 32) {loading++; return Promise.resolve();}
    if (loadWaiters.length >= 64) return Promise.reject(overloaded());
    return new Promise((resolve, reject) => {
      const waiter = {resolve, timer:setTimeout(() => {loadWaiters.splice(loadWaiters.indexOf(waiter), 1); reject(overloaded());}, 5000)};
      loadWaiters.push(waiter);
    });
  }
  function freeSlot() {
    const next = loadWaiters.shift();
    if (next) {clearTimeout(next.timer); next.resolve();} else loading--;
  }

  async function rawDetail(id) {
    const t = now(), key = 'detail:' + id, existing = details.get(id), fence = purges;
    if (existing && t < existing.expires) return existing;
    if ((notFound.get(id) || 0) > t) throw Error('MATCH_NOT_FOUND');
    const gate = closed(key, 'PROVIDER_UNAVAILABLE');
    if (gate) return staleOrThrow(existing, gate.error, gate.staleAllowed);
    if (!pendingDetails.has(id)) {
      if (loading >= 32 && existing && t < existing.staleUntil) return {...existing, stale:true};
      const loaded = data => {
        if (fence !== purges) throw revoked('PROVIDER_UNAVAILABLE');
        const ttl = detailTTL(data, now()), expires = now() + ttl * 1000;
        const entry = stamp({data, ttl, expires, staleUntil:expires + CACHE_LIMITS.staleDetailMs});
        noteSuccess(); cooldown.delete(key);
        if (data?.[PROVIDER_LIMITED]) noteFailure(key, {limited:true, ...data[PROVIDER_LIMITED]});
        remember(details, id, entry, CACHE_LIMITS.maxDetails); return entry;
      };
      const failed = error => {
        if (error?.message === 'MATCH_NOT_FOUND') remember(notFound, id, now() + CACHE_LIMITS.notFoundTtlMs, CACHE_LIMITS.maxDetails);
        else if (!error?.overloaded && !error?.skipped) noteFailure(key, error);
        throw error;
      };
      // The slot is freed after the outcome is recorded, so the next load sees a new provider block
      // (429) or lost access, and then skips the provider.
      pendingDetails.set(id, loadSlot().then(() => Promise.resolve().then(() => {
        const blocked = closed(key, 'PROVIDER_UNAVAILABLE');
        if (blocked) throw Object.assign(blocked.error, {skipped:true});
        return loadDetail({id,token});
      }).then(loaded, failed).finally(freeSlot), failed).finally(() => pendingDetails.delete(id)));
    }
    try {return await pendingDetails.get(id);}
    catch (error) {
      if (error?.message === 'MATCH_NOT_FOUND') throw error;
      // `existing` was read before the failure; an access error purges and must not fall back to it.
      return staleOrThrow(existing, error, !error?.accessDenied && now() >= accessDeniedUntil);
    }
  }

  async function studioDetail(id, startedAt = now()) {
    const raw = await rawDetail(id), existing = resolved.get(id);
    if (existing && existing.source === raw.data && !(existing.retryAt <= now()))
      return {...existing, expires:existing.retryAt ? existing.expires : raw.expires, stale:raw.stale, fetchedAt:raw.fetchedAt};
    if (!pendingResolved.has(id)) {
      // Saturated: history details from the cache only (no provider call); without them, provider XIs
      // only. Not kept, and browsers keep it for at most 60 s, so a full answer follows after the load.
      const cachedDetail = id => {const entry = details.get(id); return entry && now() < entry.staleUntil ? Promise.resolve(entry) : Promise.reject(overloaded());};
      if (pendingResolved.size >= 32) return resolveProbableXI(raw.data, {season:() => season().then(entry => entry.data), detail:cachedDetail, now})
        .then(data => ({data, source:raw.data, expires:Math.min(raw.expires, now() + 60e3), stale:raw.stale, fetchedAt:raw.fetchedAt}));
      pendingResolved.set(id, (async () => {
        const fence = purges;
        // A failed lookup (overload, provider error) is temporary: that answer is kept only until the
        // failure cool-down has passed (then resolved again) and browsers keep it for at most 60 s.
        // No history lookup starts later than 10 s after the request began: one started before then ends
        // (detail timeout 18 s) before the app gives up waiting (30 s). With canonical presentation, each
        // team's latest finished match is still looked up: its default XI loads that one anyway (one team
        // after the other), so skipping it here would only make the answer slower and reduced.
        let failed = false;
        const noted = promise => promise.catch(error => {failed = true; throw error;});
        const latest = team => seasonEntry?.data.matches.filter(m => m.status === 'finished' && [m.home.providerId, m.away.providerId].includes(team))
          .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))[0]?.id;
        const kept = new Set(presenter ? ['home', 'away'].map(side => latest(raw.data[side]?.providerId)) : []);
        const detail = id => noted(now() - startedAt > 10e3 && !kept.has(id) ? Promise.reject(overloaded()) : rawDetail(id));
        const data = await resolveProbableXI(raw.data, {season:() => noted(season()).then(entry => entry.data), detail, now});
        const entry = {data, source:raw.data, expires:failed ? Math.min(raw.expires, now() + 60e3) : raw.expires, stale:raw.stale, fetchedAt:raw.fetchedAt};
        if (!raw.stale && fence === purges) remember(resolved, id, failed ? {...entry, retryAt:now() + CACHE_LIMITS.failureCooldownMs} : entry, CACHE_LIMITS.maxDetails);
        return entry;
      })().finally(() => pendingResolved.delete(id)));
    }
    return pendingResolved.get(id);
  }

  // Canonical presentation reuses the cached season/detail loaders. Its default XIs load at most the
  // two teams' latest finished details (usually already cached by the probable-XI lookup).
  // If the catalogue is unavailable, details carry no canonical model (the client shows its
  // unavailable state); fixture lists keep their provider fields. Never a legacy roster.
  const presenter = canonical ? canonical({loadSeason:async () => (await season()).data, loadDetail:async ({id}) => (await rawDetail(id)).data}) : null;
  const presentMatch = async data => {
    if (!presenter) return data;
    try {return await presenter.match(data);}
    catch {return Object.defineProperty({...data, canonicalModel:null, canonicalError:'catalogue_unavailable'}, LOOKUP_FAILED, {value:true});}
  };
  const presentEvents = async data => {
    if (!presenter) return data;
    try {return await presenter.events(data);} catch {return data;}
  };

  // Browser caching as before: details for their remaining TTL, fixtures for at most 5 minutes.
  const remaining = entry => Math.max(0, Math.floor((entry.expires - now()) / 1000));
  const cacheControl = (entry, cap = Infinity) => 'private, max-age=' + (entry.stale ? 30 : Math.min(cap, remaining(entry)));
  // Additive field: existing keys are unchanged; clients may show "last updated" when stale is true.
  const body = entry => JSON.stringify({...entry.data, freshness:{stale:!!entry.stale, fetchedAt:entry.fetchedAt}});
  const accountDetails = new Map();
  let activeDetails = 0;
  async function answerDetail(user, id, headers, reply) {
    const startedAt = now();
    if (allowDetail) {
      // PROD5.3: per-account detail budget (database-backed, shared by all instances), checked before
      // any season/detail work so a rejected request never reaches the provider. Fails closed.
      let wait;
      try {wait = await allowDetail(user.id);} catch {wait = null;}
      if (!Number.isSafeInteger(wait) || wait < 0) return reply(503,'PROVIDER_UNAVAILABLE');
      if (wait > 0) {headers['Retry-After'] = String(wait); return reply(429,'RATE_LIMITED');}
    }
    // SEC2: only fixtures of the configured season reach the provider. Any other well-formed id
    // would cost a provider request per id (quota exhaustion by enumeration), so it is answered
    // from the cached season list without a provider call.
    // The last successfully loaded season counts, so retained details stay available during an
    // outage; it is cleared only when provider access is lost (licence purge).
    try {await season();} catch {}
    if (!scheduledIds.has(id)) return scheduledIds.size ? reply(404,'MATCH_NOT_FOUND') : reply(503,'PROVIDER_UNAVAILABLE');
    try {
      const resolvedEntry = await studioDetail(id, startedAt), data = await presentMatch(resolvedEntry.data);
      // Licence §5: access lost while this request was in progress (another load purged): not shown.
      if (now() < accessDeniedUntil) return reply(503,'PROVIDER_UNAVAILABLE');
      // A presentation built after a failed lookup is temporary: browsers keep it for at most 60 s.
      const entry = data[LOOKUP_FAILED] ? {...resolvedEntry, expires:Math.min(resolvedEntry.expires, now() + 60e3)} : resolvedEntry;
      return new Response(body({...entry, data}),{headers:{...headers,'Cache-Control':cacheControl(entry),'X-Matches-Cache':entry.stale ? 'stale' : 'fresh'}});
    } catch (error) {
      // Local overload stays 503 (a 429 would tell the user they opened too many matches).
      if (error?.overloaded) headers['Retry-After'] = '5';
      return reply(error?.message === 'MATCH_NOT_FOUND' ? 404 : 503,error?.message === 'MATCH_NOT_FOUND' ? 'MATCH_NOT_FOUND' : 'PROVIDER_UNAVAILABLE');
    }
  }
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
    let user = null;
    try {user = await authenticate(authorization.slice(7));} catch {user = null;}
    if (!user?.id || user.is_anonymous || !user.email_confirmed_at) return reply(401,wantsDetail ? 'UNAUTHORIZED' : 'unauthenticated');
    if (wantsDetail) {
      // While this instance is busy (16 or more detail requests in progress), at most 4 of one account
      // at once (the app opens one match at a time): one account cannot fill the shared load queue and
      // pacer ahead of other users. Below that a burst is not cut: rejecting part of it leaves the deeper
      // probable-XI loads, which on a shared egress IP meet more provider 429s. Checked before the
      // budget, so a rejected request is not charged.
      const active = accountDetails.get(user.id) || 0;
      if (active >= 4 && activeDetails >= 16) {headers['Retry-After'] = '5'; return reply(429,'RATE_LIMITED');}
      accountDetails.set(user.id, active + 1); activeDetails++;
      try {return await answerDetail(user, id, headers, reply);}
      finally {
        activeDetails--;
        const left = accountDetails.get(user.id) - 1;
        if (left) accountDetails.set(user.id, left); else accountDetails.delete(user.id);
      }
    }
    try {
      // Authentication precedes every cache hit; the cache holds only shared fixture data.
      const entry = await season(), data = await presentEvents(entry.data);
      if (now() < accessDeniedUntil) return reply(502,'matches_unavailable');
      return new Response(body({...entry, data}),{headers:{...headers,'Cache-Control':cacheControl(entry,300),'X-Matches-Cache':entry.stale ? 'stale' : 'fresh'}});
    } catch (error) {return reply(error?.message === 'provider_limited' ? 503 : 502,'matches_unavailable');}
  };
}
