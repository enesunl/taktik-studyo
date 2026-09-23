import {isMatchId,requestedMatchId} from './match-id.js';
import {requestedRound} from './matches.js';
import {detailValid} from './match-detail.js';
import {providerXI,validXI} from './studio-lineups.js';
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
export function resolveStudioLineups(match,local){
  const result={};
  for(const side of ['home','away'])result[side]=providerXI(match,side)
    ||(match.status==='upcoming'&&validXI(match.studioLineups?.[side])?match.studioLineups[side]:null)
    ||(match.status==='upcoming'?local?.lineup(match[side]):null);
  return result;
}
export function matchStudioAvailable(match,local) {
  if(!match||!detailValid(match,match.id))return false;
  const lineups=resolveStudioLineups(match,local);return ['home','away'].every(side=>validXI(lineups[side]));
}
export function createLocalCatalogue(window){
  const utils=window.TAKTIK_BOARD_UTILS,teams=Array.from(utils?.getLocalTeams?.()||[],team=>{
    const source=window.TAKTIK_ROSTERS?.teams?.[team.name]?.source,rosterId=source?.match(/\/teams\/(\d+)\//)?.[1];
    return {...team,id:team.id||(rosterId?'fotmob-'+rosterId:team.name)};
  });
  const lineup=team=>{
    const known=teams.find(t=>team?.providerId?t.id===team.teamId:t.id===team?.id);if(!known)return null;
    const squad=window.TAKTIK_ROSTERS?.teams?.[known.name],chosen=utils.selectRosterXI(squad,'4-3-3');
    const convert=p=>p&&({id:String(p.id),name:p.name,number:p.number??null,position:({G:'goalkeeper',D:'defender',M:'midfielder',F:'forward'})[p.position]||'unknown'});
    const starters=chosen.map(convert),row={starters,startersValid:true,formation:'4-3-3',substitutes:[],lineupKind:'probable-local'};
    if(!validXI(row))return null;
    const ids=new Set(starters.map(p=>p.id));row.substitutes=(squad.players||[]).map(convert).filter(p=>p&&isMatchId(p.id)&&p.name&&!ids.has(p.id)&&ids.add(p.id)).slice(0,40);return validXI(row)?row:null;
  };
  return {teams,lineup};
}
export const emptyStudioTeam=()=>({teamId:null,name:'',color:'#285b3b',color2:'#ffffff',players:[],bench:[],formation:null});
export function createFreeTeam(team,side,local){
  const source=local.lineup(team);return source?layoutTeam({teamId:team.id||team.name,...team},source,side,'local',()=>0):null;
}
const order={defender:0,midfielder:1,forward:2,unknown:3};
export function createMatchLayout(match,local) {
  if (!matchStudioAvailable(match,local)) return null;
  const model={matchId:match.id},goals=matchGoals(match),lineups=resolveStudioLineups(match,local);
  for(const side of ['home','away'])model[side]=layoutTeam({...match[side],teamId:match[side].providerId},lineups[side],side,match.id,id=>match.status==='upcoming'?0:goals.count(side,id));
  return Object.freeze(model);
}
function layoutTeam(team,source,side,prefix,goalCount){
    const formation=parseFormation(source.formation);
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
    const identity=p=>({key:prefix+':'+side+':'+team.teamId+':'+p.id,playerId:p.id,number:p.number,name:p.name,position:p.position,goals:goalCount(p.id)});
    return Object.freeze({lineupKind:source.lineupKind,teamId:team.teamId,name:team.name,color:team.color,color2:team.color2,
      bench:Object.freeze(source.substitutes.map(p=>Object.freeze(identity(p)))),
      formation:formation?source.formation:null,players:Object.freeze(points.map(({player:p,x,y})=>Object.freeze({
        ...identity(p),
        initialX:side==='home'?x:100-x,initialY:y,
      })))});
}
