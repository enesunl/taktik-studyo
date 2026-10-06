import {internalPlayerId} from './catalogue-identity.js';
import {positionCompatibility} from './bsd-specific-position.js';
export const catalogueError=code=>Object.assign(new Error(code),{code});
const failure=e=>catalogueError(['42P01','PGRST205'].includes(e?.code)?'schema_unavailable':'network_failure');
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
// Team-only consumers do not need to fetch the player catalogue.
export function normalizeCanonicalTeams(teams){
 try{
  if(!Array.isArray(teams)||teams.length>500)throw Error();
  if(!teams.length)throw catalogueError('catalogue_empty');
  const result=teams.map(t=>{
   if(!/^[a-z][a-z0-9-]{0,79}$/.test(t.id)||t.id.startsWith('fotmob-')||!text(t.display_name,80)||!text(t.short_name,8)||!/^#[0-9a-f]{6}$/i.test(t.color_primary)||!/^#[0-9a-f]{6}$/i.test(t.color_secondary)||!Number.isInteger(t.sort_order)||t.catalogue_active!==true)throw Error();
   return {id:t.id,name:t.display_name,shortName:t.short_name,color:t.color_primary,color2:t.color_secondary,sortOrder:t.sort_order,catalogueActive:t.catalogue_active};
  });
  if(new Set(result.map(t=>t.id)).size!==result.length||new Set(result.map(t=>t.name)).size!==result.length)throw Error();
  return result.sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
 }catch(e){throw e.code?e:catalogueError('catalogue_malformed');}
}
export function normalizeCanonical(teams,players){
 try{
  if(!Array.isArray(teams)||!Array.isArray(players))throw Error();
  if(!teams.length||!players.length)throw catalogueError('catalogue_empty');
  const result={teams:normalizeCanonicalTeams(teams),players:players.map(p=>{
   if(!internalPlayerId(p.id)||!teams.some(t=>t.id===p.team_id)||!text(p.display_name,100)||p.catalogue_active!==true||!(p.shirt_number===null||Number.isInteger(p.shirt_number)&&p.shirt_number>=1&&p.shirt_number<=99))throw Error();
   positionCompatibility(p.position_group,p.specific_position);
   return {id:p.id,teamId:p.team_id,name:p.display_name,number:p.shirt_number,positionGroup:p.position_group,specificPosition:p.specific_position,catalogueActive:true};
  })};
  if(new Set(result.teams.map(t=>t.id)).size!==teams.length||new Set(result.teams.map(t=>t.name)).size!==teams.length||new Set(result.players.map(p=>p.id)).size!==players.length||result.teams.some(t=>result.players.filter(p=>p.teamId===t.id).length<11))throw Error();
  result.teams.sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));return result;
 }catch(e){throw e.code?e:catalogueError('catalogue_malformed');}
}
export function createCanonicalCatalogue(client,now=Date.now){
 let cache,expires=0,pending;
 async function read(){
  try{
   const t=await client.from('catalogue_teams').select('id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active').eq('catalogue_active',true).order('id').limit(501);
   if(t.error)throw failure(t.error);if(!Array.isArray(t.data)||t.data.length>500)throw catalogueError('catalogue_malformed');
   const rows=[];
   for(let page=0;page<100;page++){
    let q=client.from('catalogue_players').select('id,team_id,display_name,position_group,specific_position,shirt_number,catalogue_active').eq('catalogue_active',true).order('id').limit(1000);
    if(rows.length)q=q.gt('id',rows.at(-1).id);const r=await q;
    if(r.error)throw failure(r.error);if(!Array.isArray(r.data))throw catalogueError('catalogue_malformed');
    if(rows.length&&r.data.length&&r.data[0].id<=rows.at(-1).id)throw catalogueError('catalogue_malformed');
    rows.push(...r.data);if(r.data.length<1000)break;if(page===99)throw catalogueError('catalogue_malformed');
   }
   cache=normalizeCanonical(t.data,rows);expires=now()+300000;return cache;
  }catch(e){throw e.code?e:failure(e);}
 }
 return {
  async loadTeams(){
   try{
    const r=await client.from('catalogue_teams').select('id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active').eq('catalogue_active',true).order('id').limit(501);
    if(r.error)throw failure(r.error);
    return normalizeCanonicalTeams(r.data);
   }catch(e){throw e.code?e:failure(e);}
  },
  async hasActiveTeam(id){
   if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(id)||/^(fotmob|bsd)-/.test(id))return false;
   const r=await client.from('catalogue_teams').select('id').eq('id',id).eq('catalogue_active',true).maybeSingle();
   if(r.error)throw failure(r.error);
   return r.data?.id===id;
  },
  load(){if(cache&&now()<expires)return Promise.resolve(cache);if(!pending)pending=read().finally(()=>pending=null);return pending;}};
}
