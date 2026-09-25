import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {syncLocal,readState} from '../scripts/catalogue/sync.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fixture=JSON.parse(read('tests/fixtures/bsd-catalogue-audit.json'));
const migration=read('supabase/migrations/20260925035438_catalogue_identity_foundation.sql');
const input={...fixture,provider:'bsd',complete:true};
test('D2 PGlite old data → additive schema → 18/543 canonical + 388 aliases; actual SQL grants and FKs',async t=>{
 const db=new PGlite();const tables=['catalogue_teams','catalogue_players','team_provider_ids','player_provider_ids','legacy_team_aliases','legacy_player_aliases'];
 const as=async(role,fn)=>{await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
 const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
 let first;
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of ['20260913063249_football_backend.sql','20260920094922_catalogue_authenticated_read.sql','20260920102243_profiles_ownership.sql','20260923135716_studio_projects.sql','20260924094207_player_overrides.sql'])await db.exec(read('supabase/migrations/'+file));
  await db.exec(read('supabase/seed.sql'));
  const legacy=async()=>({teams:(await db.query('select * from public.teams order by id')).rows,players:(await db.query('select * from public.players order by id')).rows,
   policies:(await db.query("select * from pg_policies where tablename not in ('catalogue_teams','catalogue_players','team_provider_ids','player_provider_ids','legacy_team_aliases','legacy_player_aliases') order by schemaname,tablename,policyname")).rows,
   acls:(await db.query("select relname,relacl from pg_class where relname in ('teams','players','shared_lineups','profiles','studio_projects','player_overrides') order by relname")).rows});
  const before=await legacy();assert.equal(before.teams.length,18);assert.equal(before.players.length,539);
  await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated,service_role');
  await db.exec(migration);
  await t.test('additive migration preserves every old row, policy and table ACL; all 6 new tables RLS enabled',async()=>{
   assert.deepEqual(await legacy(),before);
   for(const name of tables)assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['public.'+name])).rows[0].relrowsecurity,true);
  });
  await t.test('dry-run makes zero writes; real local service-role sync persists UUIDs and safe aliases atomically',async()=>{
   await as('service_role',async()=>{
    const dry=await syncLocal(db,input);assert.equal(dry.players.length,543);assert.equal((await readState(db)).players.length,0);
    first=await syncLocal(db,input,{dryRun:false,aliases:fixture.aliases,teamAliases:fixture.teams.map(t=>({legacy_id:t.legacyId,provider_id:t.bsdId,evidence:'D1_TEAM_SCOPE'}))});
    const s=await readState(db);assert.equal(s.teams.length,18);assert.equal(s.players.length,543);assert.equal(s.playerMappings.length,543);assert.equal(s.teamMappings.length,18);assert.equal(s.playerAliases.length,388);assert.equal(s.teamAliases.length,18);
    const repeat=await syncLocal(db,input,{dryRun:false});assert.equal(repeat.summary.newPlayers,0);assert.deepEqual(repeat.players.map(p=>p.id),first.players.map(p=>p.id));
    assert.deepEqual(await legacy(),before);
   });
  });
  await t.test('anon/authenticated active catalogue SELECT only; mapping/alias CRUD all denied',async()=>{
   for(const role of ['anon','authenticated'])await as(role,async()=>{
    for(const table of tables){
     if(table.startsWith('catalogue_'))assert.equal((await db.query('select count(*)::int n from public.'+table)).rows[0].n,table==='catalogue_teams'?18:543);
     else await denied(()=>db.query('select * from public.'+table));
     for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('select has_table_privilege($1,$2,$3) yes',[role,'public.'+table,privilege])).rows[0].yes,false);
     await denied(()=>db.exec('delete from public.'+table));
    }
    await denied(()=>db.exec("update public.catalogue_players set display_name='Intruder'"));
    await denied(()=>db.exec("insert into public.catalogue_players(team_id,display_name,position_group,specific_position) values('galatasaray','Intruder','M','CM')"));
   });
  });
  await t.test('service cannot overwrite team UI metadata, identifiers, aliases or existing mapping targets',async()=>{
   await as('service_role',async()=>{
    for(const sql of ["update public.catalogue_teams set short_name='BAD'","update public.catalogue_teams set color_primary='#000000'","update public.catalogue_players set id=gen_random_uuid()","update public.player_provider_ids set player_id=gen_random_uuid()","delete from public.legacy_player_aliases"] )await denied(()=>db.exec(sql));
   });
  });
  await t.test('FK/uniqueness/number/taxonomy constraints and provider change keep same UUID',async()=>{
   const p=first.players[0],m=first.playerMappings[0];
   await assert.rejects(db.query("insert into public.player_provider_ids values('bsd',$1,$2,now(),now())",[m.provider_id,p.id]),e=>e.code==='23505');
   await assert.rejects(db.exec("insert into public.player_provider_ids(provider,provider_id,player_id) values('next','1','00000000-0000-4000-8000-000000000000')"),e=>e.code==='23503');
   await db.query("insert into public.player_provider_ids(provider,provider_id,player_id) values('next','1',$1)",[p.id]);
   assert.equal((await db.query("select player_id from public.player_provider_ids where provider='next'")).rows[0].player_id,p.id);
   for(const val of [0,100])await assert.rejects(db.query('update public.catalogue_players set shirt_number=$1 where id=$2',[val,p.id]),e=>e.code==='23514');
   await assert.rejects(db.query("update public.catalogue_players set specific_position='unexpected' where id=$1",[p.id]),e=>e.code==='23514');
   assert.equal((await db.query('select count(*)::int n from public.catalogue_players where shirt_number is null')).rows[0].n,14);
  });
  await t.test('departure soft-inactivates, preserves alias and old rows, reappearance reuses UUID',async()=>{
   const absent={...input,players:input.players.slice(1)},id=first.players[0].id;
   await syncLocal(db,absent,{dryRun:false});assert.equal((await db.query('select catalogue_active from public.catalogue_players where id=$1',[id])).rows[0].catalogue_active,false);
   assert.equal((await db.query('select count(*)::int n from public.catalogue_players')).rows[0].n,543);
   await as('anon',async()=>assert.equal((await db.query('select count(*)::int n from public.catalogue_players')).rows[0].n,542));
   await syncLocal(db,input,{dryRun:false});assert.equal((await db.query('select catalogue_active from public.catalogue_players where id=$1',[id])).rows[0].catalogue_active,true);
   assert.deepEqual(await legacy(),before);
  });
  await t.test('conflicting alias rolls entire sync back, remote adapter refused',async()=>{
   const old=(await readState(db)).players,changed=structuredClone(input);changed.players[0].display_name='Should roll back';
   const a=fixture.aliases[0],other=fixture.players.find(p=>p.provider_id!==a.provider_id);
   await assert.rejects(syncLocal(db,changed,{dryRun:false,aliases:[{...a,provider_id:other.provider_id}]}),/alias_conflict/);
   assert.deepEqual((await readState(db)).players,old);
   await assert.rejects(syncLocal({query(){throw Error('not allowed');}},input,{dryRun:false}),/local_database_required/);
  });
 }finally{await db.close();}
});
