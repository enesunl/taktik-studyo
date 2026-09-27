import {openCatalogueDatabase,localQuery} from './local-database.mjs';
import {providerIdentityResolver} from '../../src/lib/catalogue-identity.js';
import {defaultXI,squadFallback} from '../../src/lib/catalogue-default-xi.js';
import {layoutTeam,parseFormation} from '../../src/lib/match-layout.js';
import {validXI} from '../../src/lib/studio-lineups.js';
import {matchGoals} from '../../src/lib/match-goals.js';
import {fetchSeason,fetchDetail,SEASON,SEASON_ID} from '../../supabase/functions/matches/provider.js';
import {generateFallback} from './fallback.mjs';
export async function createLocalCatalogueService({dataDir,authenticate,port,token,loadSeason,loadDetail}){
 const local=await openCatalogueDatabase(dataDir),{db,state}=local,resolver=providerIdentityResolver(state);
 const teamResolver=providerId=>{
  const id=resolver.team(String(providerId),'bsd'),team=state.teams.find(t=>t.id===id&&t.catalogue_active);
  return team?{providerId:String(providerId),teamId:id,name:team.display_name,color:team.color_primary,color2:team.color_secondary}:null;
 };
 loadSeason??=options=>fetchSeason({...options,teamResolver});
 loadDetail??=options=>fetchDetail({...options,teamResolver});
 let pending,until=0,cached;
 function resolveLineup(source,teamId){
  if(!validXI(source)||!parseFormation(source.formation))return null;
  const squad=state.players.filter(p=>p.team_id===teamId&&p.catalogue_active),ids=new Set(squad.map(p=>p.id));
  const mapped=[...source.starters,...source.substitutes].map(p=>resolver.player(p.id,'bsd'));
  if(!mapped.every(id=>ids.has(id))||new Set(mapped).size!==mapped.length)return null;
  // Provider lineup and canonical position facts can disagree: never force an invalid XI.
  if(squad.filter(p=>mapped.slice(0,11).includes(p.id)&&p.position_group==='G').length!==1)return null;
  return mapped;
 }
 function canonicalEvent(match){
  const result={...match};
  for(const side of ['home','away']){const id=resolver.team(match[side].providerId,'bsd'),team=state.teams.find(t=>t.id===id);result[side]={...match[side],teamId:id,...(team?{name:team.display_name,color:team.color_primary,color2:team.color_secondary}:{})};}
  return result;
 }
 async function defaults(){
  if(cached&&Date.now()<until)return cached;if(pending)return pending;
  pending=(async()=>{
   const matches=[];
   if(token){
    try{
     const season=await loadSeason({token}),detailCache=new Map();
     for(const team of state.teams){
      const pid=state.teamMappings.find(m=>m.team_id===team.id&&m.provider==='bsd')?.provider_id;
      const match=season.matches.filter(m=>m.season===SEASON&&m.status==='finished'&&[m.home.providerId,m.away.providerId].includes(pid)).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff))[0];
      if(!match)continue;
      if(!detailCache.has(match.id))detailCache.set(match.id,await loadDetail({id:match.id,token}));
      const d=detailCache.get(match.id),side=d.home.providerId===pid?'home':'away';
      if(d.id!==match.id||d.season!==SEASON||d[side].providerId!==pid)continue;
      matches.push({id:d.id,teamId:team.id,seasonId:String(SEASON_ID),kickoff:d.kickoff,status:d.status,kind:d.lineups?.status,lineup:resolveLineup(d.lineups?.[side],team.id)?d.lineups[side]:null});
     }
    }catch{/* Confirmed data unavailable: labelled deterministic arrangement, never legacy fallback. */}
   }
   cached=Object.fromEntries(state.teams.map(t=>[t.id,defaultXI({teamId:t.id,seasonId:String(SEASON_ID),players:state.players,matches,resolver})]));until=Date.now()+300000;return cached;
  })().finally(()=>pending=null);return pending;
 }
 async function canonicalMatch(match){
  match=canonicalEvent(match);
  const arrangements=await defaults(),model={matchId:match.id},goals=matchGoals(match);
  for(const side of ['home','away']){
   const id=resolver.team(match[side].providerId,'bsd'),team=state.teams.find(t=>t.id===id);
   if(!team)return {...match,canonicalModel:null,canonicalError:'provider_mapping_unresolved'};
   const squad=state.players.filter(p=>p.team_id===id&&p.catalogue_active);
   const source=match.lineups?.status==='confirmed'?match.lineups[side]:null;
   const resolved=resolveLineup(source,id);
   let arrangement=arrangements[id],lineupKind='probable-local',goalIds=new Map();
   if(resolved){
    const placed=squadFallback(squad.filter(p=>resolved.slice(0,11).includes(p.id)),source.formation||'4-3-3');
    arrangement={...placed,bench:resolved.slice(11)};lineupKind='confirmed';
    [...source.starters,...source.substitutes].forEach((p,i)=>goalIds.set(resolved[i],p.id));
   }else if(arrangement.kind==='recent-confirmed')lineupKind='probable-recent-match';
   const convert=pid=>{const p=squad.find(p=>p.id===pid);return {id:p.id,name:p.display_name,number:p.shirt_number,position:({G:'goalkeeper',D:'defender',M:'midfielder',F:'forward'})[p.position_group]};};
   const line={formation:arrangement.formation,lineupKind,starters:arrangement.starters.map(p=>convert(p.playerId)),substitutes:arrangement.bench.map(convert)};
   model[side]=layoutTeam({teamId:id,name:team.display_name,color:team.color_primary,color2:team.color_secondary},line,side,'internal',pid=>goals.count(side,goalIds.get(pid)));
  }
  // Provider DTO identities stay separate; presentation gets only a resolved internal key.
  const person=p=>p?{...p,playerId:resolver.player(p.id,'bsd')}:p;
  const lineups=lines=>lines?{...lines,...Object.fromEntries(['home','away'].map(side=>[side,lines[side]?{...lines[side],starters:lines[side].starters.map(person),substitutes:lines[side].substitutes.map(person)}:null]))}:lines;
  const events=rows=>rows.map(e=>({...e,player:person(e.player),incoming:person(e.incoming),outgoing:person(e.outgoing)}));
  return {...match,lineups:lineups(match.lineups),...(match.studioLineups?{studioLineups:lineups(match.studioLineups)}:{}),incidents:events(match.incidents),substitutions:events(match.substitutions),canonicalModel:model};
 }
 async function handle(request){
  const headers={'Content-Type':'application/json','Cache-Control':'no-store'},reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  const url=new URL(request.url),origins=['http://localhost:'+port,'http://127.0.0.1:'+port];
  if(!origins.includes(url.origin)||!origins.includes(request.headers.get('origin')))return reply(403,{error:{code:'origin_denied'}});
  if(request.method!=='POST'||request.headers.get('content-type')!=='application/json')return reply(405,{error:{code:'invalid_request'}});
  try{
   const authorization=request.headers.get('authorization')||'';
   if(!/^Bearer \S+$/.test(authorization))return reply(401,{error:{code:'auth_unavailable'}});
   const user=await authenticate(authorization.slice(7));if(!user?.id)return reply(401,{error:{code:'auth_unavailable'}});
   const raw=await request.text();if(raw.length>4*1024*1024)return reply(413,{error:{code:'invalid_request'}});const body=JSON.parse(raw);
   if(body.action==='query')return reply(200,await localQuery(db,user.id,body.query));
   if(body.action==='defaults')return reply(200,{data:await defaults()});
   if(body.action==='fallback')return new Response(generateFallback(state),{status:200,headers});
   return reply(400,{error:{code:'invalid_request'}});
  }catch{return reply(503,{error:{code:'catalogue_unavailable'}});}
 }
 return {handle,canonicalMatch,canonicalEvent,defaults,loadSeason,loadDetail,teamResolver,...local,resolver};
}
