import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeeklyLineups} from '../src/lib/weekly-lineups.js';
import {mountWeeklyCollection} from '../src/lib/weekly-lineups-ui.js';
import {createStudioProjects} from '../src/lib/studio-projects.js';
import {mountStudioProjects} from '../src/lib/studio-projects-ui.js';
import {createStudioAutosave} from '../src/lib/studio-autosave.js';
import {ACCOUNT_LIMITS,limitError} from '../src/lib/studio-project-snapshot.js';
import {owner,other,id,copyId,snapshot,queryMock} from './helpers/studio-project-fixture.mjs';
import {exportFixture,ExportNode} from './helpers/weekly-export-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';

// SEC2.2 client side of the account limits and Weekly XI deletion.
const tick=()=>new Promise(r=>setTimeout(r,0));
const quota={code:'P0001',message:'quota_exceeded',hint:'studio_projects'},rate={code:'P0001',message:'rate_limited'};
const weeklyRow=(extra={})=>({id,user_id:owner,title:'My XI',season:'2026/27',week:8,formation:'4-3-3',revision:3,created_at:'2026-10-13T12:00:00Z',updated_at:'2026-10-13T12:00:00Z',...extra});

test('limits are the approved free-account values and only P0001 limit errors are mapped',()=>{
  assert.deepEqual({...ACCOUNT_LIMITS},{projects:10,weekly:40,overrides:500,sharesPerDay:10});
  assert.equal(limitError(quota),'quota_exceeded');assert.equal(limitError(rate),'rate_limited');
  for(const other of [null,{code:'P0001',message:'other'},{code:'42501',message:'quota_exceeded'}])assert.equal(limitError(other),null);
});

test('Weekly XI remove: only the signed-in owner\'s row with the expected revision; conflicts and bad input are reported',async()=>{
  const {client,calls}=queryMock([{data:{id},error:null},{data:null,error:null},{data:null,error:{code:'42501'}}]);
  const api=createWeeklyLineups({client,validatedUser:{id:owner},current:()=>true});
  assert.deepEqual(await api.remove({id,revision:3}),{ok:true});
  assert.deepEqual(calls[0],[['from','weekly_lineups'],['delete'],['eq','user_id',owner],['eq','id',id],['eq','revision',3],['select','id'],['maybeSingle']]);
  assert.equal((await api.remove({id,revision:3})).error.code,'conflict');
  assert.equal((await api.remove({id,revision:3})).error.code,'weekly_request_failed');
  for(const bad of [{id:'x',revision:1},{id,revision:0},{id,revision:'1'}])assert.equal((await api.remove(bad)).error.code,'invalid_form');
  assert.equal(calls.length,3,'invalid input never reaches the database');
  assert.equal((await createWeeklyLineups({client,validatedUser:{id:owner},current:()=>false}).remove({id,revision:3})).error.code,'state_changed');
});

test('limit errors reach the UI as quota_exceeded / rate_limited for projects, Weekly XI and autosave keeps the local copy',async()=>{
  const projects=createStudioProjects({client:queryMock([{data:null,error:quota},{data:null,error:rate},{data:null,error:{code:'XX000'}}]).client,validatedUser:{id:owner},current:()=>true});
  assert.equal((await projects.createProject({id,title:'A',snapshot:snapshot()})).error.code,'quota_exceeded');
  assert.equal((await projects.updateProject({id,revision:1,title:'A',snapshot:snapshot()})).error.code,'rate_limited');
  assert.equal((await projects.createProject({id,title:'A',snapshot:snapshot()})).error.code,'project_request_failed');
  const weekly=createWeeklyLineups({client:queryMock([{data:null,error:{...quota,hint:'weekly_lineups'}}]).client,validatedUser:{id:owner},current:()=>true});
  const {emptyWeeklyXI}=await import('../src/lib/weekly-xi.js');
  assert.equal((await weekly.save({id,title:'XI',snapshot:emptyWeeklyXI()})).error.code,'quota_exceeded');
  const backups=[],states=[];
  const autosave=createStudioAutosave({api:{createProject:async()=>({ok:false,error:{code:'quota_exceeded'}})},current:()=>true,capture:()=>snapshot(),newId:()=>copyId,userId:owner,
    recovery:{write:value=>{backups.push(value);return true;},clear(){}},onState:s=>states.push(s),setTimer:()=>0,clearTimer:()=>{}});
  const result=await autosave.save({manual:true});
  assert.equal(result.error.code,'quota_exceeded');assert.equal(states.at(-1).status,'error');assert.equal(states.at(-1).error,'quota_exceeded');
  assert.ok(backups.length>0&&backups.at(-1).snapshot,'the unsaved work stays in the local recovery copy');
});

