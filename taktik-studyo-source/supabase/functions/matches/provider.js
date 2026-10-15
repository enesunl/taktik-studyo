import {mapTeam} from './teams.js';
import {isMatchId} from '../../../src/lib/match-id.js';
import {normalizeDetail} from './detail.js';

export const LEAGUE_ID = 11, SEASON_ID = 1539, SEASON = '2026-2027';
const endpoint = 'https://sports.bzzoiro.com/api/v2/events/';
const statuses = new Map([['notstarted','upcoming'],['upcoming','upcoming'],['live','live'],['inprogress','live'],['finished','finished'],['postponed','postponed'],['cancelled','cancelled'],['canceled','cancelled']]);
const score = value => Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;

export function normalizeEvent(event,teamResolver=mapTeam) {
  if (!event || event.league_id !== LEAGUE_ID || event.season_id !== SEASON_ID
    || !Number.isSafeInteger(event.id) || event.id < 1
    || !Number.isInteger(event.round_number) || event.round_number < 1 || event.round_number > 34
    || typeof event.event_date !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/.test(event.event_date)
    || !Number.isFinite(Date.parse(event.event_date))) return null;
  const home = teamResolver(event.home_team_id,event.home_team), away = teamResolver(event.away_team_id,event.away_team);
  if (!home || !away || home.providerId === away.providerId) return null;
  const status = statuses.get(event.status) || 'unknown';
  return {id:String(event.id),competition:{id:'super-lig',name:'Süper Lig'},season:SEASON,
    round:event.round_number,kickoff:new Date(event.event_date).toISOString(),status,home,away,
    score:{home:status === 'upcoming' ? null : score(event.home_score),away:status === 'upcoming' ? null : score(event.away_score)},
    venueId:Number.isSafeInteger(event.venue_id) && event.venue_id > 0 ? String(event.venue_id) : null};
}

function pageUrl(offset) {
  return endpoint + '?' + new URLSearchParams({league_id:String(LEAGUE_ID),season_id:String(SEASON_ID),limit:'200',offset:String(offset)});
}
function nextOffset(value,offset) {
  if (typeof value !== 'string') throw Error('matches_unavailable');
  const url = new URL(value);
  const expected = {league_id:String(LEAGUE_ID),season_id:String(SEASON_ID),limit:'200',offset:String(offset + 200)};
  if (url.origin + url.pathname !== endpoint || url.username || url.password || url.hash
    || [...url.searchParams].length !== 4
    || Object.entries(expected).some(([key,v]) => url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== v)) throw Error('matches_unavailable');
  return offset + 200;
}

// Provider errors keep the existing outward messages but carry metadata for the handler:
// - 429 (any kind: per-IP burst or account quota) -> limited + Retry-After in ms (seconds or HTTP date).
// - 401/402/403 (invalid/revoked token, missing entitlement) -> accessDenied: no stale fallback.
// Non-enumerable marker on a partial detail whose optional resource was rate limited. JSON
// serialisation ignores it, so the API body is unchanged; the handler uses it to back off.
export const PROVIDER_LIMITED = Symbol.for('taktik.matches.providerLimited');
export function retryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds > 0 ? seconds * 1000 : 0;
  const date = Date.parse(value);
  return Number.isFinite(date) && date > now ? date - now : 0;
}
function limitedError(message,response) {
  const error = Error(message);
  error.limited = true;
  error.retryAfterMs = retryAfterMs(response.headers?.get?.('retry-after') ?? null);
  return error;
}
const accessError = message => Object.assign(Error(message),{accessDenied:true});
const ACCESS_STATUSES = new Set([401,402,403]);

