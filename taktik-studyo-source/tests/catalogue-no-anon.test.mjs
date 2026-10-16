import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {openCatalogueDatabase} from '../scripts/catalogue/local-database.mjs';
import {snapshot as studioSnapshot} from './helpers/studio-project-fixture.mjs';
import {emptyWeeklyXI} from '../src/lib/weekly-xi.js';

// SEC1.1: the BSD catalogue (catalogue_teams/catalogue_players) is not anonymously readable.
// Real SQL in in-memory PGlite only; no env, production connection or CLI apply.
const dir=new URL('../supabase/migrations/',import.meta.url);
const HARDEN='20260925040000_catalogue_no_anon_read.sql';
const user='11111111-1111-4111-8111-111111111111';
const denied=action=>assert.rejects(action,error=>error.code==='42501');

async function database({withHardening=true}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable set search_path='' as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')&&(withHardening||f!==HARDEN)).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  // One active and one inactive player so the signed-in policy's active filter stays observable.
  await db.exec(`insert into public.catalogue_players(id,team_id,display_name,position_group,specific_position,catalogue_active) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','galatasaray','Active','M','CM',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','galatasaray','Inactive','M','CM',false)`);
  return db;
}
const as=async(db,role,action)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[role==='authenticated'?user:'']);await db.exec('set role '+role);try{return await action();}finally{await db.exec('reset role');}};
const count=async(db,table)=>(await db.query('select count(*)::int n from '+table)).rows[0].n;
const grants=async db=>(await db.query(`select table_name,grantee,privilege_type from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated','service_role') order by 1,2,3`)).rows;
const policies=async db=>(await db.query("select tablename,policyname,roles::text,cmd,qual from pg_policies where schemaname='public' order by 1,2")).rows;

test('hardening removes only anon catalogue SELECT and narrows the two read policies to authenticated',async()=>{
  const before=await database({withHardening:false}),after=await database();
  try{
    const key=r=>JSON.stringify(r),a=await grants(before),b=await grants(after);
    assert.deepEqual(a.filter(r=>!b.some(s=>key(s)===key(r))),[
      {table_name:'catalogue_players',grantee:'anon',privilege_type:'SELECT'},
      {table_name:'catalogue_teams',grantee:'anon',privilege_type:'SELECT'},
    ]);
    assert.deepEqual(b.filter(r=>!a.some(s=>key(s)===key(r))),[],'no new grants');
    const pa=await policies(before),pb=await policies(after),changed=pb.filter(r=>!pa.some(s=>key(s)===key(r)));
    assert.deepEqual(changed.map(r=>[r.tablename,r.policyname,r.roles]),[['catalogue_players','catalogue_players_read','{authenticated}'],['catalogue_teams','catalogue_teams_read','{authenticated}']]);
    assert.equal(pb.length,pa.length,'no policy dropped or added');
    for(const r of changed)assert.equal(r.qual,'catalogue_active');
  }finally{await before.close();await after.close();}
});

test('anon cannot read teams, players or mappings; signed-in users read active rows only; writes stay server-only',async()=>{
  const db=await database();
  try{
    await as(db,'anon',async()=>{
      for(const table of ['catalogue_teams','catalogue_players','team_provider_ids','player_provider_ids','legacy_team_aliases','legacy_player_aliases'])await denied(()=>db.query('select 1 from public.'+table+' limit 1'));
    });
    await as(db,'authenticated',async()=>{
      assert.equal(await count(db,'public.catalogue_teams'),18);
      assert.deepEqual((await db.query('select display_name from public.catalogue_players')).rows,[{display_name:'Active'}]);
      for(const table of ['team_provider_ids','player_provider_ids','legacy_team_aliases','legacy_player_aliases'])await denied(()=>db.query('select 1 from public.'+table+' limit 1'));
      for(const sql of ["insert into public.catalogue_teams(id,display_name,short_name,color_primary,color_secondary) values ('x','X','X','#123456','#abcdef')","update public.catalogue_players set display_name='x'",'delete from public.catalogue_players'])await denied(()=>db.exec(sql));
    });
    await db.exec('set role service_role');assert.equal(await count(db,'public.catalogue_players'),2);await db.exec('reset role');
  }finally{await db.close();}
});

