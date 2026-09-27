import {createCatalogue} from './catalogue.js';
import {createCanonicalCatalogue,catalogueError} from './catalogue-canonical.js';
import {createLocalCatalogueClient} from './catalogue-local-client.js';
import {squadFallback} from './catalogue-default-xi.js';
import {internalPlayerId} from './catalogue-identity.js';
import {serializeStudioProject} from './studio-project-snapshot.js';
export const canonicalRows=players=>players.map(p=>({id:p.id,team_id:p.teamId,display_name:p.name,shirt_number:p.number,position_group:p.positionGroup,specific_position:p.specificPosition,catalogue_active:p.catalogueActive}));
export function createCatalogueSource({config,client,window,fetchImpl}){
 const source=config?.source??'legacy';if(!['legacy','canonical'].includes(source))throw catalogueError('catalogue_malformed');
 const canonical=source==='canonical',dataClient=canonical?createLocalCatalogueClient({auth:client?.auth,origin:window.location.origin,fetchImpl}):client;
 const reader=canonical?createCanonicalCatalogue(dataClient):createCatalogue(client);
 let data,defaults={},pending;const identities=new Map();
 const key=(id,source)=>internalPlayerId(id)?'internal:'+id:(source||'local')+':'+id;
 async function resolveKeys(keys){
  if(!canonical)return {};
  const requested=[...new Set(keys.filter(k=>typeof k==='string'&&/^(local:|bsd:)/.test(k)))];
  for(let i=0;i<requested.length;i+=500){const r=await dataClient.request('resolve',{keys:requested.slice(i,i+500)});if(r.error)throw catalogueError('provider_mapping_unresolved');for(const [k,v]of Object.entries(r.data))if(internalPlayerId(v))identities.set(k,'internal:'+v);}
  return Object.fromEntries(identities);
 }
 function install(model,legacy){
  data=model;
  // Classic board wire model keeps its strict snapshot shape; canonical metadata
  // lives in the domain model, not additional serialized team fields.
  window.TAKTIK_TEAMS=canonical?model.teams.map(t=>({id:t.id,name:t.name,short:t.shortName,color:t.color,color2:t.color2})):legacy.teams;
  window.TAKTIK_ROSTERS=canonical?{teams:Object.fromEntries(model.teams.map(t=>[t.name,{identity:'internal',teamId:t.id,players:model.players.filter(p=>p.teamId===t.id).map(p=>({...p,position:p.positionGroup}))}]))}:{...window.TAKTIK_ROSTERS,teams:legacy.rosters};
  if(canonical)window.TAKTIK_CATALOGUE_RUNTIME=api;
 }
 const api={source,canonical,dataClient:canonical?dataClient:undefined,key,resolveKeys,resolveKey:k=>identities.get(k)||k,get model(){return data;},
  validateMatch(match){
   const m=match.canonicalModel;if(!m)return match.canonicalError==='provider_mapping_unresolved';
   if(m.matchId!==match.id||['home','away'].some(side=>!m[side]||!data?.teams.some(t=>t.id===m[side].teamId)||[...m[side].players,...m[side].bench].some(p=>!internalPlayerId(p.playerId)||!p.key.startsWith('internal:'+side+':'+m[side].teamId+':'))))return false;
   return !!serializeStudioProject({source:{mode:'match',matchId:match.id,week:null},model:m,working:['home','away'].flatMap(side=>m[side].players.map(p=>({slotKey:p.key,personKey:p.key,x:p.initialX,y:p.initialY}))),drawings:[],pitch:{color:'#285b3b',width:1200,height:650}});
  },
  async load(){
   if(pending)return pending;
   pending=(async()=>{
    if(!canonical&&!client)return;
    const result=await reader.load();
    if(canonical){const context=await dataClient.request('defaults');if(context.error)throw catalogueError(context.error.code);defaults=context.data;install(result);}
    else install({teams:result.teams.map((t,i)=>({id:t.id,name:t.name,shortName:t.short,color:t.color,color2:t.color2,sortOrder:i})),players:result.teams.flatMap(t=>result.rosters[t.name].players.map(p=>({id:p.id,teamId:t.id,name:p.name,number:p.number,positionGroup:p.position,specificPosition:null,catalogueActive:true})))},result);
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
