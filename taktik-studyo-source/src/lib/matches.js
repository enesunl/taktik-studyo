import {requestMatches} from './matches-transport.js';

export const ROUNDS = Object.freeze(Array.from({length:34},(_,i) => i+1));
export const MATCH_STATUS_LABELS = Object.freeze({finished:'MS',live:'Canlı',postponed:'Ertelendi',cancelled:'İptal',unknown:'Durum bekleniyor',upcoming:'Maç öncesi'});
export function requestedRound(search = '') {
  const params = new URLSearchParams(search), values = params.getAll('hafta');
  return values.length === 1 && /^(?:[1-9]|[12]\d|3[0-4])$/.test(values[0]) ? Number(values[0]) : null;
}
export const adjacentRound = (round,step) => Math.max(1,Math.min(34,round+step));
export function defaultRound(matches,now = Date.now()) {
  const sorted = [...matches].sort((a,b) => Date.parse(a.kickoff)-Date.parse(b.kickoff) || a.round-b.round);
  if (!sorted.length) return 1;
  const live = sorted.find(m => m.status === 'live');
  if (live) return live.round;
  if (now < Date.parse(sorted[0].kickoff)) return 1;
  if (sorted.at(-1).round === 34 && sorted.every(m => ['finished','cancelled'].includes(m.status)) && now > Date.parse(sorted.at(-1).kickoff)) return 34;
  const played = sorted.filter(m => m.status === 'finished' && Date.parse(m.kickoff) <= now);
  // Prefer the most recently played round; postponed outliers don't turn the
  // number of finished fixtures into an invented week number.
  if (played.length) return played.at(-1).round;
  return sorted.reduce((best,m) => Math.abs(Date.parse(m.kickoff)-now) < Math.abs(Date.parse(best.kickoff)-now) ? m : best).round;
}
// Additive server field {stale, fetchedAt}. Malformed values are ignored; data is never derived from it.
export function readFreshness(value) {
  return value && typeof value === 'object' && typeof value.stale === 'boolean' && typeof value.fetchedAt === 'string'
    && Number.isFinite(Date.parse(value.fetchedAt)) ? {stale:value.stale,fetchedAt:value.fetchedAt} : null;
}
export function staleNotice(freshness,timeZone) {
  if (!freshness?.stale) return '';
  const when = new Intl.DateTimeFormat('tr-TR',{...(timeZone ? {timeZone} : {}),day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(freshness.fetchedAt));
  return 'Maç verileri şu anda güncellenemiyor. Gösterilen bilgiler '+when+' itibarıyla alındı.';
}

export function matchDate(kickoff,timeZone) {
  const options = timeZone ? {timeZone} : {};
  const date = new Date(kickoff);
  const parts = new Intl.DateTimeFormat('en-CA',{...options,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part = type => parts.find(p => p.type === type).value;
  return {key:[part('year'),part('month'),part('day')].join('-'),
    date:new Intl.DateTimeFormat('tr-TR',{...options,day:'numeric',month:'long',weekday:'long'}).format(date),
    time:new Intl.DateTimeFormat('tr-TR',{...options,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)};
}

const statuses = new Set(['upcoming','live','finished','postponed','cancelled','unknown']);
const teamValid = t => t && typeof t.providerId === 'string' && typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 120
  && /^#[a-f0-9]{6}$/i.test(t.color) && /^#[a-f0-9]{6}$/i.test(t.color2);
export function seasonValid(data) {
  return data?.season === '2026-2027' && Array.isArray(data.matches) && data.matches.length <= 800
    && data.matches.every(m => m && /^\d+$/.test(m.id) && typeof m.id === 'string'
      && m.season === data.season && Number.isInteger(m.round) && m.round >= 1 && m.round <= 34
      && typeof m.kickoff === 'string' && /(?:Z|\+00:00)$/.test(m.kickoff) && Number.isFinite(Date.parse(m.kickoff))
      && statuses.has(m.status) && teamValid(m.home) && teamValid(m.away)
      && m.score && [m.score.home,m.score.away].every(v => v === null || Number.isInteger(v) && v >= 0 && v <= 100))
    && new Set(data.matches.map(m => m.id)).size === data.matches.length;
}
export function createMatchesApi({client,current,location,fetchImpl}) {
  return {async load() {
    if (!current()) return {ok:false,error:{code:'state_changed'}};
    try {
      if (!client) throw Error();
      const {data,error} = await requestMatches({client,current,location,fetchImpl});
      if (!current()) return {ok:false,error:{code:'state_changed'}};
      if (error || !seasonValid(data)) throw Error();
      return {ok:true,matches:data.matches,freshness:readFreshness(data.freshness)};
    } catch {return {ok:false,error:{code:current() ? 'matches_unavailable' : 'state_changed'}};}
  }};
}
