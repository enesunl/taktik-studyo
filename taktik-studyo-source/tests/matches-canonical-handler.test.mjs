import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgliteClient} from './helpers/pglite-supabase-client.mjs';
import {inputFromDocument,readRemoteState,planImport,bsdPlayerUuid} from '../scripts/catalogue/import.mjs';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';
import {createCanonicalMatches,readCatalogueState,canonicalService} from '../supabase/functions/matches/canonical.js';
import {event} from './helpers/matches-fixture.mjs';
import {normalizeDetail} from '../supabase/functions/matches/detail.js';
import {normalizeEvent} from '../supabase/functions/matches/provider.js';

// PROD1.5: the matches handler attaches BSD canonical identities from the imported Supabase
// tables (read with a server role), as the Edge Function does in production.
const dir=new URL('../supabase/migrations/',import.meta.url);
const bsd=JSON.parse(readFileSync(new URL('./fixtures/bsd-catalogue-clean.json',import.meta.url),'utf8'));
const user={id:'u',email_confirmed_at:'2026-10-01'};
const req=q=>new Request('https://x.test/functions/v1/matches'+q,{headers:{authorization:'Bearer jwt'}});
async function imported(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  const client=pgliteClient(db),{rpc}=planImport(inputFromDocument(bsd),await readRemoteState(client),{source:'bsd:file',inputSha:'c'.repeat(64)});
  assert.equal((await client.rpc('catalogue_apply_sync',{plan:rpc})).error,null);
  return {db,client};
}
// A provider lineup built from real BSD squad members (provider IDs), as BSD would send it.
function squad(slug,bsdTeamId){
  const players=bsd.players.filter(p=>p.team_id===slug),pick=(g,n)=>players.filter(p=>p.position_group===g).slice(0,n);
  const starters=[...pick('G',1),...pick('D',4),...pick('M',3),...pick('F',3)],subs=players.filter(p=>!starters.includes(p)).slice(0,7);
  const row=p=>({id:Number(p.provider_id),name:p.display_name,jersey_number:p.shirt_number,position:p.position_group});
  return {team_id:bsdTeamId,formation:'4-3-3',players:starters.map(row),substitutes:subs.map(row),starters};
}
function provider(){
  const home=squad('galatasaray',125),away=squad('fenerbahce',134);
  const finished=event({id:300001,round_number:7,event_date:'2026-10-04T17:00:00+00:00',home_team_id:125,home_team:'Galatasaray',away_team_id:134,away_team:'Fenerbahçe',home_score:1,away_score:0});
  const upcoming=event({id:300002,round_number:9,event_date:'2026-11-01T17:00:00+00:00',status:'notstarted',home_team_id:134,home_team:'Fenerbahçe',away_team_id:125,away_team:'Galatasaray',home_score:null,away_score:null});
  const resources={lineups:{value:{event_id:300001,lineup_status:'confirmed',lineups:{home,away}}},incidents:{value:{event_id:300001,incidents:[]}},stats:{value:{event_id:300001,stats:null}}};
  return {home,away,load:async()=>({season:'2026-2027',matches:[finished,upcoming].map(e=>normalizeEvent(e))}),
    loadDetail:async({id})=>id==='300001'?normalizeDetail(normalizeEvent(finished),finished,resources):normalizeDetail(normalizeEvent(upcoming),upcoming,{lineups:{value:null},incidents:{value:null},stats:{value:null}})};
}

test('fixtures and details carry canonical team slugs and internal player UUIDs from the imported tables',async()=>{
  const {db,client}=await imported(),p=provider();
  try{
    const h=createMatchesHandler({token:'t',now:()=>Date.parse('2026-10-15T12:00:00Z'),authenticate:async()=>user,load:p.load,loadDetail:p.loadDetail,
      canonical:loaders=>createCanonicalMatches({loadState:()=>readCatalogueState(client),...loaders})});
    const season=await (await h(req(''))).json();
    assert.deepEqual(season.matches.map(m=>[m.home.teamId,m.away.teamId]),[['galatasaray','fenerbahce'],['fenerbahce','galatasaray']]);
    // Finished match with a confirmed BSD lineup: resolved to internal catalogue players.
    const done=await (await h(req('?id=300001'))).json();
    assert.equal(done.canonicalModel.home.lineupKind,'confirmed');
    assert.deepEqual(done.canonicalModel.home.players.map(x=>x.playerId).sort(),p.home.starters.map(s=>bsdPlayerUuid(s.provider_id)).sort());
    assert.ok(done.lineups.home.starters.every(s=>s.playerId===bsdPlayerUuid(String(s.id))),'provider identities map only through BSD mappings');
    // Upcoming match without lineups: most recent same-season confirmed XI from the catalogue.
    const next=await (await h(req('?id=300002'))).json();
    assert.equal(next.canonicalModel.away.lineupKind,'probable-recent-match');assert.equal(next.canonicalModel.home.players.length,11);
    assert.doesNotMatch(JSON.stringify(next),/fotmob/i);
  }finally{await db.close();}
});

