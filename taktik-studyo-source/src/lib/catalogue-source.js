import {createCatalogue} from './catalogue.js';
import {createCanonicalCatalogue,catalogueError} from './catalogue-canonical.js';
import {createLocalCatalogueClient} from './catalogue-local-client.js';
import {squadFallback} from './catalogue-default-xi.js';
import {internalPlayerId} from './catalogue-identity.js';
import {serializeStudioProject} from './studio-project-snapshot.js';
const loopback=origin=>{try{const u=new URL(origin);return u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname);}catch{return false;}};
export const canonicalRows=players=>players.map(p=>({id:p.id,team_id:p.teamId,display_name:p.name,shirt_number:p.number,position_group:p.positionGroup,specific_position:p.specificPosition,catalogue_active:p.catalogueActive}));
export function createCatalogueSource({config,client,window,fetchImpl}){
 const source=config?.source??'legacy';if(!['legacy','canonical'].includes(source))throw catalogueError('catalogue_malformed');
 // Canonical (BSD) data: loopback development keeps the local PGlite transport; any other
 // origin reads the authenticated catalogue_* tables through the existing Supabase client.
 // There is no static roster fallback in either mode.
 // transport:'supabase' (local integration only) makes loopback use the Supabase tables too.
 const canonical=source==='canonical',local=canonical&&loopback(window?.location?.origin)&&config?.transport!=='supabase';
 const dataClient=canonical?(local?createLocalCatalogueClient({auth:client?.auth,origin:window.location.origin,fetchImpl}):client):client;
 const reader=canonical?createCanonicalCatalogue(dataClient):createCatalogue(client);
 let data,defaults={},pending,defaultsReady=null;
 function install(model,legacy){
  data=model;
  // Classic board wire model keeps its strict snapshot shape; canonical metadata
  // lives in the domain model, not additional serialized team fields.
  window.TAKTIK_TEAMS=canonical?model.teams.map(t=>({id:t.id,name:t.name,short:t.shortName,color:t.color,color2:t.color2})):legacy.teams;
  window.TAKTIK_ROSTERS=canonical?{teams:Object.fromEntries(model.teams.map(t=>[t.name,{identity:'internal',teamId:t.id,players:model.players.filter(p=>p.teamId===t.id).map(p=>({...p,position:p.positionGroup}))}]))}:{...window.TAKTIK_ROSTERS,teams:legacy.rosters};
  if(canonical)window.TAKTIK_CATALOGUE_RUNTIME=api;
 }
 const api={source,canonical,local,dataClient:canonical?dataClient:undefined,get model(){return data;},get defaultsReady(){return defaultsReady;},
  validateMatch(match){
   const people=['home','away'].flatMap(side=>['lineups','studioLineups'].flatMap(kind=>['starters','substitutes'].flatMap(group=>match[kind]?.[side]?.[group]||[])));
   for(const e of [...(match.incidents||[]),...(match.substitutions||[])])people.push(...[e.player,e.incoming,e.outgoing].filter(Boolean));
   if(people.some(p=>p.playerId!=null&&(!internalPlayerId(p.playerId)||!data?.players.some(row=>row.id===p.playerId))))return false;
   const m=match.canonicalModel;if(!m)return match.canonicalError==='provider_mapping_unresolved';
   if(m.matchId!==match.id||['home','away'].some(side=>!m[side]||!data?.teams.some(t=>t.id===m[side].teamId)||[...m[side].players,...m[side].bench].some(p=>!internalPlayerId(p.playerId)||!p.key.startsWith('internal:'+side+':'+m[side].teamId+':'))))return false;
   return !!serializeStudioProject({source:{mode:'match',matchId:match.id,week:null},model:m,working:['home','away'].flatMap(side=>m[side].players.map(p=>({slotKey:p.key,personKey:p.key,x:p.initialX,y:p.initialY}))),drawings:[],pitch:{color:'#285b3b',width:1200,height:650}});
  },
  async load(){
   if(pending)return pending;
   pending=(async()=>{
    if(!dataClient)throw catalogueError('network_failure');
    // Recent confirmed XIs can require multiple provider detail calls. The
    // catalogue is sufficient for a usable board; enrichment never remounts it.
    // Only the local transport serves defaults; elsewhere the deterministic squad arrangement applies.
    if(canonical&&!defaultsReady)defaultsReady=typeof dataClient.request==='function'?dataClient.request('defaults').then(context=>{if(!context.error&&context.data)defaults=context.data;}).catch(()=>{}):Promise.resolve();
    const result=await reader.load();
    if(canonical){install(result);}
    else install({teams:result.teams.map((t,i)=>({id:t.id,name:t.name,shortName:t.short,color:t.color,color2:t.color2,sortOrder:i,catalogueActive:true})),players:result.teams.flatMap(t=>result.rosters[t.name].players.map(p=>({id:p.id,teamId:t.id,name:p.name,number:p.number,positionGroup:p.position,specificPosition:null,catalogueActive:true})))},result);
    return data;
   })().catch(e=>{pending=null;throw e;});return pending;
  },
  selectXI(squad,formation){
   if(!canonical||!data||squad?.identity!=='internal')throw catalogueError('catalogue_malformed');
   const rows=canonicalRows(squad.players),saved=defaults[squad.teamId];
   const use=saved?.kind==='recent-confirmed'&&saved.starters.every(p=>rows.some(r=>r.id===p.playerId));
   const result=squadFallback(use?rows.filter(r=>saved.starters.some(p=>p.playerId===r.id)):rows,formation);
   return result.starters.map(p=>squad.players.find(r=>r.id===p.playerId));
  },
  arrangement(teamId){const players=data?.players.filter(p=>p.teamId===teamId);if(!players?.length)throw catalogueError('catalogue_empty');return defaults[teamId]||squadFallback(canonicalRows(players));},
 };
 return api;
}