test('versioned directly after the identity foundation; the local PGlite catalogue applies it',async()=>{
  const names=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort(),i=names.indexOf(HARDEN);
  assert.equal(names[i-1],'20260925035438_catalogue_identity_foundation.sql');
  const sql=readFileSync(new URL(HARDEN,dir),'utf8').replace(/--.*$/gm,'');
  assert.doesNotMatch(sql,/\b(drop|delete|truncate|grant|insert|update|create)\b/i,'revoke and policy role narrowing only');
  const {db}=await openCatalogueDatabase('memory://',{populate:false});
  try{
    assert.equal((await db.query("select count(*)::int n from public.d3_local_versions where version='20260925040000_catalogue_no_anon_read'")).rows[0].n,1);
    assert.equal((await db.query("select has_table_privilege('anon','public.catalogue_players','SELECT') ok")).rows[0].ok,false);
  }finally{await db.close();}
});

// PROD5.7: signed-in catalogue reads go through catalogue_for_app(); the pending revoke closes the tables.
const REVOKE=new URL('../supabase/pending/catalogue_direct_read_revoke.sql',import.meta.url);
const app=async db=>(await db.query('select public.catalogue_for_app() c')).rows[0].c;

test('catalogue_for_app: active rows with the app fields only, signed-in non-anonymous accounts, 60 per 10 minutes',async()=>{
  const db=await database();
  try{
    await as(db,'authenticated',async()=>{
      const c=await app(db);
      assert.equal(c.teams.length,18);assert.deepEqual(c.players.map(p=>p.display_name),['Active'],'inactive players are never returned');
      assert.deepEqual(Object.keys(c.teams[0]).sort(),['catalogue_active','color_primary','color_secondary','display_name','id','short_name','sort_order']);
      assert.deepEqual(Object.keys(c.players[0]).sort(),['catalogue_active','display_name','id','position_group','shirt_number','specific_position','team_id']);
    });
    await as(db,'anon',()=>denied(()=>app(db)));
    await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role authenticated');
    try{await denied(()=>app(db));}finally{await db.exec('reset role');}
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({is_anonymous:true})]);
    try{await as(db,'authenticated',()=>denied(()=>app(db)));}finally{await db.query("select set_config('request.jwt.claims','',false)");}
    // 1 call above + 59 = 60 allowed in this window; the 61st is refused and not counted.
    await as(db,'authenticated',async()=>{
      for(let i=0;i<59;i++)await app(db);
      await assert.rejects(app(db),e=>e.code==='P0001'&&e.message==='rate_limited'&&/^retry_after=\d+$/.test(e.hint));
    });
    const used=(await db.query("select bucket,attempts from tactics_private.share_limits where bucket like 'catalogue:%' order by 1")).rows;
    assert.deepEqual(used.map(r=>r.attempts),[60,60]);assert.ok(used.every(r=>r.bucket.endsWith(user)));
  }finally{await db.close();}
});

test('pending revoke: no direct catalogue or legacy reads when signed in; app path, own data and server tooling keep working',async()=>{
  const db=await database();
  try{
    await db.query('insert into auth.users values ($1)',[user]);await db.query("insert into public.profiles(id,username) values ($1,'tester')",[user]);
    await db.exec(readFileSync(REVOKE,'utf8'));
    await as(db,'authenticated',async()=>{
      for(const table of ['catalogue_teams','catalogue_players','teams','players','team_provider_ids','player_provider_ids'])await denied(()=>db.query('select 1 from public.'+table+' limit 1'));
      assert.equal((await app(db)).teams.length,18,'the app catalogue still loads');
      // Saved data does not read the catalogue: projects, overrides and Weekly XI still save.
      await db.query("insert into public.player_overrides(user_id,player_key,name,role) values ($1,'internal:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','X','MO')",[user]);
      await db.query("insert into public.weekly_lineups(id,user_id,title,formation,snapshot) values (gen_random_uuid(),$1,'XI','4-3-3',$2)",[user,JSON.stringify(emptyWeeklyXI())]);
      await db.query("insert into public.studio_projects(user_id,title,snapshot_version,snapshot) values ($1,'P',1,$2)",[user,JSON.stringify(studioSnapshot())]);
    });
    await as(db,'anon',async()=>{for(const table of ['catalogue_teams','catalogue_players','teams','players'])await denied(()=>db.query('select 1 from public.'+table+' limit 1'));});
    await db.exec('set role service_role');assert.equal(await count(db,'public.catalogue_players'),2,'service-role tooling (import, matches) unaffected');await db.exec('reset role');
  }finally{await db.close();}
});
