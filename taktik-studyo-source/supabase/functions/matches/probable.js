import {providerXI} from '../../../src/lib/studio-lineups.js';

export const HISTORY_LIMIT=2;
// Only same-season, completed fixtures strictly before the target AND now.
// Two candidates per side bound cold provider cost; frontend supplies local fallback.
export async function resolveProbableXI(match,{season,detail,now}){
  const studioLineups={home:providerXI(match,'home'),away:providerXI(match,'away')};
  if(match.status!=='upcoming'||studioLineups.home&&studioLineups.away)return match;
  let fixtures;try{fixtures=await season();}catch{return {...match,studioLineups};}
  await Promise.all(['home','away'].map(async side=>{
    if(studioLineups[side])return;
    const team=match[side].providerId,cutoff=Math.min(Date.parse(match.kickoff),now());
    const candidates=fixtures.matches.filter(m=>m.id!==match.id&&m.season===match.season&&m.status==='finished'&&Date.parse(m.kickoff)<cutoff&&[m.home.providerId,m.away.providerId].includes(team))
      .sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)).slice(0,HISTORY_LIMIT);
    for(const candidate of candidates){
      let previous;try{previous=(await detail(candidate.id)).data;}catch{continue;}
      if(previous.id!==candidate.id||previous.season!==match.season||previous.status!=='finished'||Date.parse(previous.kickoff)>=cutoff)continue;
      const oldSide=['home','away'].find(s=>previous[s].providerId===team);
      const row=oldSide&&providerXI(previous,oldSide);
      if(row?.lineupKind==='confirmed'){studioLineups[side]={...row,lineupKind:'probable-recent-match',sourceMatchId:previous.id};break;}
    }
  }));
  return {...match,studioLineups};
}
