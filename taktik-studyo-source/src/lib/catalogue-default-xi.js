import {positionCompatibility} from './bsd-specific-position.js';
import {validXI} from './studio-lineups.js';
import {parseFormation} from './match-layout.js';
// Product-owned slot templates, independent of provider player classifications.
export const FORMATION_SLOTS=Object.freeze({
  '4-3-3':['KL','SLB','STP','STP','SĞB','MO','ÖL','MO','SLK','SF','SĞK'],
  '4-2-3-1':['KL','SLB','STP','STP','SĞB','ÖL','ÖL','SLK','OO','SĞK','SF'],
  '4-4-2':['KL','SLB','STP','STP','SĞB','MO','MO','MO','MO','SF','SF'],
  '3-5-2':['KL','STP','STP','STP','MO','MO','ÖL','MO','MO','SF','SF'],
});
export function formationSlots(formation){
  if(FORMATION_SLOTS[formation])return [...FORMATION_SLOTS[formation]];
  const lines=parseFormation(formation);if(!lines)throw Error('unsupported_formation');
  // Unlisted valid formations still get product-defined slots, never copied
  // player roles: defensive line, middle lines, then final attacking line.
  return ['KL',...lines.flatMap((count,line)=>Array.from({length:count},(_,i)=>{
    if(line===0)return count>=4&&i===0?'SLB':count>=4&&i===count-1?'SĞB':'STP';
    if(line===lines.length-1)return count>=3&&i===0?'SLK':count>=3&&i===count-1?'SĞK':'SF';
    return lines.length>=4&&line===1?'ÖL':lines.length>=4&&line===lines.length-2?'OO':'MO';
  }))];
}
const order=(a,b)=>(a.shirt_number??100)-(b.shirt_number??100)||(a.id<b.id?-1:a.id>b.id?1:0);
export function squadFallback(players,formation='4-3-3'){
  const roles=formationSlots(formation);
  const available=players.filter(p=>p.catalogue_active!==false).sort(order),chosen=new Set();
  if(available.length<11||!available.some(p=>p.position_group==='G'))throw Error('incomplete_squad');
  const starters=roles.map((role,slot)=>{
    const eligible=available.filter(p=>!chosen.has(p.id)&&(role==='KL'?p.position_group==='G':p.position_group!=='G'));
    const rank=p=>{const c=positionCompatibility(p.position_group,p.specific_position);return c.preferredSlot===role?0:c.slots.includes(role)?1:2;};
    eligible.sort((a,b)=>rank(a)-rank(b)||order(a,b));const p=eligible[0];if(!p)throw Error('incomplete_squad');chosen.add(p.id);
    return {playerId:p.id,role,slot,compatibilityFallback:rank(p)===2};
  });
  return {kind:'default-arrangement',formation,starters,bench:available.filter(p=>!chosen.has(p.id)).map(p=>p.id)};
}
export function defaultXI({teamId,seasonId,players,matches=[],resolver}){
  const squad=players.filter(p=>p.team_id===teamId&&p.catalogue_active!==false),ids=new Set(squad.map(p=>p.id));
  const latest=matches.filter(m=>m.status==='finished'&&m.seasonId===seasonId&&m.teamId===teamId&&Number.isFinite(Date.parse(m.kickoff)))
    .sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||(String(a.id)<String(b.id)?-1:1))[0];
  // Only latest completed same-season CONFIRMED XI, never predicted or stale season.
  if(latest?.kind==='confirmed'&&validXI(latest.lineup)&&parseFormation(latest.lineup.formation)){
    const source=[...latest.lineup.starters,...latest.lineup.substitutes],mapped=source.map(p=>resolver.player(p.id,'bsd'));
    if(mapped.every(id=>id&&ids.has(id))&&new Set(mapped).size===mapped.length){
      // Normalized lineups preserve provider order but do not promise slot order.
      // Assign selected XI to formation slots deterministically, keep exact XI set.
      const placed=squadFallback(squad.filter(p=>mapped.slice(0,11).includes(p.id)),latest.lineup.formation);
      return {...placed,kind:'recent-confirmed',matchId:latest.id,bench:mapped.slice(11)};
    }
  }
  return squadFallback(squad);
}