test('a failed default-XI lookup (overload, provider error) is temporary: short browser cache, recent-match XI after 60 s',async()=>{
  const {db,client}=await imported(),p=provider();let time=Date.parse('2026-10-15T12:00:00Z'),fails=2;
  try{
    const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,load:p.load,
      loadDetail:async args=>{// Both lookups of the first request fail (probable XI, then default XI); overload sets no cooldown.
      if(args.id==='300001'&&fails){fails--;throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{overloaded:true});}return p.loadDetail(args);},
      canonical:loaders=>createCanonicalMatches({loadState:()=>readCatalogueState(client),now:()=>time,...loaders})});
    const first=await h(req('?id=300002'));assert.ok(Number(first.headers.get('cache-control').split('=')[1])<=60);
    assert.equal((await first.json()).canonicalModel.away.lineupKind,'probable-local');
    time+=61e3;const again=await h(req('?id=300002'));
    assert.equal((await again.json()).canonicalModel.away.lineupKind,'probable-recent-match','recovered after the failure');
  }finally{await db.close();}
});

test('catalogue unavailable or empty: explicit unavailable model, provider data otherwise unchanged',async()=>{
  const p=provider();
  const h=createMatchesHandler({token:'t',now:()=>Date.parse('2026-10-15T12:00:00Z'),authenticate:async()=>user,load:p.load,loadDetail:p.loadDetail,
    canonical:loaders=>createCanonicalMatches({loadState:async()=>{throw Error('catalogue_unavailable');},...loaders})});
  const detail=await h(req('?id=300002'));assert.equal(detail.status,200);
  const body=await detail.json();assert.equal(body.canonicalModel,null);assert.equal(body.canonicalError,'catalogue_unavailable');
  assert.ok(Number(detail.headers.get('cache-control').split('=')[1])<=60,'a temporary state is not kept for the match TTL');
  assert.equal((await h(req(''))).status,200,'fixture list still available');
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
    await assert.rejects(readCatalogueState(pgliteClient(db)),/catalogue_empty/,'seeded teams without players is not a usable catalogue');
    await assert.rejects(readCatalogueState(pgliteClient(db,'anon')),/catalogue_unavailable/);
  }finally{await db.close();}
});

// BSD quota: a match detail loads default-XI history for its two teams only, never one detail per league team.
test('match detail default XIs load only the two teams latest details and equal the all-team defaults',async()=>{
  const {db,client}=await imported();
  try{
    const state=await readCatalogueState(client),ids=bsd.teams.map(t=>Number(t.provider_id));
    // Staggered schedule: every team's latest finished match is a different fixture (worst case for the old loop).
    const raws=ids.map((h,i)=>event({id:310000+i,round_number:1,event_date:new Date(Date.parse('2026-09-01T12:00:00Z')+i*6*3600e3).toISOString().replace('.000Z','+00:00'),
      home_team_id:h,home_team:'H'+i,away_team_id:ids[(i+1)%ids.length],away_team:'A'+i}));
    const empty={lineups:{value:null},incidents:{value:null},stats:{value:null}};
    let loads=0;const loadDetail=async({id})=>{loads++;const e=raws.find(x=>String(x.id)===id);return normalizeDetail(normalizeEvent(e),e,empty);};
    const options={loadSeason:async()=>({season:'2026-2027',matches:raws.map(e=>normalizeEvent(e))}),loadDetail,now:()=>Date.parse('2026-10-15T12:00:00Z')};
    const target=normalizeDetail(normalizeEvent(raws[5]),raws[5],empty);
    const scoped=canonicalService(state,options);
    const [a,b]=await Promise.all([scoped.canonicalMatch(target),scoped.canonicalMatch(target)]);
    assert.equal(loads,2,'two teams, two latest details, shared by concurrent requests');assert.deepEqual(a,b);
    const full=canonicalService(state,options);await full.defaults();loads=0;
    assert.deepEqual(await full.canonicalMatch(target),a,'same canonical model as the all-team defaults');assert.equal(loads,0);
  }finally{await db.close();}
});

test('Edge entry keeps the server key inside the function and supports an explicit legacy opt-out',()=>{
  const entry=readFileSync(new URL('../supabase/functions/matches/index.ts',import.meta.url),'utf8');
  assert.match(entry,/SUPABASE_SECRET_KEYS|SUPABASE_SERVICE_ROLE_KEY/);assert.match(entry,/MATCHES_CATALOGUE'\) !== 'legacy'/);
  assert.match(entry,/readCatalogueState\(catalogueClient\)/);
});
