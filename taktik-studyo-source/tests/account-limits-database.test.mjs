import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {snapshot as studioSnapshot} from './helpers/studio-project-fixture.mjs';
import {emptyWeeklyXI} from '../src/lib/weekly-xi.js';
import {toShare} from '../src/lib/validation.js';
import {TERMS_VERSION} from '../src/lib/auth-validation.js';

// SEC2.2: the proposed account-limits migration on top of every earlier migration, in-memory only.
const dir=new URL('../supabase/migrations/',import.meta.url),LIMITS='20261015190000_account_limits.sql';
const sql=name=>readFileSync(new URL(name,dir),'utf8');
const [A,B,C]=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const TERMS='20261015200000_terms_acceptance.sql';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const quota=e=>e.code==='P0001'&&e.message==='quota_exceeded',rate=e=>e.code==='P0001'&&e.message==='rate_limited';

async function database({terms=false}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<LIMITS).sort())await db.exec(sql(name));
  // A and B have profiles (registered accounts); C never finished registration/onboarding.
  await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
  await db.query("insert into public.profiles(id,username) values ($1,'owner_a'),($2,'owner_b')",[A,B]);
  // Supabase gives service_role full table access; mirror it so server-side writes can be tested.
  await db.exec('grant all on all tables in schema public to service_role');
  const shape=async()=>({policies:(await db.query('select schemaname,tablename,policyname,cmd,roles::text,qual,with_check from pg_policies order by 1,2,3')).rows,
    acls:(await db.query("select n.nspname,c.relname,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','tactics_private') and c.relkind='r' and c.relname<>'write_budget' order by 1,2")).rows});
  const before=await shape();await db.exec(sql(LIMITS));if(terms)await db.exec(sql(TERMS));
  return {db,before,shape};
}
const fresh=db=>db.query('delete from tactics_private.write_budget');
const as=async(db,uid,fn,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
const project=(db,id,uid=A,s=studioSnapshot())=>db.query('insert into public.studio_projects(id,user_id,title,snapshot_version,snapshot) values ($1,$2,$3,1,$4)',[id,uid,'P',JSON.stringify(s)]);
const weekly=(db,id,uid=A)=>db.query("insert into public.weekly_lineups(id,user_id,title,formation,snapshot) values ($1,$2,'XI','4-3-3',$3)",[id,uid,JSON.stringify(emptyWeeklyXI())]);
const override=(db,key,uid=A)=>db.query("insert into public.player_overrides(user_id,player_key,name,role) values ($1,$2,'X','MO')",[uid,key]);
const budget=async(db,uid)=>(await db.query('select coalesce(sum(writes),0)::int writes from tactics_private.write_budget where user_id=$1',[uid])).rows[0].writes;

test('SEC2.2 row caps: 10 projects, 40 Weekly XI, 500 overrides; retries and other accounts stay correct; RLS/grants unchanged',async()=>{
  const {db,before,shape}=await database();
  try{
    assert.deepEqual(await shape(),before,'policies and table grants are unchanged');
    await as(db,A,async()=>{
      for(let i=1;i<=10;i++)await project(db,uuid(i));
      await assert.rejects(project(db,uuid(11)),quota);
      // A retried INSERT with the same id still reaches the unique constraint (client recovery path).
      await assert.rejects(project(db,uuid(1)),e=>e.code==='23505');
    });
    await fresh(db);
    await as(db,A,async()=>{
      for(let i=1;i<=40;i++)await weekly(db,uuid(100+i));
      await assert.rejects(weekly(db,uuid(141)),quota);
    });
    await fresh(db);
    await as(db,A,async()=>{
      // Bulk inserts are counted row by row; 500 rows need two write windows (400 writes each).
      await db.query("insert into public.player_overrides(user_id,player_key,name,role) select $1,'local:k'||g,'X','MO' from generate_series(1,250) g",[A]);
    });
    await fresh(db);
    await as(db,A,async()=>{
      await db.query("insert into public.player_overrides(user_id,player_key,name,role) select $1,'local:k'||g,'X','MO' from generate_series(251,500) g",[A]);
      await assert.rejects(override(db,'local:k501'),quota);
      await assert.rejects(override(db,'local:k1'),e=>e.code==='23505');
    });
    await fresh(db);
    await as(db,A,async()=>{
      // Writing a row for another account: RLS rejects it and B's counters are never touched.
      await assert.rejects(project(db,uuid(500),B),e=>e.code==='42501');
    });
    assert.equal(await budget(db,B),0);
    await as(db,B,async()=>{await project(db,uuid(600),B);});
    // Server code without a user (service role) is not limited.
    await as(db,'',async()=>{await project(db,uuid(12));},'service_role');
    assert.equal((await db.query('select count(*)::int n from public.studio_projects where user_id=$1',[A])).rows[0].n,11);
    // Deleting frees a slot again.
    await as(db,A,async()=>{await db.query('delete from public.studio_projects where id=$1',[uuid(2)]);await db.query('delete from public.studio_projects where id=$1',[uuid(3)]);await project(db,uuid(13));});
  }finally{await db.close();}
});

test('SEC2.2 write budget: 400 writes and 50 MB per 10 minutes; rejected writes are not counted; next window resets',async()=>{
  const {db}=await database();
  try{
    await as(db,A,async()=>{await project(db,uuid(1));await weekly(db,uuid(2));await override(db,'local:a');});
    let accepted=3;
    await as(db,A,async()=>{
      for(;;){try{await db.query("update public.player_overrides set name='Y' where user_id=$1 and player_key='local:a'",[A]);accepted++;}catch(e){assert.ok(rate(e));break;}}
      await assert.rejects(db.query("update public.studio_projects set title='T' where id=$1",[uuid(1)]),rate);
    });
    assert.equal(accepted,400);assert.equal(await budget(db,A),400);
    // Next 10-minute window (simulated by moving the current window back).
    await db.query("update tactics_private.write_budget set window_start=window_start-interval '10 minutes'");
    await as(db,A,async()=>{await db.query("update public.studio_projects set title='T' where id=$1",[uuid(1)]);});
    // Byte budget: 50 MB = 52,428,800 bytes; 13 writes of about 4.0 MB fit, the 14th passes it.
    await db.query('delete from tactics_private.write_budget');
    const big={...studioSnapshot(),pad:'x'.repeat(4000000)};let bigWrites=0;
    await as(db,A,async()=>{for(let i=0;i<20;i++){try{await db.query('update public.studio_projects set snapshot=$1 where id=$2',[JSON.stringify(big),uuid(1)]);bigWrites++;}catch(e){assert.ok(rate(e));break;}}});
    assert.equal(bigWrites,13);
  }finally{await db.close();}
});

test('SEC2.2 share links: 10 new links per account per UTC day next to the IP and global limits; no account id stored',async()=>{
  const {db}=await database();
  try{
    const share=JSON.stringify(toShare({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'P'+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]}));
    const bucket=i=>(i.toString(16)).padStart(64,'a');
    const create=(owner,i)=>db.query('select public.create_shared_lineup($1::jsonb,$2,$3) id',[share,bucket(i),owner]).then(r=>r.rows[0].id);
    await db.exec('set role service_role');
    const made=[];for(let i=0;i<11;i++)made.push(await create(A,i));
    assert.equal(made.filter(Boolean).length,10);assert.equal(made[10],null);
    assert.ok(await create(B,99),'another account is not affected');
    await db.exec('reset role');
    const buckets=(await db.query("select bucket from tactics_private.share_limits where bucket like 'owner:%'")).rows.map(r=>r.bucket);
    assert.equal(buckets.length,2);assert.ok(buckets.every(b=>/^owner:[0-9a-f]{64}$/.test(b)&&!b.includes(A)));
  }finally{await db.close();}
});

