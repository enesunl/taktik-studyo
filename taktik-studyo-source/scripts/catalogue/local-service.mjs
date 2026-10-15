import {openCatalogueDatabase,localQuery} from './local-database.mjs';
import {providerIdentityResolver} from '../../src/lib/catalogue-identity.js';
import {canonicalService} from '../../supabase/functions/matches/canonical.js';
import {fetchSeason,fetchDetail} from '../../supabase/functions/matches/provider.js';
import {generateFallback} from './fallback.mjs';
export async function createLocalCatalogueService({dataDir,authenticate,port,token,loadSeason,loadDetail}){
 const local=await openCatalogueDatabase(dataDir),{db,state}=local,resolver=providerIdentityResolver(state);
 const teamResolver=providerId=>{
  const id=resolver.team(String(providerId),'bsd'),team=state.teams.find(t=>t.id===id&&t.catalogue_active);
  return team?{providerId:String(providerId),teamId:id,name:team.display_name,color:team.color_primary,color2:team.color_secondary}:null;
 };
 loadSeason??=options=>fetchSeason({...options,teamResolver});
 loadDetail??=options=>fetchDetail({...options,teamResolver});
 // Canonical match presentation is shared with the matches Edge Function (PROD1.5).
 const canon=canonicalService(state,{loadSeason:token?()=>loadSeason({token}):null,loadDetail:token?({id})=>loadDetail({id,token}):null});
 const {canonicalEvent,canonicalMatch,defaults}=canon;
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
