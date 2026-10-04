import {ROUNDS} from './matches.js';

// A finished fixture is evidence of a played round; live/upcoming dates aren't.
export function latestPlayedWeek(matches,now=Date.now()){
 const played=(Array.isArray(matches)?matches:[]).filter(m=>m?.status==='finished'&&ROUNDS.includes(m.round)&&Number.isFinite(Date.parse(m.kickoff))&&Date.parse(m.kickoff)<=now);
 played.sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||b.round-a.round);
 return played[0]?.round??null;
}
export const weeklyWeekText=week=>({number:ROUNDS.includes(week)?String(week):'—'});

const geometry=[[0,0,4,2],[4,0,2,3],[0,2,2,2],[2,2,2,1],[2,3,4,1],[0,4,3,2],[3,4,1,2],[4,4,2,2]];
// Fixed, gap-free 6x6 composition. Four dominant clubs, weighted by selections.
export function weeklyMosaic(slots){
 const clubs=new Map();
 for(const {player:p}of slots){
  if(!p||!/^#[\da-f]{6}$/i.test(p.color)||!/^#[\da-f]{6}$/i.test(p.color2))continue;
  const entry=clubs.get(p.teamId)||{id:p.teamId,color:p.color,accent:p.color2,count:0,used:0};entry.count++;clubs.set(p.teamId,entry);
 }
 const ranked=[...clubs.values()].sort((a,b)=>b.count-a.count||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,4),total=ranked.reduce((n,c)=>n+c.count,0);
 return geometry.map(([x,y,w,h],i)=>{
  const club=i<ranked.length?ranked[i]:ranked.reduce((best,c)=>!best||c.count/total*8-c.used>best.count/total*8-best.used?c:best,null);
  if(club)club.used++;
  return {x,y,w,h,color:club?.color??null,accent:club?.accent??null};
 });
}
