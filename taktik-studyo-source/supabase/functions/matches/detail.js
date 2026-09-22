// BSD-only schemas stop here. M1 owns team/status/event normalization.
const text = value => typeof value === 'string' && value.trim() && value.length <= 160 ? value.trim() : null;
const id = value => Number.isSafeInteger(value) && value > 0 ? String(value) : null;
const amount = (value,max = 1000) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
const belongs = (raw,match) => raw && String(raw.event_id) === match.id;
const positions = new Map([['G','goalkeeper'],['D','defender'],['M','midfielder'],['F','forward']]);
const metrics = {possession:'ball_possession',shots:'total_shots',shotsOnTarget:'shots_on_target',corners:'corner_kicks',fouls:'fouls',offsides:'offsides',yellowCards:'yellow_cards',redCards:'red_cards'};
const cardTypes = new Map([['yellow','yellow'],['red','red'],['yellowRed','yellowRed']]);
const incidentTypes = new Map([['goal','goal'],['substitution','substitution'],['period','period'],['injuryTime','addedTime'],['varDecision','var']]);
const goalTypes = new Map([['regular','regular'],['penalty','penalty'],['owngoal','own'],['own_goal','own'],['ownGoal','own'],['own','own']]);

export function normalizeStatistics(raw,match) {
  if (!belongs(raw,match) || !raw.stats || typeof raw.stats !== 'object') return null;
  const result = {};
  for (const [name,field] of Object.entries(metrics)) {
    const values = Object.fromEntries(['home','away'].map(side => [side,amount(raw.stats[side]?.[field],name === 'possession' ? 100 : 1000)]));
    if (values.home !== null || values.away !== null) result[name] = values;
  }
  const xg = {};
  for (const side of ['home','away']) {
    const team = raw.stats[side];
    // No blending. A present-but-malformed primary value is not an excuse to
    // silently substitute another source. Null/undefined mean absent.
    const primary = team?.expected_goals != null;
    xg[side] = amount(primary ? team.expected_goals : team?.xg?.actual,100);
  }
  if (xg.home !== null || xg.away !== null) result.xg = {...xg,estimated:['home','away'].some(side => raw.stats[side]?.xg?.estimated === true)};
  return Object.keys(result).length ? result : null;
}
function players(rows,seen) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,40).flatMap(raw => {
    const playerId = id(raw?.id), name = text(raw?.name);
    if (!playerId || !name || seen.has(playerId)) return [];
    seen.add(playerId);
    return [{id:playerId,name,number:Number.isInteger(raw.jersey_number) && raw.jersey_number >= 0 && raw.jersey_number <= 999 ? raw.jersey_number : null,
      position:positions.get(raw.position) || 'unknown'}];
  });
}
export function normalizeLineups(raw,match) {
  if (!belongs(raw,match) || !raw.lineups || typeof raw.lineups !== 'object') return null;
  const result = {status:['confirmed','predicted'].includes(raw.lineup_status) ? raw.lineup_status : 'unknown'};
  for (const side of ['home','away']) {
    const team = raw.lineups[side], seen = new Set();
    if (!team || String(team.team_id) !== match[side].providerId) {result[side] = null; continue;}
    result[side] = {formation:typeof team.formation === 'string' && /^\d{1,2}(?:-\d{1,2}){1,5}$/.test(team.formation) ? team.formation : null,
      starters:players(team.players,seen),substitutes:players(team.substitutes,seen)};
    // Preserve raw XI integrity: trimming/deduplication must not turn 12 rows
    // into an apparently valid 11-player Match Studio input.
    result[side].startersValid = Array.isArray(team.players) && team.players.length === 11 && result[side].starters.length === 11;
  }
  return ['home','away'].some(side => result[side] && (result[side].starters.length || result[side].substitutes.length)) ? result : null;
}
export function normalizeIncidents(raw,match) {
  if (!belongs(raw,match) || !Array.isArray(raw.incidents) || raw.incidents.length > 500) return null;
  return raw.incidents.flatMap((row,sequence) => {
    if (!row || !Number.isInteger(row.minute) || row.minute < 0 || row.minute > 150) return [];
    const added = Number.isInteger(row.added_time) && row.added_time >= 0 && row.added_time <= 60 ? row.added_time : 0;
    const type = row.type === 'card' ? cardTypes.get(row.card_type) || 'unknown' : incidentTypes.get(row.type) || 'unknown';
    return [{sequence,minute:row.minute,added,type,side:row.is_home === true ? 'home' : row.is_home === false ? 'away' : null,
      goalKind:type === 'goal' ? (goalTypes.get(row.goal_type) || 'unknown') : null,
      player:{id:id(row.player_id),name:text(row.player)},
      incoming:type === 'substitution' ? {id:id(row.player_in_id),name:text(row.player_in)} : null,
      outgoing:type === 'substitution' ? {id:id(row.player_out_id),name:text(row.player_out)} : null,
      rescinded:row.rescinded === true}];
  }).sort((a,b) => a.minute-b.minute || a.added-b.added || a.sequence-b.sequence);
}
export function normalizeDetail(match,event,resources) {
  const statistics = normalizeStatistics(resources.stats.value,match), lineups = normalizeLineups(resources.lineups.value,match);
  const incidents = normalizeIncidents(resources.incidents.value,match);
  return {...match,venue:text(event.venue_name),statistics,lineups,incidents:incidents || [],
    substitutions:(incidents || []).filter(i => i.type === 'substitution'),
    availability:Object.fromEntries([['stats',statistics],['lineups',lineups],['incidents',incidents?.length]].map(([key,value]) =>
      [key,resources[key].failed ? 'error' : value ? 'available' : 'unavailable']))};
}
