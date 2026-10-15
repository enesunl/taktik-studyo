import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {pgliteClient} from './helpers/pglite-supabase-client.mjs';
import {bsdPlayerUuid,inputFromDocument,readRemoteState,planImport,backupDocument,verifyState,assertOutsideRepository,main} from '../scripts/catalogue/import.mjs';

// PROD1.5: real SQL (every repository migration) in in-memory PGlite; the tool talks to it
// through a supabase-js-shaped client running as service_role. No network, no hosted target.
const dir=new URL('../supabase/migrations/',import.meta.url);
const fixture=JSON.parse(readFileSync(new URL('./fixtures/bsd-catalogue-clean.json',import.meta.url),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
async function database(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  return {db,client:pgliteClient(db)};
}
async function importDoc(client,doc,{allow=0,apply=true}={}){
  const state=await readRemoteState(client),input=inputFromDocument(doc);
  const result=planImport(input,state,{allowDeactivations:allow,source:'bsd:file',inputSha:'b'.repeat(64)});
  if(!apply||result.report.blocked)return {...result,state,input};
  const r=await client.rpc('catalogue_apply_sync',{plan:result.rpc});if(r.error)throw Object.assign(Error(r.error.message),{code:r.error.code});
  return {...result,state,input,applied:r.data,after:await readRemoteState(client)};
}
const count=async(db,sql)=>(await db.query(sql)).rows[0].n;

test('first import: 18 teams / 543 players, deterministic BSD-derived UUIDs, one audited transaction',async()=>{
  const {db,client}=await database();
  try{
    const dry=await importDoc(client,fixture,{apply:false});
    assert.equal(dry.report.newPlayers.length,543);assert.equal(await count(db,'select count(*)::int n from public.catalogue_players'),0,'dry run writes nothing');
    const r=await importDoc(client,fixture);
    assert.deepEqual({...r.applied,run:undefined},{teams:18,players:543,inserted_teams:0,reactivated_teams:0,inserted_players:543,updated_players:0,deactivated_players:0,deactivated_teams:0,run:undefined});
    assert.deepEqual(verifyState(r.after,r.input),[]);
    for(const p of fixture.players)assert.equal(r.after.playerMappings.find(m=>m.provider_id===p.provider_id).player_id,bsdPlayerUuid(p.provider_id));
    assert.equal(r.after.teamMappings.length,18);assert.equal(r.after.lastRun,r.applied.run);
    // Seeded product metadata was kept (insert-only): the 18 teams pre-existed from 20261014140000.
    assert.equal(r.report.newTeams.length,0);
    assert.equal(await count(db,'select count(*)::int n from tactics_private.catalogue_sync_runs'),1);
    const run=(await db.query('select source,input_sha256,summary from tactics_private.catalogue_sync_runs')).rows[0];
    assert.equal(run.source,'bsd:file');assert.doesNotMatch(JSON.stringify(run),/display_name|Osimhen/,'audit stores counts, not provider data');
    // Re-running the same input is a no-op apart from the audit row.
    const again=await importDoc(client,fixture);
    assert.equal(again.applied.inserted_players+again.applied.updated_players+again.applied.deactivated_players,0);
    assert.deepEqual(again.after.players.map(p=>p.id).sort(),r.after.players.map(p=>p.id).sort());
  }finally{await db.close();}
});

test('updates keep UUIDs; absent players are deactivated only with an explicit allowance; restore from backup',async()=>{
  const {db,client}=await database();
  try{
    const first=await importDoc(client,fixture),backup=backupDocument(first.after);
    const changed=clone(fixture),gs=changed.players.filter(p=>p.team_id==='galatasaray');
    const renamed=gs[0],moved=gs[1],removed=[gs[2].provider_id,gs[3].provider_id];
    renamed.display_name='Renamed Player';renamed.shirt_number=renamed.shirt_number===98?97:98;moved.team_id='fenerbahce';
    changed.players=changed.players.filter(p=>!removed.includes(p.provider_id));
    changed.players.push({provider_id:'9900001',team_id:'galatasaray',display_name:'New Signing',position_group:'M',specific_position:'CM',shirt_number:null});
    const blocked=await importDoc(client,changed);
    assert.match(blocked.report.blocked,/deactivation_limit: 2 players/);assert.equal(blocked.applied,undefined,'nothing applied');
    // The SQL function enforces the limit itself, even if a caller bypasses the tool.
    const direct=await client.rpc('catalogue_apply_sync',{plan:{...blocked.rpc,allow_deactivations:0}});assert.match(direct.error.message,/deactivation_limit/);
    const r=await importDoc(client,changed,{allow:2});
    const id=pid=>r.after.playerMappings.find(m=>m.provider_id===pid).player_id,row=pid=>r.after.players.find(p=>p.id===id(pid));
    assert.equal(id(renamed.provider_id),bsdPlayerUuid(renamed.provider_id));assert.equal(row(renamed.provider_id).display_name,'Renamed Player');
    assert.equal(row(moved.provider_id).team_id,'fenerbahce');assert.equal(id(moved.provider_id),first.after.playerMappings.find(m=>m.provider_id===moved.provider_id).player_id);
    for(const pid of removed)assert.equal(row(pid).catalogue_active,false,'deactivated, not deleted');
    assert.equal(id('9900001'),bsdPlayerUuid('9900001'));
    assert.equal(r.after.players.length,544,'no row deleted');
    assert.equal(r.report.renamed.length,1);assert.equal(r.report.moved.length,1);assert.equal(r.report.newPlayers.length,1);assert.equal(r.report.deactivated.length,2);
    // Recovery: re-apply the pre-change backup (same UUIDs via mappings; new signing deactivated).
    const restored=await importDoc(client,backup,{allow:1});
    assert.deepEqual(verifyState(restored.after,inputFromDocument(backup)),[]);
    assert.equal(restored.report.reactivated.length,2);assert.equal(restored.after.players.find(p=>p.id===bsdPlayerUuid('9900001')).catalogue_active,false);
    assert.equal(restored.after.players.length,544);
  }finally{await db.close();}
});

test('stale plans, mapping reassignment, duplicates, missing squads and legacy data are refused atomically',async()=>{
  const {db,client}=await database();
  try{
    await importDoc(client,fixture);
    const stale=await importDoc(client,fixture,{apply:false});await importDoc(client,fixture);
    const before=await count(db,'select count(*)::int n from tactics_private.catalogue_sync_runs');
    assert.match((await client.rpc('catalogue_apply_sync',{plan:stale.rpc})).error.message,/stale_plan/);
    const fresh=(await importDoc(client,fixture,{apply:false})).rpc;
    const steal={...fresh,players:fresh.players.map((p,i)=>i===0?{...p,id:fresh.players[1].id}:i===1?{...p,id:fresh.players[0].id}:p)};
    assert.match((await client.rpc('catalogue_apply_sync',{plan:steal})).error.message,/player_mapping_conflict/);
    const teamSteal={...fresh,teams:fresh.teams.map((t,i)=>i===0?{...t,bsd_id:fresh.teams[1].bsd_id}:i===1?{...t,bsd_id:fresh.teams[0].bsd_id}:t)};
    assert.match((await client.rpc('catalogue_apply_sync',{plan:teamSteal})).error.message,/team_mapping_conflict/);
    assert.match((await client.rpc('catalogue_apply_sync',{plan:{...fresh,players:[...fresh.players,fresh.players[0]]}})).error.message,/duplicate_identity/);
    assert.match((await client.rpc('catalogue_apply_sync',{plan:{...fresh,players:fresh.players.filter(p=>p.team_id!=='corum-fk').concat(fresh.players.filter(p=>p.team_id==='corum-fk').slice(0,5))}})).error.message,/incomplete_squad/);
    assert.match((await client.rpc('catalogue_apply_sync',{plan:{...fresh,provider:'fotmob'}})).error.message,/invalid_plan/);
    assert.equal(await count(db,'select count(*)::int n from tactics_private.catalogue_sync_runs'),before,'every refusal rolled back');
    // Tool-side validation: duplicates, unreviewed teams and legacy/FotMob documents.
    const dup=clone(fixture);dup.players.push(clone(dup.players[0]));assert.throws(()=>inputFromDocument(dup),/duplicate_identity/);
    const foreign=clone(fixture);foreign.teams[0].provider_id='99999';assert.throws(()=>inputFromDocument(foreign),/unreviewed_team/);
    assert.throws(()=>inputFromDocument({provider:'bsd',complete:true,leagueId:11,seasonId:1539,teams:[],players:[{source:'https://www.fotmob.com/teams/8637/'}]}),/legacy_data_rejected/);
    assert.throws(()=>inputFromDocument({teams:{}}),/invalid_input/);
    const short=clone(fixture);short.players=short.players.filter(p=>p.team_id!=='amedspor'||p.position_group==='G');assert.throws(()=>inputFromDocument(short),/incomplete_squad/);
    // Legacy alias tables are never written by the import.
    assert.equal(await count(db,'select count(*)::int n from public.legacy_player_aliases'),0);
  }finally{await db.close();}
});

test('only service_role can run or inspect sync; signed-in users read active rows; anon reads nothing',async()=>{
  const {db,client}=await database();
  try{
    const r=await importDoc(client,fixture),changed=clone(fixture);changed.players=changed.players.slice(1);await importDoc(client,changed,{allow:1});
    for(const role of ['anon','authenticated']){
      const c=pgliteClient(db,role);
      assert.equal((await c.rpc('catalogue_apply_sync',{plan:r.rpc})).error.code,'42501',role);
      assert.equal((await c.rpc('catalogue_sync_status')).error.code,'42501',role);
      await db.exec('set role '+role);
      try{await assert.rejects(db.query('select 1 from tactics_private.catalogue_sync_runs'),e=>e.code==='42501');}finally{await db.exec('reset role');}
    }
    const signedIn=pgliteClient(db,'authenticated');
    assert.equal((await signedIn.from('catalogue_players').select('*').order('id')).data.length,542,'inactive player hidden');
    assert.equal((await signedIn.from('player_provider_ids').select('*').order('provider_id')).error.code,'42501','mappings stay server-only');
    assert.equal((await pgliteClient(db,'anon').from('catalogue_players').select('*').order('id')).error.code,'42501');
  }finally{await db.close();}
});

test('CLI guards: dry run default, explicit confirmation, backup outside the repository, server key only',async()=>{
  const {db,client}=await database();
  try{
    const input=new URL('./fixtures/bsd-catalogue-clean.json',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
    const fake={createClient:(url,key)=>{assert.equal(url,'http://127.0.0.1:54321');return client;}};
    const local={SECRET_KEY:'sb_secret_local_test_only',API_URL:'http://127.0.0.1:54321'};
    // `supabase status` is injected; the client is the PGlite-backed fake above.
    const mod={main};
    const logs=[];const log=console.log;console.log=m=>logs.push(String(m));
    try{
      const withStatus=argv=>mod.main(argv,{...fake,readStatus:async()=>local});
      assert.equal(await withStatus(['--target','local','--input',input]),0);assert.match(logs.join('\n'),/DRY RUN — nothing written/);
      assert.equal(await count(db,'select count(*)::int n from public.catalogue_players'),0);
      await assert.rejects(withStatus(['--target','local','--input',input,'--apply','--confirm','hosted','--backup',join(tmpdir(),'x.json')]),/confirmation_mismatch/);
      await assert.rejects(withStatus(['--target','local','--input',input,'--apply','--confirm','local']),/backup_required/);
      await assert.rejects(withStatus(['--target','local','--input',input,'--apply','--confirm','local','--backup','dist/catalogue.json']),/backup_inside_repository/);
      const backup=join(tmpdir(),'taktik-catalogue-test-'+process.pid+'.json');
      assert.equal(await withStatus(['--target','local','--input',input,'--apply','--confirm','local','--backup',backup]),0);
      assert.equal(await count(db,'select count(*)::int n from public.catalogue_players where catalogue_active'),543);
      assert.equal(JSON.parse(readFileSync(backup,'utf8')).kind,'taktik-catalogue-backup');
      await assert.rejects(mod.main(['--target','local','--input',input],{...fake,readStatus:async()=>({...local,SECRET_KEY:undefined,SERVICE_ROLE_KEY:undefined,PUBLISHABLE_KEY:'sb_publishable_x'})}),/server_key_required/);
      await assert.rejects(mod.main(['--target','hosted','--input',input],{...fake}),/hosted_target_mismatch/);
      await assert.rejects(mod.main(['--target','local','--input',input],{...fake,readStatus:async()=>({...local,API_URL:'https://zwhoailuklwtxaaawfaq.supabase.co'})}),/loopback|hosted|forbidden/i);
    }finally{console.log=log;}
    assert.throws(()=>assertOutsideRepository('supabase/x.json'),/backup_inside_repository/);
    assert.ok(assertOutsideRepository(join(tmpdir(),'ok.json')));
    // Server-only: the published bundle never contains the import tool or the sync function name.
    assert.doesNotMatch(readFileSync(new URL('../dist/backend.js',import.meta.url),'utf8'),/catalogue_apply_sync|catalogue_sync_status|SECRET_KEY|CATALOGUE_IMPORT/);
  }finally{await db.close();}
});

test('live BSD names with stray spaces are normalized; control characters still abort (PROD1.6)',async()=>{
  const {fetchBsdCatalogue}=await import('../scripts/catalogue/sync.mjs');
  const registrations=JSON.parse(readFileSync(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
  const api=rename=>{
    const players=clone(fixture.players);rename(players);
    return async url=>{
      const path=String(url).replace('https://sports.bzzoiro.com/api/v2/','');
      const team=t=>registrations.find(r=>r.id===t);
      if(path.startsWith('teams/?'))return Response.json({count:18,next:null,results:registrations.map(r=>({id:Number(r.bsdId),name:r.display_name}))});
      let m=path.match(/^teams\/(\d+)\/squad\/$/);
      if(m){const slug=registrations.find(r=>r.bsdId===m[1]).id,list=players.filter(p=>p.team_id===slug);
        return Response.json({team_id:Number(m[1]),count:list.length,players:list.map(p=>({id:Number(p.provider_id),name:p.display_name,position:p.position_group,jersey_number:p.shirt_number}))});}
      m=path.match(/^players\/(\d+)\/$/);const p=players.find(x=>x.provider_id===m[1]);
      return Response.json({id:Number(p.provider_id),current_team_id:Number(team(p.team_id).bsdId),name:p.display_name,position:p.position_group,jersey_number:p.shirt_number,specific_position:p.specific_position});
    };
  };
  const spaced=await fetchBsdCatalogue({token:'t',registrations,fetchImpl:api(ps=>{ps[0].display_name+=' ';ps[1].display_name=ps[1].display_name.replace(' ','  ');})});
  const byId=id=>spaced.players.find(p=>p.provider_id===id).display_name;
  for(const p of fixture.players.slice(0,2))assert.equal(byId(p.provider_id),p.display_name);
  await assert.rejects(fetchBsdCatalogue({token:'t',registrations,fetchImpl:api(ps=>{ps[0].display_name+='\u0007';})}),/invalid_catalogue/);
});
