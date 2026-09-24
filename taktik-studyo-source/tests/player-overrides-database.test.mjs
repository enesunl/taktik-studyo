import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createPlayerOverrides} from '../src/lib/player-overrides.js';
import {owner,other} from './helpers/player-overrides-fixture.mjs';
const migration=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
// Real Postgres execution of the service's logical PostgREST payloads, not hosted Auth.
function sqlClient(db){return {from(table){
 assert.equal(table,'player_overrides');let action='select',values,one=false,selected='*';const filters=[];
 const column=k=>{assert.ok(['user_id','player_key','name','number','role'].includes(k));return '"'+k+'"';};
 const q={select(s){selected=s.split(',').map(column).join(',');return q;},order(){return q;},limit(){return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle(){one=true;return q;},
  insert(v){action='insert';values=v;return q;},update(v){action='update';values=v;return q;},delete(){action='delete';return q;},async then(resolve){
   try{const params=[],bind=v=>{params.push(v);return '$'+params.length;};let sql=action==='select'?'select '+selected+' from public.player_overrides':action==='delete'?'delete from public.player_overrides':action==='insert'
    ?'insert into public.player_overrides ('+Object.keys(values).map(column).join(',')+') values ('+Object.values(values).map(bind).join(',')+')'
    :'update public.player_overrides set '+Object.entries(values).map(([k,v])=>column(k)+'='+bind(v)).join(',');
    if(filters.length)sql+=' where '+filters.map(([k,v])=>column(k)+'='+bind(v)).join(' and ');
    if(action!=='select')sql+=' returning '+selected;
    const rows=(await db.query(sql,params)).rows;resolve({data:one?rows[0]??null:rows,error:null});
   }catch(e){resolve({data:null,error:{code:e.code}});}
  }};return q;
 }};}
test('M5.1 real PostgreSQL migration, CRUD contract, constraints and owner RLS',async t=>{
 const db=new PGlite();
 const as=async(uid,fn,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
 const deny=fn=>assert.rejects(fn,e=>e.code==='42501');
 const insert=(uid=owner,key='local:123',name='Custom',number=10,role='SF')=>db.query('insert into public.player_overrides(user_id,player_key,name,number,role) values($1,$2,$3,$4,$5)',[uid,key,name,number,role]);
 const existing=async()=>({policies:(await db.query("select * from pg_policies where tablename<>'player_overrides' order by schemaname,tablename,policyname")).rows,acls:(await db.query("select relname,relacl from pg_class where relnamespace='public'::regnamespace and relname<>'player_overrides' order by relname")).rows});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const n of ['20260913063249_football_backend.sql','20260920094922_catalogue_authenticated_read.sql','20260920102243_profiles_ownership.sql','20260923135716_studio_projects.sql'])await db.exec(migration(n));
  await db.query('insert into auth.users values($1),($2)',[owner,other]);const before=await existing();
  await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated');
  await db.exec(migration('20260924094207_player_overrides.sql'));
  await t.test('only new table security changes; RLS, four policies, PK index and minimal column grants',async()=>{
   const after=await existing();after.acls=after.acls.filter(r=>r.relname!=='player_overrides_pkey');assert.deepEqual(after,before);
   assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.player_overrides'::regclass")).rows[0].relrowsecurity,true);
   assert.equal((await db.query("select * from pg_policies where tablename='player_overrides'")).rows.length,4);
   for(const role of ['anon','authenticated'])for(const p of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES'])assert.equal((await db.query("select has_table_privilege($1,'public.player_overrides',$2) yes",[role,p])).rows[0].yes,role==='authenticated'&&['SELECT','DELETE'].includes(p));
   for(const c of ['user_id','player_key','name','number','role','created_at','updated_at'])for(const p of ['INSERT','UPDATE'])assert.equal((await db.query("select has_column_privilege('authenticated','public.player_overrides',$1,$2) yes",[c,p])).rows[0].yes,p==='INSERT'? !['created_at','updated_at'].includes(c):['name','number','role'].includes(c));
  });
  await t.test('A actual service insert/update/reload/reset succeeds with narrow privileges and trigger',async()=>{
   await as(owner,async()=>{const opts={client:sqlClient(db),validatedUser:{id:owner},current:()=>true},a=createPlayerOverrides(opts);
    assert.equal((await a.save('local:123',{name:'  My player  ',number:10,role:'SF'})).ok,true);
    const original=(await db.query('select * from public.player_overrides')).rows[0];
    assert.equal((await a.save('local:123',{name:'Renamed',number:null,role:'MO'})).ok,true);
    const updated=(await db.query('select * from public.player_overrides')).rows[0];assert.deepEqual(updated.created_at,original.created_at);assert.ok(new Date(updated.updated_at)>=new Date(original.updated_at));
    const reload=createPlayerOverrides(opts);assert.equal((await reload.load()).ok,true);assert.equal(reload.effective('local:123',{}).name,'Renamed');
    assert.equal((await a.reset('local:123')).ok,true);assert.equal((await db.query('select * from public.player_overrides')).rows.length,0);
   });
  });
  await t.test('B cannot see/change/delete A; ownership spoof denied; anon CRUD denied',async()=>{
   await as(owner,()=>insert());
   await as(other,async()=>{assert.equal((await db.query('select * from public.player_overrides')).rows.length,0);
    assert.equal((await db.query("update public.player_overrides set name='Stolen' returning *")).rows.length,0);
    assert.equal((await db.query('delete from public.player_overrides returning *')).rows.length,0);await deny(()=>insert(owner,'local:124'));await insert(other);
   });
   await as(null,async()=>{for(const sql of ['select * from public.player_overrides',"update public.player_overrides set name='Stolen'",'delete from public.player_overrides'])await deny(()=>db.exec(sql));await deny(()=>insert());},'anon');
  });
  await t.test('server validates fields, ownership/identity/timestamps immutable, FK cascade isolated',async()=>{
   await as(owner,async()=>{
    for(const [key,name,number,role] of [['bad','Name',1,'MO'],['bsd:0','Name',1,'MO'],['bsd:8','x'.repeat(25),1,'MO'],['bsd:8',' Name ',1,'MO'],['bsd:8','A\nB',1,'MO'],['bsd:8','A\u0085B',1,'MO'],['bsd:8','Name',100,'MO'],['bsd:8','Name',1,'bad']])await assert.rejects(insert(owner,key,name,number,role),e=>e.code==='23514');
    for(const c of ['user_id','player_key','created_at','updated_at'])await deny(()=>db.exec('update public.player_overrides set '+c+'='+c));
   });
   await db.query('delete from auth.users where id=$1',[owner]);assert.deepEqual((await db.query('select user_id from public.player_overrides')).rows,[{user_id:other}]);
  });
 }finally{await db.close();}
});