// Only constants construct upstream URLs. Even a provider-supplied next URL is
// validated, then reconstructed; neither browser input nor redirects are followed.
export async function fetchSeason({token,fetchImpl = fetch,timeoutMs = 12000,teamResolver=mapTeam}) {
  if (!token) throw Error('matches_unavailable');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),timeoutMs);
  const matches = new Map();
  let offset = 0, total = null, received = 0, skipped = 0, duplicates = 0;
  try {
    for (let page = 0; page < 4; page++) {
      const response = await fetchImpl(pageUrl(offset),{headers:{Authorization:'Token '+token},signal:controller.signal,redirect:'error'});
      if (response.status === 429) throw limitedError('provider_limited',response);
      if (ACCESS_STATUSES.has(response.status)) throw accessError('matches_unavailable');
      if (!response.ok) throw Error('matches_unavailable');
      const text = await response.text();
      if (text.length > 2_000_000) throw Error('matches_unavailable');
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.results) || data.results.length > 200
        || !Number.isInteger(data.count) || data.count < 0 || data.count > 800
        || (total !== null && total !== data.count)) throw Error('matches_unavailable');
      total = data.count; received += data.results.length;
      for (const raw of data.results) {
        const match = normalizeEvent(raw,teamResolver);
        if (!match) {skipped++; continue;}
        if (matches.has(match.id)) {duplicates++; continue;}
        matches.set(match.id,match);
      }
      if (data.next === null) {
        if (received !== total || (total > 0 && !matches.size)) throw Error('matches_unavailable');
        return {season:SEASON,matches:[...matches.values()].sort((a,b) => a.round-b.round || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id)),quality:{skipped,duplicates}};
      }
      if (data.results.length !== 200) throw Error('matches_unavailable');
      offset = nextOffset(data.next,offset);
    }
    throw Error('matches_unavailable');
  } catch (error) {
    if (error?.limited || error?.accessDenied) throw error;
    throw Error(error?.message === 'provider_limited' ? 'provider_limited' : 'matches_unavailable');
  } finally {clearTimeout(timer);}
}

export async function fetchDetail({id,token,fetchImpl = fetch,timeoutMs = 18000,teamResolver=mapTeam}) {
  if (!isMatchId(id)) throw Error('INVALID_MATCH_ID');
  if (!token) throw Error('PROVIDER_UNAVAILABLE');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),timeoutMs);
  const signal = controller.signal;
  async function read(suffix = '',optional = false) {
    const response = await fetchImpl(endpoint+id+'/'+suffix,{headers:{Authorization:'Token '+token},redirect:'error',signal});
    if (response.status === 404) {if (optional) return null; throw Error('MATCH_NOT_FOUND');}
    if (response.status === 204 && optional) return null;
    if (response.status === 429) throw limitedError('PROVIDER_UNAVAILABLE',response);
    if (ACCESS_STATUSES.has(response.status)) throw accessError('PROVIDER_UNAVAILABLE');
    if (!response.ok) throw Error('PROVIDER_UNAVAILABLE');
    const body = await response.text();
    if (body.length > 2_000_000) throw Error('PROVIDER_UNAVAILABLE');
    return JSON.parse(body);
  }
  try {
    const raw = await read();
    if (!raw || String(raw.id) !== id || raw.league_id !== LEAGUE_ID || raw.season_id !== SEASON_ID) throw Error('MATCH_NOT_FOUND');
    const match = normalizeEvent(raw,teamResolver);
    if (!match) throw Error('PROVIDER_UNAVAILABLE');
    // Never request optional endpoints for an out-of-scope match.
    const names = ['lineups','incidents','stats'];
    const results = await Promise.allSettled(names.map(name => read(name+'/',true)));
    // Lost access on any resource means no partial data either.
    const denied = results.find(result => result.status === 'rejected' && result.reason?.accessDenied);
    if (denied) throw denied.reason;
    const limited = results.find(result => result.status === 'rejected' && result.reason?.limited);
    const resources = Object.fromEntries(names.map((name,i) => [name,{value:results[i].status === 'fulfilled' ? results[i].value : null,failed:results[i].status === 'rejected'}]));
    const detail = normalizeDetail(match,raw,resources);
    // Optional 429 stays a partial detail (existing contract) but signals provider back-off.
    if (limited) Object.defineProperty(detail,PROVIDER_LIMITED,{value:{retryAfterMs:limited.reason.retryAfterMs}});
    return detail;
  } catch (error) {
    if (error?.limited || error?.accessDenied) throw error;
    throw Error(error?.message === 'MATCH_NOT_FOUND' ? 'MATCH_NOT_FOUND' : 'PROVIDER_UNAVAILABLE');
  } finally {clearTimeout(timer);}
}
