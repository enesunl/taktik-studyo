import {isMatchId,requestedMatchId} from './match-id.js';
import {requestedRound} from './matches.js';
import {detailValid} from './match-detail.js';
import {matchGoals} from './match-goals.js';

export function parseFormation(value) {
  if (typeof value !== 'string' || !/^[1-9](?:-[1-9]){1,4}$/.test(value)) return null;
  const lines=value.split('-').map(Number);
  return lines.reduce((a,b)=>a+b,0)===10 ? lines : null;
}
export function matchPageUrl(page,search) {
  const id=requestedMatchId(search),week=requestedRound(search);
  if (!id || !['/mac','/mac-studyosu'].includes(page)) return '/maclar';
  return page+'?id='+id+(week?'&hafta='+week:'');
}
export function matchStudioAvailable(match) {
  if (!match || !detailValid(match,match.id) || match.lineups?.status!=='confirmed') return false;
  return ['home','away'].every(side=>{
    const team=match.lineups[side],rows=team?.starters;
    return team?.startersValid===true && Array.isArray(rows) && rows.length===11
      && rows.every(p=>isMatchId(p.id)) && new Set(rows.map(p=>p.id)).size===11
      && rows.filter(p=>p.position==='goalkeeper').length===1;
  });
}
const order={defender:0,midfielder:1,forward:2,unknown:3};
export function createMatchLayout(match) {
  if (!matchStudioAvailable(match)) return null;
  const model={matchId:match.id},goals=matchGoals(match);
  for (const side of ['home','away']) {
    const source=match.lineups[side],team=match[side],formation=parseFormation(source.formation);
    const keeper=source.starters.find(p=>p.position==='goalkeeper');
    // Stable grouping preserves provider order within broad groups. No LB/RW/etc.
    const outfield=source.starters.filter(p=>p!==keeper).map((p,index)=>({p,index}))
      .sort((a,b)=>order[a.p.position]-order[b.p.position] || a.index-b.index).map(({p})=>p);
    const counts=formation || Object.keys(order).map(role=>outfield.filter(p=>p.position===role).length).filter(Boolean);
    const points=[{player:keeper,x:7,y:50}];let offset=0;
    counts.forEach((count,line)=>{
      const x=counts.length===1?30:18+line*27/(counts.length-1);
      const span=count===2?34:count===3?56:72;
      for(let i=0;i<count;i++) points.push({player:outfield[offset++],x,y:count===1?50:50-span/2+i*span/(count-1)});
    });
    const identity=p=>({key:match.id+':'+team.providerId+':'+p.id,playerId:p.id,number:p.number,name:p.name,position:p.position,goals:goals.count(side,p.id)});
    model[side]=Object.freeze({teamId:team.providerId,name:team.name,color:team.color,color2:team.color2,
      bench:Object.freeze(source.substitutes.map(p=>Object.freeze(identity(p)))),
      formation:formation?source.formation:null,players:Object.freeze(points.map(({player:p,x,y})=>Object.freeze({
        ...identity(p),
        initialX:side==='home'?x:100-x,initialY:y,
      })))});
  }
  return Object.freeze(model);
}
