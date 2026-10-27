// PROD1.5: BSD canonical presentation for match data, shared by the matches Edge Function and
// the local development server. Server-side only. The catalogue state (catalogue_teams,
// catalogue_players and the server-only provider mapping tables) comes from loadState and is
// cached briefly per isolate. Provider IDs resolve only through explicit BSD mappings; an
// unknown identity never becomes another player. Moved unchanged from the D3/D4 local service.
import {providerIdentityResolver} from '../../../src/lib/catalogue-identity.js';
import {defaultXI,squadFallback} from '../../../src/lib/catalogue-default-xi.js';
import {layoutTeam,parseFormation} from '../../../src/lib/match-layout.js';
import {validXI} from '../../../src/lib/studio-lineups.js';
import {matchGoals} from '../../../src/lib/match-goals.js';
import {SEASON,SEASON_ID} from './provider.js';

export const CATALOGUE_STATE_TTL_MS = 5 * 60 * 1000;
// Marks a presented match whose default XI fell back because a provider detail lookup failed
// (a temporary state): callers do not keep it long.
export const LOOKUP_FAILED = Symbol.for('taktik.matches.lookupFailed');

// Reads the four canonical tables with a server client (all rows; RLS bypassed by the server role).
export async function readCatalogueState(client) {
  const all = async (table, order) => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const {data, error} = await client.from(table).select('*').order(order).range(from, from + 999);
      if (error || !Array.isArray(data)) throw Error('catalogue_unavailable');
      rows.push(...data);
      if (data.length < 1000) return rows;
      if (from > 100000) throw Error('catalogue_unavailable');
    }
  };
  const state = {teams:await all('catalogue_teams','id'), players:await all('catalogue_players','id'),
    teamMappings:await all('team_provider_ids','provider_id'), playerMappings:await all('player_provider_ids','provider_id')};
  if (!state.teams.some(t => t.catalogue_active) || !state.players.some(p => p.catalogue_active)) throw Error('catalogue_empty');
  return state;
}

