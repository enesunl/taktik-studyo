import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openCatalogueDatabase,cleanCatalogueInput} from '../scripts/catalogue/local-database.mjs';
import {readCanonicalState,syncLocal,fetchBsdCatalogue} from '../scripts/catalogue/sync.mjs';
import {createLocalCatalogueService} from '../scripts/catalogue/local-service.mjs';
import {providerIdentityResolver} from '../src/lib/catalogue-identity.js';
import {event} from './helpers/matches-fixture.mjs';

test('D4 zero-data SQL sync: no legacy schema/alias access, stable IDs, team departure, metadata ownership',async()=>{
 const {db}=await openCatalogueDatabase(undefined,{populate:false}),input=cleanCatalogueInput();
 try{
  let state=await readCanonicalState(db);assert.equal(state.teams.length,0);assert.equal(state.players.length,0);
  assert.equal((await db.query("select to_regclass('public.teams') t,to_regclass('public.players') p")).rows[0].t,null);
  // No alias table is available even to an accidental server-side reader.
  await db.exec('drop table public.legacy_player_aliases,public.legacy_team_aliases');
  const first=await syncLocal(db,input,{dryRun:false});
  assert.equal(first.teams.length,18);assert.equal(first.players.length,543);
  const second=await syncLocal(db,input,{dryRun:false});assert.deepEqual(second.players,first.players);
  const changed=structuredClone(input);Object.assign(changed.teams[0],{short_name:'BAD',color_primary:'#000000',color_secondary:'#000000',sort_order:999});
  await syncLocal(db,changed,{dryRun:false});state=await readCanonicalState(db);
  for(const field of ['short_name','color_primary','color_secondary','sort_order'])assert.equal(state.teams.find(t=>t.id===input.teams[0].id)[field],input.teams[0][field]);
  const missingTeam=input.teams[0].id;
  await syncLocal(db,{...input,teams:input.teams.slice(1),players:input.players.filter(p=>p.team_id!==missingTeam)},{dryRun:false});
  state=await readCanonicalState(db);assert.equal(state.teams.find(t=>t.id===missingTeam).catalogue_active,false);
  assert(state.players.filter(p=>p.team_id===missingTeam).every(p=>!p.catalogue_active));
  await syncLocal(db,input,{dryRun:false});state=await readCanonicalState(db);
  assert.deepEqual(state.players.map(p=>p.id).sort(),first.players.map(p=>p.id).sort());assert(state.players.every(p=>p.catalogue_active));
  const added=structuredClone(input);added.players.push({...input.players[0],provider_id:'9999999999',display_name:'New fixture player'});
  const next=await syncLocal(db,added,{dryRun:false});assert.equal(next.summary.newPlayers,1);
  const resolver=providerIdentityResolver(await readCanonicalState(db));
  assert.equal(resolver.team('125'),'galatasaray');assert.equal(resolver.player(input.players[0].provider_id),first.players[0].id);
  assert.equal(resolver.player('does-not-exist'),null);assert.equal(resolver.team('fotmob-8637','legacy'),null);
  // Empty old tables are equally irrelevant; no population or grants are needed.
  await db.exec('create table public.teams(id text);create table public.players(id text);create table public.legacy_team_aliases(id text);create table public.legacy_player_aliases(id text)');
  await syncLocal(db,input,{dryRun:false});assert.equal((await db.query('select count(*)::int n from public.teams')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.legacy_player_aliases')).rows[0].n,0);
  assert.equal((await readCanonicalState(db)).players.filter(p=>p.catalogue_active).length,543);
 }finally{await db.close();}
});

test('D4 clean BSD input and real normalizer: fixed season GETs, no media or legacy catalogue',async()=>{
 const input=cleanCatalogueInput(),registrations=JSON.parse(readFileSync(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
 const calls=[];
 const fetchImpl=async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');calls.push(url);
  const path=new URL(url).pathname;let body;
  if(path.endsWith('/teams/')){
   assert.equal(new URL(url).searchParams.get('league_id'),'11');assert.equal(new URL(url).searchParams.get('season_id'),'1539');
   body={next:null,count:18,results:registrations.map(t=>({id:Number(t.bsdId)}))};
  }else if(path.endsWith('/squad/')){
   const reg=registrations.find(t=>path.includes('/teams/'+t.bsdId+'/'));
   const players=input.players.filter(p=>p.team_id===reg.id);
   body={team_id:Number(reg.bsdId),count:players.length,players:players.map(p=>({id:Number(p.provider_id),name:p.display_name,position:p.position_group,jersey_number:p.shirt_number}))};
  }else{
   const p=input.players.find(p=>path.endsWith('/players/'+p.provider_id+'/'));assert(p,'unexpected endpoint');
   body={id:Number(p.provider_id),current_team_id:Number(registrations.find(t=>t.id===p.team_id).bsdId),name:p.display_name,position:p.position_group,jersey_number:p.shirt_number,specific_position:p.specific_position,photo:'https://media.invalid/never-fetch.png'};
  }
  return {ok:true,text:async()=>JSON.stringify(body)};
 };
 const result=await fetchBsdCatalogue({token:'D4-mock-only',registrations,fetchImpl});
 assert.equal(result.teams.length,18);assert.equal(result.players.length,543);assert.equal(calls.length,562);
 assert.doesNotMatch(JSON.stringify(result),/fotmob|legacy|photo|source_url|selection_rank|"roles"|"starts"|"value"/i);
 assert(calls.every(url=>url.startsWith('https://sports.bzzoiro.com/api/v2/')));
});

test('D4 match provider resolves directly to product IDs; unknown IDs never try the legacy mapper',async()=>{
 const service=await createLocalCatalogueService({port:4173,authenticate:async()=>null});
 try{
  const raw=event(),fetchImpl=async()=>({ok:true,text:async()=>JSON.stringify({count:1,next:null,results:[raw]})});
  const data=await service.loadSeason({token:'D4-mock-only',fetchImpl});
  assert.equal(data.matches.length,1);assert.equal(data.matches[0].home.teamId,'amedspor');assert.equal(data.matches[0].away.teamId,'besiktas');
  assert.doesNotMatch(JSON.stringify(data),/fotmob/i);assert.equal(service.teamResolver(9999999),null);
  await service.db.exec('drop table public.legacy_player_aliases,public.legacy_team_aliases');
  assert.equal((await service.defaults()).galatasaray.starters.length,11);
 }finally{await service.db.close();}
});
