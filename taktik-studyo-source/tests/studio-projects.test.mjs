import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioProjects,PROJECT_COLUMNS} from '../src/lib/studio-projects.js';
import {snapshot,row,owner,id,copyId,queryMock} from './helpers/studio-project-fixture.mjs';
import {deferred} from './helpers/matches-fixture.mjs';
const setup=(responses,current=()=>true)=>{const mock=queryMock(responses);return{...mock,api:createStudioProjects({client:mock.client,validatedUser:{id:owner},current})};};

test('workspace summary counts every owned free/match project, returns four recent metadata rows and never snapshots',async()=>{
 const f=setup([{data:Array.from({length:5},()=>row())},{count:27},{count:8}]);
 const r=await f.api.getWorkspaceSummary();assert.equal(r.ok,true);assert.deepEqual(r.counts,{total:35,free:27,match:8});assert.equal(r.projects.length,4);
 assert(r.projects.every(p=>!Object.hasOwn(p,'snapshot')&&!Object.hasOwn(p,'user_id')));assert.equal(f.calls.length,3);
 assert.deepEqual(f.calls[0].find(c=>c[0]==='range'),['range',0,4]);
 assert.deepEqual(f.calls[0].filter(c=>c[0]==='order'),[['order','updated_at',{ascending:false}],['order','id',{ascending:false}]]);
 for(const [i,mode]of [[1,'free'],[2,'match']])assert.deepEqual(f.calls[i],[['from','studio_projects'],['select','id',{count:'exact',head:true}],['eq','user_id',owner],['eq','studio_mode',mode]]);
 assert(f.calls[0].some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]===owner));
});

test('workspace summary distinguishes real zero from failed/missing counts and hides raw errors',async()=>{
 const empty=setup([{data:[]},{count:0},{count:0}]);assert.deepEqual(await empty.api.getWorkspaceSummary(),{ok:true,projects:[],counts:{total:0,free:0,match:0}});
 for(const count of [null,undefined,-1,1.5]){
  const f=setup([{data:[]},{count},{count:1}]);assert.equal((await f.api.getWorkspaceSummary()).ok,false);
 }
 const f=setup([{data:[]},{error:{message:'private database failure'}},{count:0}]);assert.deepEqual(await f.api.getWorkspaceSummary(),{ok:false,error:{code:'project_request_failed'}});
});

test('workspace summary never delivers A statistics after account invalidation or starts stale queries',async()=>{
 let current=true;const wait=deferred(),f=setup([{data:[row()]},wait.promise,{count:1}],()=>current);
 const pending=f.api.getWorkspaceSummary();current=false;wait.resolve({count:10});assert.equal((await pending).error.code,'state_changed');
 const calls=f.calls.length;assert.equal((await f.api.getWorkspaceSummary()).error.code,'state_changed');assert.equal(f.calls.length,calls);
});
test('private project list uses owner-only metadata query, stable updated DESC and pagination',async()=>{
 const f=setup([{data:Array.from({length:21},()=>row())}]);const r=await f.api.listProjects(20);
 assert.equal(r.projects.length,20);assert.equal(r.more,true);assert.equal(r.nextOffset,40);assert.equal(r.projects[0].snapshot,undefined);
 assert.deepEqual(f.calls[0],[['from','studio_projects'],['select',PROJECT_COLUMNS],['eq','user_id',owner],['order','updated_at',{ascending:false}],['order','id',{ascending:false}],['range',20,40]]);
});
test('create pins owner, trims title, never supplies metadata; update and rename use revision CAS',async()=>{
 const f=setup([{data:row()},{data:row({revision:2})},{data:row({revision:3})}]);
 assert.equal((await f.api.createProject({id,title:'  Plan  ',snapshot:snapshot()})).ok,true);
 const payload=f.calls[0].find(c=>c[0]==='insert')[1];assert.deepEqual(Object.keys(payload),['id','user_id','title','snapshot_version','snapshot']);assert.equal(payload.user_id,owner);assert.equal(payload.title,'Plan');
 assert.equal((await f.api.updateProject({id,revision:1,title:'Plan',snapshot:snapshot()})).project.revision,2);
 assert.ok(f.calls[1].some(c=>c[0]==='eq'&&c[1]==='revision'&&c[2]===1));
 await f.api.renameProject({id,revision:2,title:'Renamed'});assert.deepEqual(f.calls[2].find(c=>c[0]==='update')[1],{title:'Renamed'});
});
test('zero-row CAS conflicts and other-owner/missing project are indistinguishable',async()=>{
 const f=setup([{data:null},{data:null},{data:null},{data:null}]);
 assert.deepEqual(await f.api.getProject(id),await f.api.getProject(copyId));
 assert.equal((await f.api.updateProject({id,revision:1,title:'Plan',snapshot:snapshot()})).error.code,'conflict');
 assert.equal((await f.api.deleteProject({id,revision:1})).error.code,'conflict');
});
test('duplicate fetches owned snapshot, creates new UUID; deletes pinned ID/revision only',async()=>{
 const f=setup([{data:row()},{data:row({id:copyId})},{data:{id}}]);await f.api.duplicateProject(id,copyId);
 const p=f.calls[1].find(c=>c[0]==='insert')[1];assert.equal(p.id,copyId);assert.equal(p.title,'Taktik çalışma - Kopya');assert.deepEqual(p.snapshot,snapshot());
 assert.equal((await f.api.deleteProject({id,revision:1})).ok,true);assert.ok(f.calls[2].some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]===owner));
});
test('ambiguous INSERT retry reuses UUID and accepts only identical stored contents',async()=>{
 const f=setup([{error:{code:'23505'}},{data:row()}]);assert.equal((await f.api.createProject({id,title:'Taktik çalışma',snapshot:snapshot()})).ok,true);
 assert.equal(f.calls.filter(q=>q.some(c=>c[0]==='insert')).length,1);
 const g=setup([{error:{code:'23505'}},{data:row({title:'Other'})}]);assert.equal((await g.api.createProject({id,title:'Plan',snapshot:snapshot()})).error.code,'conflict');
});
test('account/generation change ignores stale result and prevents follow-up copy or query',async()=>{
 let active=true;const d=deferred(),f=setup([d.promise],()=>active);const pending=f.api.duplicateProject(id,copyId);active=false;d.resolve({data:row()});
 assert.equal((await pending).error.code,'state_changed');assert.equal(f.calls.length,1);assert.equal((await f.api.listProjects()).error.code,'state_changed');assert.equal(f.calls.length,1);
});
test('bad version, raw server errors and malformed requests stay controlled',async()=>{
 const f=setup([{data:row({snapshot_version:99})},{error:{message:'sensitive server detail'}}]);assert.equal((await f.api.getProject(id)).error.code,'invalid_snapshot');
 assert.doesNotMatch(JSON.stringify(await f.api.getProject(id)),/sensitive/);assert.equal((await f.api.createProject({id:'bad',title:'x',snapshot:{}})).ok,false);assert.equal(f.calls.length,2);
});
