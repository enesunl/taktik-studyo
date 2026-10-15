import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// SEC1: real SQL in an in-memory PGlite only. No env, production connection or CLI apply.
const dir=new URL('../supabase/migrations/',import.meta.url);
const SEC1='20260924200000_legacy_catalogue_no_anon_read.sql';
const sec1=readFileSync(new URL(SEC1,dir),'utf8');
const seed=readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111';
const denied=action=>assert.rejects(action,error=>error.code==='42501');

async function database({withSec1=true}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')&&(withSec1||f!==SEC1)).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  await db.exec(seed);
  return db;
}
async function as(db,role,action){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[role==='authenticated'?user:'']);
  await db.exec('set role '+role);
  try{return await action();}finally{await db.exec('reset role');}
}
const count=async(db,table)=>(await db.query('select count(*)::int n from '+table)).rows[0].n;
async function security(db){
  return {
    grants:(await db.query(`select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
      where grantee in ('anon','authenticated','service_role','PUBLIC') order by 1,2,3,4`)).rows,
    columns:(await db.query(`select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges
      where grantee in ('anon','authenticated','service_role') order by 1,2,3,4,5`)).rows,
    policies:(await db.query('select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by 1,2,3')).rows,
    functions:(await db.query(`select n.nspname,p.proname,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','tactics_private') order by 1,2,3`)).rows,
    rls:(await db.query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' order by 1")).rows,
    // Content columns only: created_at/updated_at differ between two fresh databases.
    data:(await db.query(`select (select md5(string_agg(row(id,name,short_name,logo_url,color_primary,color_secondary,source_url,sort_order)::text,'|' order by id)) from public.teams) teams,
      (select md5(string_agg(row(id,team_id,name,position,shirt_number,photo_url,roles,selection_rank)::text,'|' order by id)) from public.players) players`)).rows[0],
  };
}

test('SEC1 removes exactly the anonymous SELECT on legacy teams/players; everything else is unchanged',async()=>{
  const before=await database({withSec1:false}),after=await database();
  try{
    const a=await security(before),b=await security(after);
    const key=r=>JSON.stringify(r);
    const removed=a.grants.filter(r=>!b.grants.some(s=>key(s)===key(r)));
    assert.deepEqual(removed,[
      {table_schema:'public',table_name:'players',grantee:'anon',privilege_type:'SELECT'},
      {table_schema:'public',table_name:'teams',grantee:'anon',privilege_type:'SELECT'},
    ]);
    assert.deepEqual(b.grants.filter(r=>!a.grants.some(s=>key(s)===key(r))),[],'no new grants');
    // Column privileges mirror the table grant: only anon's teams/players columns disappear.
    const legacyAnon=r=>r.grantee==='anon'&&r.table_schema==='public'&&['teams','players'].includes(r.table_name);
    assert.ok(a.columns.some(legacyAnon));assert.equal(b.columns.some(legacyAnon),false);
    assert.deepEqual(b.columns,a.columns.filter(r=>!legacyAnon(r)),'other column privileges unchanged');
    for(const part of ['policies','functions','rls','data'])assert.deepEqual(b[part],a[part],part+' unchanged');
    assert.equal(await count(after,'public.teams'),18);assert.equal(await count(after,'public.players'),539);
  }finally{await before.close();await after.close();}
});

test('anon cannot read the legacy catalogue; signed-in reads, onboarding teams and sharing isolation still work',async()=>{
  const db=await database();
  try{
    await as(db,'anon',async()=>{
      await denied(()=>db.query('select id from public.teams limit 1'));
      await denied(()=>db.query('select id from public.players limit 1'));
      await denied(()=>db.query('select count(*) from public.players'));
      // The BSD catalogue is signed-in only too (20260925040000, see catalogue-no-anon.test.mjs).
      for(const table of ['public.catalogue_teams','public.shared_lineups','public.profiles','public.studio_projects','public.player_overrides'])await denied(()=>db.query('select 1 from '+table+' limit 1'));
    });
    for(const [table,privilege] of [['public.teams','SELECT'],['public.players','SELECT']])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',['anon',table,privilege])).rows[0].ok,false);
    // Legacy board catalogue path (catalogue.js) runs as the signed-in user.
    await as(db,'authenticated',async()=>{
      assert.equal(await count(db,'public.teams'),18);assert.equal(await count(db,'public.players'),539);
      assert.equal(await count(db,'public.catalogue_teams'),18,'onboarding/profile team list');
      const page=await db.query("select id,team_id,name,position,shirt_number,photo_url,roles,selection_rank from public.players where team_id='fotmob-8637' order by id limit 1000");
      assert.ok(page.rows.length>=11);
      for(const sql of ["insert into public.teams(id,name,short_name,color_primary,color_secondary) values ('x','X','X','#123456','#abcdef')","update public.players set name='x'",'delete from public.players'])
        await denied(()=>db.exec(sql));
    });
    await db.exec('set role service_role');assert.equal(await count(db,'public.players'),539);await db.exec('reset role');
    // Re-running is a no-op.
    await db.exec(sec1);assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',['authenticated','public.teams','SELECT'])).rows[0].ok,true);
  }finally{await db.close();}
});

test('SEC1 is versioned directly after the last production migration and before the pending queue',()=>{
  const names=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort(),i=names.indexOf(SEC1);
  assert.equal(names[i-1],'20260924094207_player_overrides.sql');
  assert.equal(names[i+1],'20260925035438_catalogue_identity_foundation.sql');
  assert.doesNotMatch(sec1.replace(/--.*$/gm,''),/\b(drop|delete|truncate|alter|grant|insert|update)\b/i,'revoke only');
});
