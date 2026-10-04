import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {snapshot,owner,other,id,copyId} from './helpers/studio-project-fixture.mjs';
import {createStudioProjects,PROJECT_COLUMNS} from '../src/lib/studio-projects.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';
// Transport double only: application payloads/filters execute as real SQL under SET ROLE.
// This does not emulate hosted Auth or claim to exercise PostgREST.
function sqlClient(db,calls){
 const columns=new Set([...PROJECT_COLUMNS.split(','),'snapshot']);
 const column=name=>{assert.ok(columns.has(name));return '"'+name+'"';};
 return {from(table){
  assert.equal(table,'studio_projects');let action='select',values,selected='*',head=false,single=false,range;const filters=[],orders=[];
  const q={insert(v){action='insert';values=v;calls.push(structuredClone(v));return q;},update(v){action='update';values=v;return q;},delete(){action='delete';return q;},
   select(v,options){selected=v.split(',').map(column).join(',');head=options?.head===true;return q;},eq(k,v){filters.push([k,v]);return q;},maybeSingle(){single=true;return q;},
   order(k,{ascending}){orders.push(column(k)+(ascending?' asc':' desc'));return q;},range(from,to){range=[from,to];return q;},
   async then(resolve,reject){try{
    const params=[],bind=v=>{params.push(v&&typeof v==='object'?JSON.stringify(v):v);return '$'+params.length;};
    let sql=action==='select'?'select '+(head?'count(*) as total':selected)+' from public.studio_projects':action==='delete'?'delete from public.studio_projects':action==='insert'
     ?'insert into public.studio_projects ('+Object.keys(values).map(column).join(',')+') values ('+Object.values(values).map(bind).join(',')+')'
     :'update public.studio_projects set '+Object.entries(values).map(([k,v])=>column(k)+'='+bind(v)).join(',');
    if(filters.length)sql+=' where '+filters.map(([k,v])=>column(k)+'='+bind(v)).join(' and ');
    if(action!=='select')sql+=' returning '+selected;
    if(orders.length)sql+=' order by '+orders.join(',');if(range)sql+=' limit '+bind(range[1]-range[0]+1)+' offset '+bind(range[0]);
    const rows=(await db.query(sql,params)).rows;resolve({data:head?null:single?rows[0]??null:rows,error:null,...(head?{count:Number(rows[0].total)}:{})});
   }catch(e){reject(e);}}
  };return q;
 }};
}
const migration=n=>readFileSync(new URL('../supabase/migrations/'+n,import.meta.url),'utf8');
const denied=fn=>assert.rejects(fn,e=>e.code==='42501');
// Real SQL/RLS in an isolated in-memory Postgres; Auth identity is a test double.
test('M5 private project migration: real SQL ownership, grants, CAS and constraints',async t=>{
 const db=new PGlite(),s=snapshot();
 const as=async(uid,fn,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
 const insert=(uid=owner,pid=id,value=s,title='Plan')=>db.query('insert into public.studio_projects (id,user_id,title,snapshot_version,snapshot) values ($1,$2,$3,1,$4) returning *',[pid,uid,title,JSON.stringify(value)]);
 const unchanged=async()=>({policies:(await db.query("select * from pg_policies where tablename <> 'studio_projects' order by schemaname,tablename,policyname")).rows,
   acls:(await db.query("select relname,relacl from pg_class where relnamespace='public'::regnamespace and relname in ('teams','players','profiles','shared_lineups') order by relname")).rows});
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const n of ['20260913063249_football_backend.sql','20260920094922_catalogue_authenticated_read.sql','20260920102243_profiles_ownership.sql'])await db.exec(migration(n));
  await db.query('insert into auth.users values ($1),($2)',[owner,other]);const before=await unchanged();
  await db.exec('alter default privileges in schema public grant all on tables to public,anon,authenticated');
  await db.exec(migration('20260923135716_studio_projects.sql'));
  await t.test('existing security unchanged and minimal grants override permissive defaults',async()=>{
   assert.deepEqual(await unchanged(),before);
   for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']){
    const yes=(await db.query("select has_table_privilege($1,'public.studio_projects',$2) as yes",[role,privilege])).rows[0].yes;
    assert.equal(yes,role==='authenticated'&&['SELECT','DELETE'].includes(privilege));
   }
   const f=(await db.query("select prosecdef,proconfig from pg_proc where oid='tactics_private.studio_project_metadata()'::regprocedure")).rows[0];assert.equal(f.prosecdef,false);assert.deepEqual(f.proconfig,['search_path=""']);
  });
  await t.test('A creates/reads only own, cannot spoof user_id; B and anon cannot access A',async()=>{
   const r=await as(owner,()=>insert());assert.equal(r.rows[0].revision,1);assert.equal(r.rows[0].studio_mode,'match');assert.equal(r.rows[0].match_week,6);
   await as(owner,()=>denied(()=>insert(other,copyId)));
   await as(other,async()=>{assert.deepEqual((await db.query('select * from public.studio_projects where id=$1',[id])).rows,[]);
    assert.equal((await db.query("update public.studio_projects set title='Stolen' where id=$1 returning id",[id])).rows.length,0);
    assert.equal((await db.query('delete from public.studio_projects where id=$1 returning id',[id])).rows.length,0);});
   await as(null,async()=>{for(const q of ['select * from public.studio_projects',"update public.studio_projects set title='Bad'",'delete from public.studio_projects'])await denied(()=>db.exec(q));await denied(()=>insert());},'anon');
  });
  await t.test('profile summary runs real owned metadata/count queries under RLS without snapshots',async()=>{
   const foreignId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
   await as(owner,()=>insert(owner,copyId,snapshot('free')));await as(other,()=>insert(other,foreignId));
   try{
    for(const [uid,counts]of [[owner,{total:2,free:1,match:1}],[other,{total:1,free:0,match:1}]])await as(uid,async()=>{
     const api=createStudioProjects({client:sqlClient(db,[]),validatedUser:{id:uid},current:()=>true});
     const result=await api.getWorkspaceSummary();assert.equal(result.ok,true);assert.deepEqual(result.counts,counts);assert.equal(result.projects.length,counts.total);assert(result.projects.every(p=>!Object.hasOwn(p,'snapshot')));
     assert(result.projects.every(p=>uid===owner?p.id!==foreignId:p.id===foreignId));
    });
   }finally{await as(owner,()=>db.query('delete from public.studio_projects where id=$1',[copyId]));await as(other,()=>db.query('delete from public.studio_projects where id=$1',[foreignId]));}
  });
  await t.test('revision CAS prevents stale tab overwrite; rename preserves snapshot and server timestamps',async()=>{
   await as(owner,async()=>{
    const old=(await db.query('select * from public.studio_projects where id=$1',[id])).rows[0];
    const a=(await db.query("update public.studio_projects set title='Renamed' where id=$1 and user_id=$2 and revision=1 returning *",[id,owner])).rows[0];assert.equal(a.revision,2);assert.deepEqual(a.snapshot,old.snapshot);assert.deepEqual(a.created_at,old.created_at);assert.ok(new Date(a.updated_at)>=new Date(old.updated_at));
    assert.equal((await db.query("update public.studio_projects set title='Stale B' where id=$1 and revision=1 returning id",[id])).rows.length,0);
    for(const column of ['user_id','id','revision','created_at','updated_at','studio_mode'])await denied(()=>db.exec(`update public.studio_projects set ${column}=${column}`));
   });
  });
  await t.test('invalid title/version/size rejected server-side; owner copy new identity and revision1',async()=>{
   await as(owner,async()=>{
    for(const title of ['', '  Plan  ','x'.repeat(121),'a\nb'])await assert.rejects(insert(owner,copyId,s,title),e=>e.code==='23514');
    for(const bad of [{...s,version:2},{...s,large:'x'.repeat(4*1024*1024)},{...s,drawings:Array(201).fill({})}])await assert.rejects(insert(owner,copyId,bad),e=>e.code==='23514');
    const copy=(await insert(owner,copyId)).rows[0];assert.equal(copy.revision,1);assert.deepEqual(copy.snapshot,s);
    assert.equal((await db.query('delete from public.studio_projects where id=$1 and revision=1 returning id',[copyId])).rows.length,1);
   });
  });
  await t.test('real createProject payload supports free/match CRUD with derived context and minimal INSERT grants',async()=>{
   const calls=[],api=createStudioProjects({client:sqlClient(db,calls),validatedUser:{id:owner},current:()=>true});
   await as(owner,async()=>{
    for(const mode of ['free','match']){
     const value=snapshot(mode),created=await api.createProject({id:copyId,title:'  Contract  ',snapshot:value});
     assert.equal(created.ok,true);assert.deepEqual(calls.at(-1),{id:copyId,user_id:owner,title:'Contract',snapshot_version:1,snapshot:value});
     assert.equal(created.project.studio_mode,mode);assert.equal(created.project.match_id,mode==='match'?'215997':null);assert.equal(created.project.match_week,mode==='match'?6:null);
     assert.equal(created.project.revision,1);assert.ok(created.project.created_at);assert.ok(created.project.updated_at);
     const read=await api.getProject(copyId);assert.equal(read.ok,true);assert.deepEqual(read.project.snapshot,value);
     const edited=structuredClone(value);edited.pitch.color='#154070';edited.working[0].x=.31;
     const updated=await api.updateProject({id:copyId,revision:1,title:'Contract',snapshot:edited});assert.equal(updated.ok,true);assert.equal(updated.project.revision,2);
     assert.deepEqual((await api.getProject(copyId)).project.snapshot,edited);
     assert.equal((await api.renameProject({id:copyId,revision:2,title:'Renamed contract'})).ok,true);
     const renamed=(await api.getProject(copyId)).project;assert.equal(renamed.title,'Renamed contract');assert.deepEqual(renamed.snapshot,edited);
     assert.equal((await api.deleteProject({id:copyId,revision:3})).ok,true);assert.equal((await api.getProject(copyId)).ok,false);
    }
    const forbidden={studio_mode:'match',match_id:'215997',match_week:6,revision:99,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
    for(const [column,value] of Object.entries(forbidden))await denied(()=>db.query(`insert into public.studio_projects (id,user_id,title,snapshot_version,snapshot,${column}) values ($1,$2,'Plan',1,$3,$4)`,[copyId,owner,JSON.stringify(s),value]));
   });
  });
  await t.test('SQL save and provider/roster-free reopen preserve 22 occupants, both benches, substitutions, drawings and pitch',async()=>{
   const api=createStudioProjects({client:sqlClient(db,[]),validatedUser:{id:owner},current:()=>true});
   await as(owner,async()=>{
    for(const mode of ['free','match']){
     const value=snapshot(mode);value.pitch={color:'#154070',width:1300,height:700};value.working[0].x=.31;
     const substitutions=[];
     for(const side of ['home','away']){
      const outgoing=value.teams[side].players[1],incoming=value.teams[side].bench[0];assert.ok(incoming);
      value.working.find(p=>p.slotKey===outgoing.key).personKey=incoming.key;substitutions.push({side,outgoing,incoming});
     }
     assert.equal((await api.createProject({id:copyId,title:'Reopen',snapshot:value})).ok,true);
     assert.deepEqual((await api.getProject(copyId)).project.snapshot,value);
     const f=matchBoardDocument('/mac-studyosu?project='+copyId);let providerCalls=0;
     assert.equal(f.window.TAKTIK_ROSTERS,undefined);
     const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,userId:owner,projects:api,api:{load(){providerCalls++;throw Error('No provider');}}});
     try{
      await page.ready;const root=f.nodes.matchStudioContent;
      const markers=allNodes(root).filter(n=>n.dataset.slotKey);assert.equal(markers.length,22);
      for(const p of value.working){const marker=markers.find(n=>n.dataset.slotKey===p.slotKey);assert.equal(marker.dataset.playerKey,p.personKey);assert.ok(Math.abs(parseFloat(marker.style.left)-p.x*100)<1e-7);assert.ok(Math.abs(parseFloat(marker.style.top)-p.y*100)<1e-7);}
      for(const {side,outgoing,incoming} of substitutions){
       fire(markers.find(n=>n.dataset.slotKey===outgoing.key),'click');
       const actual=allNodes(root).filter(n=>n.className==='match-reserve').map(n=>n.dataset.playerKey).sort();
       const occupied=new Set(value.working.map(p=>p.personKey));
       const expected=[...value.teams[side].players,...value.teams[side].bench].filter(p=>!occupied.has(p.key)).map(p=>p.key).sort();
       assert.deepEqual(actual,expected);assert.ok(actual.includes(outgoing.key));assert.ok(!actual.includes(incoming.key));
      }
      const pitch=allNodes(root).find(n=>n.className==='match-pitch');assert.equal(pitch.attrs['--match-pitch-background'],value.pitch.color);assert.equal(pitch.attrs['--match-pitch-width'],'1300px');assert.equal(pitch.attrs['--match-pitch-height'],'700px');
      const drawings=allNodes(root).find(n=>n.className==='match-drawings');assert.equal(drawings.children[0].children.length,6);
      assert.equal(allNodes(root).find(n=>n.dataset.action==='undo').disabled,true);assert.equal(providerCalls,0);
     }finally{page.dispose();}
     assert.equal((await api.deleteProject({id:copyId,revision:1})).ok,true);
    }
   });
  });
  await t.test('Auth user deletion cascades only its projects',async()=>{await as(other,()=>insert(other,copyId));await db.query('delete from auth.users where id=$1',[owner]);assert.deepEqual((await db.query('select id from public.studio_projects')).rows,[{id:copyId}]);assert.deepEqual(await unchanged(),before);});
 }finally{await db.close();}
});