function collection(records,{remove}={}){
  const f=exportFixture();f.nodes.weeklyCollection=new ExportNode();let rows=[...records];const removed=[];
  const api={list:async()=>({ok:true,records:rows,more:false}),remove:remove??(async row=>{removed.push(row.id);rows=rows.filter(r=>r.id!==row.id);return {ok:true};})};
  const page=mountWeeklyCollection({...f,current:()=>true,api});
  const nodes=()=>allNodes(f.nodes.weeklyCollection),text=()=>nodes().map(n=>n.textContent).join(' ');
  const deletes=()=>nodes().filter(n=>n.tagName==='button'&&n.textContent==='Sil');
  const dialog=()=>nodes().find(n=>n.tagName==='dialog');
  return {f,page,removed,nodes,text,deletes,dialog};
}

test('İlk 11’lerim: usage against the limit, Sil asks for confirmation, then refreshes list and usage',async()=>{
  const c=collection([weeklyRow(),weeklyRow({id:copyId,title:'Other XI',week:9})]);await c.page.ready;
  assert.match(c.text(),new RegExp('2 / '+ACCOUNT_LIMITS.weekly+' kayıt'));assert.equal(c.deletes().length,2);
  assert.equal(c.deletes()[0].attrs['aria-label'],'My XI · Sil');
  // Cancel: nothing is deleted.
  let pending=c.deletes()[0].emit('click');await tick();assert.equal(c.dialog().open,true);assert.match(allNodes(c.dialog()).map(n=>n.textContent).join(' '),/kalıcı olarak silinecek/);
  await allNodes(c.dialog()).find(n=>n.tagName==='button'&&n.textContent==='İptal').emit('click');await pending;assert.deepEqual(c.removed,[]);
  // Confirm.
  pending=c.deletes()[0].emit('click');await tick();
  await allNodes(c.dialog()).find(n=>n.tagName==='form').emit('submit');await pending;await tick();
  assert.deepEqual(c.removed,[id]);assert.match(c.text(),/Kayıt silindi\./);assert.match(c.text(),/1 \/ 40 kayıt/);assert.equal(c.deletes().length,1);c.page.dispose();
});

test('İlk 11’lerim: a failed or conflicting delete is explained and keeps the row',async()=>{
  const c=collection([weeklyRow()],{remove:async()=>({ok:false,error:{code:'weekly_request_failed'}})});await c.page.ready;
  const pending=c.deletes()[0].emit('click');await tick();await allNodes(c.dialog()).find(n=>n.tagName==='form').emit('submit');await pending;
  assert.match(c.text(),/Kayıt silinemedi/);assert.equal(c.deletes().length,1);assert.equal(c.deletes()[0].disabled,false);c.page.dispose();
});

test('Çalışmalarım: usage against the limit and a clear message when copying at the limit',async()=>{
  const f=exportFixture();f.nodes.studioProjectsContent=new ExportNode();
  const project=(n)=>({id:n===1?id:copyId,title:'P'+n,studio_mode:'free',match_id:null,match_week:null,snapshot_version:1,revision:1,created_at:'2026-10-13T12:00:00Z',updated_at:'2026-10-13T12:00:00Z'});
  const api={listProjects:async()=>({ok:true,projects:[project(1),project(2)],more:false,nextOffset:20}),duplicateProject:async()=>({ok:false,error:{code:'quota_exceeded'}})};
  const page=mountStudioProjects({...f,window:{crypto:{randomUUID:()=>other}},current:()=>true,api});await page.ready;
  const text=()=>allNodes(f.nodes.studioProjectsContent).map(n=>n.textContent).join(' ');
  assert.match(text(),/2 \/ 10 çalışma kullanılıyor/);
  await allNodes(f.nodes.studioProjectsContent).find(n=>n.tagName==='button'&&n.textContent==='Projeyi Çoğalt').emit('click');
  assert.match(text(),/Çalışma sınırına ulaştın \(10\)/);page.dispose();
});