test('SEC2.3 an account without a profile (unfinished registration / first Google sign-in) cannot store data or create share links via the API',async()=>{
  const {db}=await database();
  try{
    await as(db,C,async()=>{
      await assert.rejects(project(db,uuid(1),C),e=>e.message==='profile_required');
      await assert.rejects(weekly(db,uuid(2),C),e=>e.message==='profile_required');
      await assert.rejects(override(db,'local:x',C),e=>e.message==='profile_required');
    });
    assert.equal(await budget(db,C),0,'rejected writes leave no counters');
    const share=JSON.stringify(toShare({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'P'+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]}));
    await db.exec('set role service_role');
    await assert.rejects(db.query('select public.create_shared_lineup($1::jsonb,$2,$3)',[share,'c'.repeat(64),C]),e=>e.message==='profile_required');
    assert.ok((await db.query('select public.create_shared_lineup($1::jsonb,$2,$3) id',[share,'d'.repeat(64),A])).rows[0].id);
    await db.exec('reset role');
  }finally{await db.close();}
});

test('SEC2.3 Terms acceptance: server-set timestamp, required for new user-created profiles, no backfill, not withdrawable',async()=>{
  const {db}=await database({terms:true});
  try{
    // Existing profiles are not marked as having accepted anything.
    assert.deepEqual((await db.query('select terms_version,terms_accepted_at from public.profiles order by username')).rows,[{terms_version:null,terms_accepted_at:null},{terms_version:null,terms_accepted_at:null}]);
    await as(db,C,async()=>{
      await assert.rejects(db.query("insert into public.profiles(id,username) values ($1,'new_user')",[C]),e=>e.message==='terms_required');
      // The acceptance time is server-owned: clients cannot write it.
      await assert.rejects(db.query("insert into public.profiles(id,username,terms_version,terms_accepted_at) values ($1,'new_user','2026-10-15','2020-01-01')",[C]),e=>e.code==='42501');
      await assert.rejects(db.query("insert into public.profiles(id,username,terms_version) values ($1,'new_user','v1')",[C]),e=>e.message==='terms_outdated');
      // Format-valid but not the current Terms (obsolete or invented): refused.
      for(const old of ['2025-01-01','2099-12-31'])await assert.rejects(db.query("insert into public.profiles(id,username,terms_version) values ($1,'new_user',$2)",[C,old]),e=>e.message==='terms_outdated');
      await db.query("insert into public.profiles(id,username,terms_version) values ($1,'new_user','2026-10-15')",[C]);
    });
    const row=async()=>(await db.query('select terms_version,terms_accepted_at from public.profiles where id=$1',[C])).rows[0];
    const first=await row();assert.equal(first.terms_version,'2026-10-15');assert.ok(first.terms_accepted_at instanceof Date);
    await as(db,C,async()=>{
      await db.query("update public.profiles set display_name='Yeni' where id=$1",[C]);
      await assert.rejects(db.query("update public.profiles set terms_accepted_at=now() where id=$1",[C]),e=>e.code==='42501');
      await assert.rejects(db.query("update public.profiles set terms_version=null where id=$1",[C]),e=>e.message==='terms_required');
    });
    assert.deepEqual(await row(),first,'other profile edits keep the original acceptance');
    // An existing user can record an acceptance later (e.g. a future Terms update) with a fresh server time.
    await as(db,A,async()=>{
      await assert.rejects(db.query("update public.profiles set terms_version='2025-01-01' where id=$1",[A]),e=>e.message==='terms_outdated');
      await db.query("update public.profiles set terms_version='2026-10-15' where id=$1",[A]);
    });
    await as(db,C,async()=>{await assert.rejects(db.query("update public.profiles set terms_version='2027-01-01' where id=$1",[C]),e=>e.message==='terms_outdated');});
    assert.ok((await db.query('select terms_accepted_at from public.profiles where id=$1',[A])).rows[0].terms_accepted_at);
    // The database and the app record the same current Terms version.
    assert.equal(sql(TERMS).match(/terms_version <> '([0-9-]+)'/)[1],TERMS_VERSION);
    // Once the profile exists, the new account can store data.
    await as(db,C,async()=>{await project(db,uuid(9),C);});
  }finally{await db.close();}
});
