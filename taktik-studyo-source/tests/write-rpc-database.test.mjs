import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {snapshot as studioSnapshot} from './helpers/studio-project-fixture.mjs';
import {emptyWeeklyXI} from '../src/lib/weekly-xi.js';

// SEC3: Studio/Weekly XI writes through save_studio_project / save_weekly_lineup, then the Stage C revoke of
// direct INSERT/UPDATE. Every migration in order, in-memory only.
const dir=new URL('../supabase/migrations/',import.meta.url);
const REVOKE_NAME='20261028180000_studio_weekly_direct_write_revoke.sql';
const REVOKE=readFileSync(new URL(REVOKE_NAME,dir),'utf8');
const REGRANT=readFileSync(new URL('../supabase/pending/studio_weekly_direct_write_regrant.sql',import.meta.url),'utf8');
const [A,B,C]=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const quota=e=>e.code==='P0001'&&e.message==='quota_exceeded',dup=e=>e.code==='23505'&&e.message==='duplicate_id',denied=e=>e.code==='42501';
const noise=n=>({...studioSnapshot(),pad:randomBytes(n*3/4).toString('base64')});

async function database({withRevoke=true}={}){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')&&(withRevoke||f!==REVOKE_NAME)).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
  await db.query("insert into public.profiles(id,username) values ($1,'owner_a'),($2,'owner_b')",[A,B]);
  // Supabase gives service_role full table access; mirror it so server-side writes can be tested.
  await db.exec('grant all on all tables in schema public to service_role');
  return db;
}
const as=async(db,uid,fn,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
// The request body is the function's one jsonb argument, exactly as PostgREST passes it.
const call=async(db,fn,body,columns='*')=>(await db.query(`select ${columns} from public.${fn}($1::jsonb)`,[JSON.stringify(body)])).rows;
const save=(db,id,revision,title,snapshot)=>call(db,'save_studio_project',{id,revision,title,snapshot},'id,user_id,title,revision,snapshot');
const saveXI=(db,id,revision,title,snapshot=emptyWeeklyXI())=>call(db,'save_weekly_lineup',{id,revision,title,season:'2026/27',week:1,snapshot},'id,user_id,title,season,week,formation,revision');
const invalid=e=>e.code==='22023';
const direct=(db,id,uid=A)=>db.query('insert into public.studio_projects(id,user_id,title,snapshot_version,snapshot) values ($1,$2,$3,1,$4)',[id,uid,'P',JSON.stringify(studioSnapshot())]);
const disk=async db=>(await db.query("select pg_total_relation_size('public.studio_projects')+pg_total_relation_size('public.weekly_lineups') n")).rows[0].n;
const budget=async(db,uid)=>(await db.query('select coalesce(sum(writes),0)::int n from tactics_private.write_budget where user_id=$1',[uid])).rows[0].n;

test('SEC3 write RPC: one record per call, owner from the session, revision CAS, reused ids refused before writing, quotas unchanged',async()=>{
  const db=await database();
  try{
    const s=studioSnapshot(),s2={...s,pitch:{...s.pitch,color:'#123456'}};
    await as(db,A,async()=>{
      const [created]=await save(db,uuid(1),null,'Plan',s);assert.deepEqual([created.user_id,created.revision],[A,1]);
      assert.equal((await save(db,uuid(1),1,'Plan',s2))[0].revision,2);
      assert.deepEqual(await save(db,uuid(1),1,'Stale',s),[],'stale revision: no row');
      const [renamed]=await save(db,uuid(1),2,'Yeni ad',null);assert.deepEqual([renamed.title,renamed.revision,renamed.snapshot],['Yeni ad',3,s2]);
      await assert.rejects(save(db,uuid(1),null,'Again',s),dup);
      // Only one object with exactly the contract keys: no owner field, no arrays (PostgREST bulk calls).
      const body={id:uuid(2),revision:null,title:'P',snapshot:s};
      for(const bad of [{...body,snapshot:null},{...body,user_id:B},{id:uuid(2),title:'P',snapshot:s},[body,{...body,id:uuid(3)}],'x',null,{...body,snapshot:[1]},{...body,revision:'1'}])
        await assert.rejects(call(db,'save_studio_project',bad),invalid,JSON.stringify(bad).slice(0,60));
      await assert.rejects(call(db,'save_weekly_lineup',[{id:uuid(52),revision:null,title:'XI',season:null,week:null,snapshot:emptyWeeklyXI()}]),invalid);
      await assert.rejects(call(db,'save_weekly_lineup',{id:uuid(52),revision:null,title:'XI',season:null,week:null,snapshot:emptyWeeklyXI(),user_id:B}),invalid);
      const [xi]=await saveXI(db,uuid(50),null,'XI');assert.deepEqual([xi.user_id,xi.formation,xi.revision],[A,'4-3-3',1]);
      assert.equal((await saveXI(db,uuid(50),1,'XI 2'))[0].revision,2);
      assert.deepEqual(await saveXI(db,uuid(50),1,'Stale'),[]);
      await assert.rejects(saveXI(db,uuid(50),null,'Again'),dup);
    });
    // Another account: same id refused, A's records cannot be changed, and look exactly like missing ones.
    await as(db,B,async()=>{
      await assert.rejects(save(db,uuid(1),null,'Steal',s),dup);
      assert.deepEqual(await save(db,uuid(1),3,'Steal',s),[]);assert.deepEqual(await save(db,uuid(999),1,'Missing',s),[]);
      assert.deepEqual(await saveXI(db,uuid(50),2,'Steal'),[]);
      assert.equal((await db.query('select count(*)::int n from public.studio_projects')).rows[0].n,0,'RLS: B sees none of A');
    });
    assert.deepEqual((await db.query('select title,revision from public.studio_projects')).rows,[{title:'Yeni ad',revision:3}]);
    // Signed out / anonymous key: no account, no write.
    await as(db,'',async()=>{await assert.rejects(save(db,uuid(3),null,'X',s),denied);});
    await as(db,'',async()=>{await assert.rejects(save(db,uuid(3),null,'X',s),denied);await assert.rejects(saveXI(db,uuid(51),null,'X'),denied);},'anon');
    // No profile (registration unfinished): refused by the unchanged account-limits trigger.
    await as(db,C,async()=>{await assert.rejects(save(db,uuid(4),null,'X',s),e=>e.message==='profile_required');});
    // Row cap, 16 MiB and write budget still apply; refused calls leave nothing on disk and cost no budget.
    await db.query('delete from tactics_private.write_budget');
    await as(db,B,async()=>{
      for(let i=1;i<=4;i++)await save(db,uuid(100+i),null,'P',noise(3500000));
      const before=await disk(db);
      for(let i=0;i<3;i++)await assert.rejects(save(db,uuid(105),null,'P',noise(3500000)),quota);
      for(let i=0;i<3;i++)await assert.rejects(save(db,uuid(101),null,'P',noise(3500000)),dup);
      assert.equal(await disk(db),before,'refused calls write no rows');
      for(let i=5;i<=10;i++)await save(db,uuid(100+i),null,'P',s);
      await assert.rejects(save(db,uuid(111),null,'P',s),quota);
    });
    assert.equal(await budget(db,B),10,'only stored writes are charged');
  }finally{await db.close();}
});

test('SEC3 revoke migration: no direct INSERT/UPDATE (table or column grant); RPC, SELECT, DELETE, RLS, records, service_role and overrides unchanged; pending regrant restores it',async()=>{
  const db=await database({withRevoke:false}),full=await database();
  try{
    const grants=async d=>(await d.query(`select table_name,privilege_type,count(*)::int n from information_schema.column_privileges
      where grantee='authenticated' and table_name in ('studio_projects','weekly_lineups') group by 1,2 order by 1,2`)).rows.map(r=>r.table_name+':'+r.privilege_type);
    const columns=async d=>(await d.query(`select table_name,privilege_type,column_name,is_grantable from information_schema.column_privileges
      where grantee='authenticated' and table_name in ('studio_projects','weekly_lineups') order by 1,2,3`)).rows;
    const rls=async d=>(await d.query(`select relname,relrowsecurity,relforcerowsecurity,(select json_agg(p order by p.policyname) from pg_policies p where p.tablename=c.relname) policies
      from pg_class c where oid in ('public.studio_projects'::regclass,'public.weekly_lineups'::regclass) order by 1`)).rows;
    const rows=async d=>(await d.query('select id,user_id,title,revision from public.studio_projects union all select id,user_id,title,revision from public.weekly_lineups order by 1')).rows;
    assert.deepEqual(await grants(db),['studio_projects:INSERT','studio_projects:SELECT','studio_projects:UPDATE','weekly_lineups:INSERT','weekly_lineups:SELECT','weekly_lineups:UPDATE']);
    // Records saved before the cutover, by the old direct path and by the functions.
    await as(db,A,async()=>{await direct(db,uuid(8));await save(db,uuid(9),null,'Plan',studioSnapshot());await saveXI(db,uuid(10),null,'XI');});
    const [columnsBefore,rlsBefore,rowsBefore]=[await columns(db),await rls(db),await rows(db)];
    await db.exec(REVOKE);
    assert.deepEqual(await grants(db),['studio_projects:SELECT','weekly_lineups:SELECT'],'column-level INSERT/UPDATE grants are gone too');
    assert.deepEqual(await columns(full),await columns(db),'the full migration sequence ends with the same grants');
    assert.deepEqual(await rls(db),rlsBefore,'RLS and ownership policies unchanged');
    assert.deepEqual(await rows(db),rowsBefore,'existing records unchanged');
    for(const t of ['studio_projects','weekly_lineups'])for(const [p,v] of [['INSERT',false],['UPDATE',false],['SELECT',true],['DELETE',true]])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) v',['authenticated','public.'+t,p])).rows[0].v,v,t+' '+p);
    await as(db,A,async()=>{
      await assert.rejects(direct(db,uuid(1)),denied);
      await assert.rejects(db.query("insert into public.weekly_lineups(id,user_id,title,formation,snapshot) values ($1,$2,'XI','4-3-3',$3)",[uuid(2),A,JSON.stringify(emptyWeeklyXI())]),denied);
      await save(db,uuid(3),null,'Plan',studioSnapshot());await saveXI(db,uuid(4),null,'XI');
      assert.equal((await save(db,uuid(8),1,'Renamed',null))[0].revision,2,'records from the direct path stay editable');
      await assert.rejects(db.query("update public.studio_projects set title='X'"),denied);
      await assert.rejects(db.query("update public.weekly_lineups set title='X'"),denied);
      assert.equal((await db.query('select count(*)::int n from public.studio_projects')).rows[0].n,3);
      assert.equal((await db.query("insert into public.player_overrides(user_id,player_key,name,role) values ($1,'local:1','X','MO'),($1,'local:2','Y','MO') returning 1",[A])).rows.length,2,'overrides keep direct bulk writes');
      assert.equal((await db.query("update public.player_overrides set name='Z' where player_key='local:1' returning 1")).rows.length,1);
      assert.equal((await db.query('delete from public.weekly_lineups where id=$1 returning id',[uuid(4)])).rows.length,1);
      assert.equal((await db.query('delete from public.studio_projects where id=$1 returning id',[uuid(3)])).rows.length,1);
    });
    await as(db,'',async()=>{await direct(db,uuid(5));await direct(db,uuid(6));await db.query("update public.studio_projects set title='Server' where id=$1",[uuid(5)]);},'service_role');
    assert.equal((await db.query('select count(*)::int n from public.studio_projects')).rows[0].n,4);
    // The rollback is pending SQL, never a migration: db push cannot apply it with the revoke.
    assert.ok(!readdirSync(dir).some(f=>/regrant/.test(f)));
    await db.exec(REGRANT);
    assert.deepEqual(await columns(db),columnsBefore,'the regrant restores exactly the previous grants');
    await as(db,A,async()=>{await direct(db,uuid(7));});
  }finally{await db.close();await full.close();}
});
