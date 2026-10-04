import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProfileApi} from '../src/lib/profile-api.js';
import {needsOnboarding} from '../src/lib/onboarding.js';
import {A,B,profileClient} from './helpers/profile-fixture.mjs';
const migration=name=>readFileSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8');
const O1='20261004234326_profile_onboarding_foundation';
// Real SQL in in-memory Postgres only. No env, network, hosted Auth or production connection.
test('O1 real SQL migration/backfill/defaults, own-profile service writes, grants and RLS',async t=>{
 const db=new PGlite();
 async function as(owner,run,role='authenticated'){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner||'']);await db.exec('set role '+role);
  try{return await run();}finally{await db.exec('reset role');}
 }
 const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const name of ['20260913063249_football_backend','20260920102243_profiles_ownership','20260925035438_catalogue_identity_foundation'])await db.exec(migration(name));
  await db.query('insert into auth.users(id) values ($1),($2)',[A,B]);
  await db.query("insert into public.profiles(id,username,display_name,created_at,updated_at) values($1,'Existing','Old name','2026-09-01','2026-09-02')",[B]);
  await db.exec("insert into public.catalogue_teams(id,display_name,short_name,color_primary,color_secondary,catalogue_active) values ('galatasaray','Galatasaray','GS','#a51935','#efb62a',true),('fenerbahce','Fenerbahçe','FB','#19294d','#f3d233',true),('inactive','Inactive','I','#111111','#eeeeee',false)");
  const before=(await db.query('select * from public.profiles')).rows[0];
  const policies=(await db.query("select * from pg_policies where tablename='profiles' order by policyname")).rows;
  await db.exec(migration(O1));
  await t.test('only migration-time profiles are backfilled; identity and timestamps preserved',async()=>{
   const old=(await db.query('select * from public.profiles where id=$1',[B])).rows[0];assert.equal(old.onboarding_version,1);assert.ok(old.onboarding_completed_at);assert.equal(old.favorite_team_slug,null);assert.equal(needsOnboarding(old),false);
   for(const k of Object.keys(before))assert.deepEqual(old[k],before[k]);
   assert.equal((await db.query("select tgenabled from pg_trigger where tgname='profiles_updated'")).rows[0].tgenabled,'O');
  });
  await t.test('new own profile bootstrap still uses defaults NULL / 0 / NULL',async()=>{
   await as(A,()=>db.query('insert into public.profiles(id,username,display_name) values ($1,$2,$3)',[A,'NewUser','New name']));
   const r=(await db.query('select * from public.profiles where id=$1',[A])).rows[0];assert.equal(r.onboarding_version,0);assert.equal(r.onboarding_completed_at,null);assert.equal(r.favorite_team_slug,null);assert.equal(needsOnboarding(r),true);
  });
  // SDK-shaped adapter executes only bounded parameterized SQL under A's real RLS.
  const f=profileClient(async c=>as(A,async()=>{
   const allowed=['id','username','display_name','created_at','updated_at','favorite_team_slug','onboarding_completed_at','onboarding_version','catalogue_active'];
   const col=k=>{assert(allowed.includes(k));return '"'+k+'"';};assert(['profiles','catalogue_teams'].includes(c.table));
   const params=[];const bind=v=>{params.push(v);return '$'+params.length;};const columns=c.columns.split(',').map(col).join(',');
   let sql=c.kind==='update'?'update public.'+c.table+' set '+Object.entries(c.values).map(([k,v])=>col(k)+'='+bind(v)).join(','):'select '+columns+' from public.'+c.table;
   sql+=' where '+c.filters.map(([k,v])=>col(k)+'='+bind(v)).join(' and ');if(c.kind==='update')sql+=' returning '+columns;
   try{return {data:JSON.parse(JSON.stringify((await db.query(sql,params)).rows[0]||null))};}catch(e){return {error:{code:e.code}};}
  }));
  const api=createProfileApi({client:f.client,validatedUser:{id:A},current:()=>true});
  await t.test('service completes with normalized active team and preserves profile fields',async()=>{
   const r=await api.completeOnboarding({favoriteTeamSlug:' GALATASARAY '});assert.equal(r.ok,true);assert.equal(r.profile.favorite_team_slug,'galatasaray');assert.equal(needsOnboarding(r.profile),false);
   const p=await api.load();assert.equal(p.profile.username,'NewUser');assert.equal(p.profile.display_name,'New name');
   const completed=r.profile.onboarding_completed_at;
   assert.equal((await api.setFavoriteTeam('fenerbahce')).profile.onboarding_completed_at,completed);
   assert.equal((await api.clearFavoriteTeam()).profile.onboarding_completed_at,completed);
   const repeat=await api.completeOnboarding();assert.equal(repeat.ok,true);assert.equal(repeat.profile.onboarding_completed_at,completed);assert.equal(repeat.profile.onboarding_version,1);
   await api.save({username:'Edited',display_name:'Edited name'});assert.equal((await api.loadPreferences()).profile.onboarding_completed_at,completed);
  });
  await t.test('service and database reject inactive/unknown/provider identities; timestamp and reset writes denied',async()=>{
   for(const slug of ['inactive','unknown','125','fotmob-125'])assert.equal((await api.setFavoriteTeam(slug)).error.code,'invalid_favorite_team');
   await as(A,async()=>{
    for(const slug of ['inactive','unknown','125'])await assert.rejects(()=>db.query('update public.profiles set favorite_team_slug=$1 where id=$2',[slug,A]),e=>e.code==='23514');
    await assert.rejects(()=>db.query('update public.profiles set onboarding_version=0 where id=$1',[A]),e=>e.code==='23514');
    await denied(()=>db.query('update public.profiles set onboarding_completed_at=now() where id=$1',[A]));
   });
  });
  await t.test('ownership/anon isolation unchanged and new privileges are minimal',async()=>{
   assert.deepEqual((await db.query("select * from pg_policies where tablename='profiles' order by policyname")).rows,policies);
   assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.profiles'::regclass")).rows[0].relrowsecurity,true);
   await as(A,async()=>{
    assert.equal((await db.query('select favorite_team_slug from public.profiles where id=$1',[B])).rows.length,0);
    assert.equal((await db.query("update public.profiles set favorite_team_slug='galatasaray',onboarding_version=1 where id=$1 returning id",[B])).rows.length,0);
    await denied(()=>db.query('update public.profiles set id=$1 where id=$2',[B,A]));
   });
   await as(null,async()=>{await denied(()=>db.query('select favorite_team_slug,onboarding_completed_at,onboarding_version from public.profiles'));await denied(()=>db.exec('update public.profiles set onboarding_version=1'));},'anon');
   for(const col of ['favorite_team_slug','onboarding_completed_at','onboarding_version']){
    const r=(await db.query("select has_column_privilege('authenticated','public.profiles',$1,'INSERT') ins,has_column_privilege('authenticated','public.profiles',$1,'UPDATE') upd",[col])).rows[0];assert.equal(r.ins,false);assert.equal(r.upd,col!=='onboarding_completed_at');
   }
  });
  await t.test('skip on a genuinely fresh profile completes without a favorite team',async()=>{
   const C='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.users values($1)',[C]);
   await as(C,async()=>{await db.query("insert into public.profiles(id,username) values($1,'Skipper')",[C]);
    const r=(await db.query('update public.profiles set favorite_team_slug=null,onboarding_version=1 where id=$1 returning favorite_team_slug,onboarding_completed_at,onboarding_version',[C])).rows[0];assert.equal(r.favorite_team_slug,null);assert.equal(needsOnboarding(r),false);
   });
  });
 }finally{await db.close();}
});
