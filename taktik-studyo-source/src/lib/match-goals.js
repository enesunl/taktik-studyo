import {incidentMinute} from './match-detail.js';

// Match facts stay separate from the user's tactical substitutions/positions.
export function matchGoals(match) {
  const rows={home:[],away:[]},counts=new Map(),groups={home:new Map(),away:new Map()};
  const members={};
  for(const side of ['home','away'])members[side]=new Set(['starters','substitutes'].flatMap(k=>(match.lineups?.[side]?.[k]||[]).map(p=>p.id)));
  const events=[...(match.incidents||[])].sort((a,b)=>a.minute-b.minute||a.added-b.added||a.sequence-b.sequence);
  for(const event of events){
    if(event.type!=='goal'||event.rescinded)continue;
    const own=event.goalKind==='own',id=event.player.id;
    const membership=['home','away'].filter(s=>id&&members[s].has(id));
    // Known own-goal scorer belongs to the opponent of the credited team.
    // When membership is missing/ambiguous, retain the incident side, not a guess.
    const side=own&&membership.length===1?(membership[0]==='home'?'away':'home'):event.side;
    if(!['home','away'].includes(side))continue;
    if(id&&!own){const key=side+':'+id;counts.set(key,(counts.get(key)||0)+1);}
    if(!event.player.name)continue;
    // Never merge unknown player identities by name alone.
    const key=(id||'event:'+event.sequence)+':'+(own?'own':'goal');
    let group=groups[side].get(key);
    if(!group){group={name:event.player.name,minutes:[],own};groups[side].set(key,group);rows[side].push(group);}
    group.minutes.push(incidentMinute(event)+(own?' (KK)':event.goalKind==='penalty'?' (P)':''));
  }
  return {rows,count:(side,id)=>counts.get(side+':'+id)||0};
}
export function appendScorers(document,parent,rows) {
  if(!rows.length)return;
  const list=document.createElement('ul');list.className='match-scorers';list.setAttribute('aria-label','Goller');
  for(const row of rows){const item=document.createElement('li');item.textContent=row.name+' '+row.minutes.join(', ');list.append(item);}
  parent.append(list);
}
export function goalMarkers(document,count) {
  if(!count)return null;
  const row=document.createElement('span');row.className='match-player-goals';row.setAttribute('role','img');row.setAttribute('aria-label',count+' gol');
  for(let i=0;i<count;i++){const ball=document.createElement('span');ball.textContent='⚽';ball.setAttribute('aria-hidden','true');row.append(ball);}
  return row;
}
