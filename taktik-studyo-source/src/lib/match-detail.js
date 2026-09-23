import {validXI} from './studio-lineups.js';
import {requestedMatchId,isMatchId} from './match-id.js';
import {requestedRound,seasonValid} from './matches.js';
import {requestMatches,detailError} from './matches-transport.js';
export {requestedMatchId};
export const POSITION_LABELS = Object.freeze({goalkeeper:'KL',defender:'DEF',midfielder:'ORT',forward:'FOR',unknown:'—'});
export const STAT_LABELS = Object.freeze({possession:'Topa sahip olma',shots:'Şut',shotsOnTarget:'İsabetli şut',corners:'Korner',fouls:'Faul',offsides:'Ofsayt',yellowCards:'Sarı kart',redCards:'Kırmızı kart',xg:'Beklenen gol (xG)'});
export const INCIDENT_LABELS = Object.freeze({goal:'Gol',yellow:'Sarı kart',red:'Kırmızı kart',yellowRed:'İkinci sarıdan kırmızı kart',substitution:'Oyuncu değişikliği',period:'Devre / maç sonu',addedTime:'Uzatma süresi',var:'VAR kararı',unknown:'Maç olayı'});
export const backToMatches = search => '/maclar'+(requestedRound(search) ? '?hafta='+requestedRound(search) : '');
export const incidentMinute = event => String(event.minute)+(event.added ? '+'+event.added : '')+"′";
const nameValid = value => value === null || typeof value === 'string' && value.length <= 160;
const personValid = value => value && (value.id === null || isMatchId(value.id)) && nameValid(value.name);
function incidentValid(e) {
  return e && Number.isInteger(e.minute) && e.minute >= 0 && e.minute <= 150 && Number.isInteger(e.added) && e.added >= 0 && e.added <= 60
    && Object.hasOwn(INCIDENT_LABELS,e.type) && ['home','away',null].includes(e.side) && personValid(e.player)
    && (e.goalKind === undefined || [null,'regular','penalty','own','unknown'].includes(e.goalKind))
    && (e.incoming === null || personValid(e.incoming)) && (e.outgoing === null || personValid(e.outgoing));
}
export function detailValid(data,id) {
  if (!data || data.id !== id || !seasonValid({season:'2026-2027',matches:[data]}) || !nameValid(data.venue)) return false;
  if (!data.availability || !['stats','lineups','incidents'].every(k => ['available','unavailable','error'].includes(data.availability[k]))) return false;
  if (data.statistics !== null && (!data.statistics || Object.entries(data.statistics).some(([k,v]) => !Object.hasOwn(STAT_LABELS,k) || !v || ['home','away'].some(s => v[s] !== null && (typeof v[s] !== 'number' || !Number.isFinite(v[s]) || v[s] < 0 || v[s] > 1000))))) return false;
  if(data.studioLineups!==undefined){
    if(data.status!=='upcoming'||!data.studioLineups)return false;
    for(const side of ['home','away']){const t=data.studioLineups[side];if(t!==null&&(!validXI(t)||!['confirmed','probable-provider','probable-recent-match'].includes(t.lineupKind)||t.lineupKind==='probable-recent-match'&&!isMatchId(t.sourceMatchId)))return false;}
  }
  if (data.lineups !== null) {
    if (!data.lineups || !['confirmed','predicted','unknown'].includes(data.lineups.status)) return false;
    for (const side of ['home','away']) {
      const team = data.lineups[side];if (team === null) continue;
      if (!team || !nameValid(team.formation)) return false;
      for (const group of ['starters','substitutes']) if (!Array.isArray(team[group]) || team[group].length > 40 || team[group].some(p => !p || !isMatchId(p.id) || typeof p.name !== 'string' || p.name.length > 160 || !Object.hasOwn(POSITION_LABELS,p.position) || !(p.number === null || Number.isInteger(p.number) && p.number >= 0 && p.number <= 999))) return false;
    }
  }
  return ['incidents','substitutions'].every(k => Array.isArray(data[k]) && data[k].length <= 500 && data[k].every(incidentValid));
}
export function createMatchDetailApi({client,current,location,fetchImpl}) {
  return {async load(id) {
    if (!isMatchId(id)) return {ok:false,error:{code:'INVALID_MATCH_ID'}};
    if (!current()) return {ok:false,error:{code:'state_changed'}};
    try {
      if (!client) throw Error('PROVIDER_UNAVAILABLE');
      const {data,error} = await requestMatches({client,current,location,fetchImpl,id});
      if (!current()) return {ok:false,error:{code:'state_changed'}};
      if (error) throw Error(detailError(error.context?.status));
      if (!detailValid(data,id)) throw Error('PROVIDER_UNAVAILABLE');
      return {ok:true,match:data};
    } catch (error) {return {ok:false,error:{code:!current() ? 'state_changed' : ['INVALID_MATCH_ID','MATCH_NOT_FOUND','UNAUTHORIZED'].includes(error?.message) ? error.message : 'PROVIDER_UNAVAILABLE'}};}
  }};
}