export function canonicalService(state, {loadSeason, loadDetail, now = Date.now} = {}) {
  const resolver = providerIdentityResolver(state);
  let pending, until = 0, cached;
  function resolveLineup(source, teamId) {
    if (!validXI(source) || !parseFormation(source.formation)) return null;
    const squad = state.players.filter(p => p.team_id === teamId && p.catalogue_active), ids = new Set(squad.map(p => p.id));
    const mapped = [...source.starters, ...source.substitutes].map(p => resolver.player(p.id, 'bsd'));
    if (!mapped.every(id => ids.has(id)) || new Set(mapped).size !== mapped.length) return null;
    // Provider lineup and canonical position facts can disagree: never force an invalid XI.
    if (squad.filter(p => mapped.slice(0, 11).includes(p.id) && p.position_group === 'G').length !== 1) return null;
    return mapped;
  }
  function canonicalEvent(match) {
    const result = {...match};
    for (const side of ['home', 'away']) {
      const id = resolver.team(match[side].providerId, 'bsd'), team = state.teams.find(t => t.id === id);
      result[side] = {...match[side], teamId:id, ...(team ? {name:team.display_name, color:team.color_primary, color2:team.color_secondary} : {})};
    }
    return result;
  }
  // Latest same-season finished match (one provider detail each, shared within the run) of the given teams.
  async function recentMatches(teams) {
    const matches = [];
    let failed = false;
    if (loadSeason && loadDetail) {
      try {
        const season = await loadSeason(), detailCache = new Map();
        for (const team of teams) {
          const pid = state.teamMappings.find(m => m.team_id === team.id && m.provider === 'bsd')?.provider_id;
          const match = season.matches.filter(m => m.season === SEASON && m.status === 'finished' && [m.home.providerId, m.away.providerId].includes(pid))
            .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))[0];
          if (!match) continue;
          if (!detailCache.has(match.id)) detailCache.set(match.id, await loadDetail({id:match.id}));
          const d = detailCache.get(match.id), side = d.home.providerId === pid ? 'home' : 'away';
          if (d.id !== match.id || d.season !== SEASON || d[side].providerId !== pid) continue;
          matches.push({id:d.id, teamId:team.id, seasonId:String(SEASON_ID), kickoff:d.kickoff, status:d.status, kind:d.lineups?.status,
            lineup:resolveLineup(d.lineups?.[side], team.id) ? d.lineups[side] : null});
        }
      } catch {failed = true;} // Confirmed data unavailable: labelled deterministic arrangement, never a legacy roster.
    }
    return {matches, failed};
  }
  const arrangement = (teamId, matches) => defaultXI({teamId, seasonId:String(SEASON_ID), players:state.players, matches, resolver});
  // All league teams (local catalogue service `defaults` action).
  async function defaults() {
    if (cached && now() < until) return cached;
    if (pending) return pending;
    pending = (async () => {
      const {matches} = await recentMatches(state.teams);
      cached = Object.fromEntries(state.teams.map(t => [t.id, arrangement(t.id, matches)]));
      until = now() + CATALOGUE_STATE_TTL_MS;
      return cached;
    })().finally(() => pending = null);
    return pending;
  }
  // A match detail needs only its two teams, so it loads at most their latest finished details
  // (not one per league team). Same arrangement per team as defaults(); per-team cache and
  // in-flight sharing, so concurrent details of overlapping teams load each team once.
  const teamCache = new Map(), teamPending = new Map();
  async function teamDefaults(ids) {
    if (cached && now() < until) return cached;
    const missing = ids.filter(id => !(now() < teamCache.get(id)?.until) && !teamPending.has(id));
    if (missing.length) {
      const job = recentMatches(state.teams.filter(t => missing.includes(t.id))).then(({matches, failed}) => {
        // After a failed lookup the fallback arrangement is kept for 60 s only, then retried.
        const expires = now() + (failed ? 60e3 : CATALOGUE_STATE_TTL_MS);
        for (const id of missing) teamCache.set(id, {value:arrangement(id, matches), until:expires, failed});
      }).finally(() => missing.forEach(id => teamPending.delete(id)));
      missing.forEach(id => teamPending.set(id, job));
    }
    await Promise.all(ids.map(id => teamPending.get(id)));
    return Object.fromEntries(ids.map(id => [id, teamCache.get(id).value]));
  }
  async function canonicalMatch(match) {
    match = canonicalEvent(match);
    const ids = ['home', 'away'].map(side => resolver.team(match[side].providerId, 'bsd'));
    if (!ids.every(id => state.teams.some(t => t.id === id))) return {...match, canonicalModel:null, canonicalError:'provider_mapping_unresolved'};
    const arrangements = await teamDefaults(ids), model = {matchId:match.id}, goals = matchGoals(match);
    let failed = false;
    for (const side of ['home', 'away']) {
      const id = resolver.team(match[side].providerId, 'bsd'), team = state.teams.find(t => t.id === id);
      if (!team) return {...match, canonicalModel:null, canonicalError:'provider_mapping_unresolved'};
      const squad = state.players.filter(p => p.team_id === id && p.catalogue_active);
      const source = match.lineups?.status === 'confirmed' ? match.lineups[side] : null;
      const resolved = resolveLineup(source, id);
      let arrangement = arrangements[id], lineupKind = 'probable-local', goalIds = new Map();
      if (resolved) {
        const placed = squadFallback(squad.filter(p => resolved.slice(0, 11).includes(p.id)), source.formation || '4-3-3');
        arrangement = {...placed, bench:resolved.slice(11)}; lineupKind = 'confirmed';
        [...source.starters, ...source.substitutes].forEach((p, i) => goalIds.set(resolved[i], p.id));
      } else {
        if (arrangement.kind === 'recent-confirmed') lineupKind = 'probable-recent-match';
        if (arrangement === teamCache.get(id)?.value && teamCache.get(id).failed) failed = true;
      }
      const convert = pid => {const p = squad.find(p => p.id === pid); return {id:p.id, name:p.display_name, number:p.shirt_number, position:({G:'goalkeeper', D:'defender', M:'midfielder', F:'forward'})[p.position_group]};};
      const line = {formation:arrangement.formation, lineupKind, starters:arrangement.starters.map(p => convert(p.playerId)), substitutes:arrangement.bench.map(convert)};
      model[side] = layoutTeam({teamId:id, name:team.display_name, color:team.color_primary, color2:team.color_secondary}, line, side, 'internal', pid => goals.count(side, goalIds.get(pid)));
    }
    // Provider DTO identities stay separate; presentation gets only a resolved internal key.
    const person = p => p ? {...p, playerId:resolver.player(p.id, 'bsd')} : p;
    const lineups = lines => lines ? {...lines, ...Object.fromEntries(['home', 'away'].map(side => [side, lines[side] ? {...lines[side], starters:lines[side].starters.map(person), substitutes:lines[side].substitutes.map(person)} : null]))} : lines;
    const events = rows => rows.map(e => ({...e, player:person(e.player), incoming:person(e.incoming), outgoing:person(e.outgoing)}));
    const result = {...match, lineups:lineups(match.lineups), ...(match.studioLineups ? {studioLineups:lineups(match.studioLineups)} : {}),
      incidents:events(match.incidents), substitutions:events(match.substitutions), canonicalModel:model};
    return failed ? Object.defineProperty(result, LOOKUP_FAILED, {value:true}) : result;
  }
  const teamResolver = providerId => {
    const id = resolver.team(String(providerId), 'bsd'), team = state.teams.find(t => t.id === id && t.catalogue_active);
    return team ? {providerId:String(providerId), teamId:id, name:team.display_name, color:team.color_primary, color2:team.color_secondary} : null;
  };
  return {canonicalEvent, canonicalMatch, defaults, resolver, teamResolver, state};
}

// Cached per isolate. A failed state load is retried after a short cool-down; callers turn the
// failure into the existing unavailable state (no legacy fallback, no partial catalogue).
export function createCanonicalMatches({loadState, loadSeason, loadDetail, now = Date.now, ttlMs = CATALOGUE_STATE_TTL_MS}) {
  let current = null, expires = 0, pending = null;
  async function get() {
    if (current && now() < expires) return current;
    if (!pending) pending = Promise.resolve().then(loadState).then(state => {
      current = canonicalService(state, {loadSeason, loadDetail, now}); expires = now() + ttlMs; return current;
    }).finally(() => pending = null);
    return pending;
  }
  return {
    get,
    async events(data) {const s = await get(); return {...data, matches:data.matches.map(m => s.canonicalEvent(m))};},
    async match(data) {return (await get()).canonicalMatch(data);},
  };
}
