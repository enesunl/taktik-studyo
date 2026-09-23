import {isMatchId} from './match-id.js';
// Shared normalized provider XI validation. Local rosters keep their separate IDs.
export const LINEUP_LABELS=Object.freeze({confirmed:'Onaylanmış ilk 11','probable-provider':'Muhtemel 11 · Sağlayıcı tahmini','probable-recent-match':'Muhtemel 11 · Son maç kadrosu baz alınmıştır','probable-local':'Muhtemel 11 · Taktik Stüdyo yerel tahmini'});
export function validXI(team){
  const player=p=>p&&isMatchId(p.id)&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=160
    &&['goalkeeper','defender','midfielder','forward','unknown'].includes(p.position)
    &&(p.number===null||Number.isInteger(p.number)&&p.number>=0&&p.number<=999);
  return team?.startersValid===true&&Array.isArray(team.starters)&&team.starters.length===11
    &&team.starters.every(player)&&Array.isArray(team.substitutes)&&team.substitutes.length<=40&&team.substitutes.every(player)
    &&(team.formation===null||typeof team.formation==='string'&&team.formation.length<=160)
    &&new Set([...team.starters,...team.substitutes].map(p=>p.id)).size===11+team.substitutes.length
    &&team.starters.filter(p=>p.position==='goalkeeper').length===1;
}
export function providerXI(match,side){
  const team=match.lineups?.[side],status=match.lineups?.status;
  return validXI(team)&&(status==='confirmed'||match.status==='upcoming'&&status==='predicted')?{...team,lineupKind:status==='confirmed'?'confirmed':'probable-provider'}:null;
}
