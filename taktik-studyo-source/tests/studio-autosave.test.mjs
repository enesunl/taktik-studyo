import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioAutosave,createProjectRecovery,autosaveKey,SAVE_DELAY} from '../src/lib/studio-autosave.js';
import {snapshot,owner,id,copyId,memory} from './helpers/studio-project-fixture.mjs';
import {deferred,tick} from './helpers/matches-fixture.mjs';
function setup(extra={}){
 let current=true,value=snapshot('free'),revision=0;const timers=new Map(),calls=[],events=[],storage=memory(),recovery=memory();let seq=0;
 const api=Object.fromEntries(['createProject','updateProject'].map(kind=>[kind,async data=>{calls.push({kind,data});return {ok:true,project:{revision:++revision}};}]));
 const writes=[];const c=createStudioAutosave({api,current:()=>current,capture:()=>structuredClone(value),newId:()=>calls.length?copyId:id,userId:owner,storage,
  recovery:{write:p=>{writes.push(p);recovery.setItem('latest',JSON.stringify(p));return true;},clear:()=>recovery.removeItem('latest')},
  setTimer(fn,ms){assert.equal(ms,SAVE_DELAY);timers.set(++seq,fn);return seq;},clearTimer:key=>timers.delete(key),onState:s=>events.push(s.status),...extra});
 return{c,calls,events,storage,recovery,writes,timers,api,change(){value.pitch.width+=10;c.changed();},switchUser(){current=false;},async flush(){const list=[...timers.values()];timers.clear();list.forEach(f=>f());await tick();}};
}
test('opening studio creates nothing; rapid meaningful mutations debounce into one create, no empty clutter',async()=>{
 const f=setup();assert.equal(f.c.getState().status,'new');assert.equal(f.c.getState().dirty,false);await f.flush();assert.equal(f.calls.length,0);
 for(let i=0;i<20;i++)f.change();assert.equal(f.timers.size,1);assert.equal(f.calls.length,0);assert.equal(f.writes.length,20);
 await f.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].data.snapshot.pitch.width,1400);assert.equal(f.c.getState().status,'saved');assert.equal(f.recovery.getItem('latest'),null);f.c.dispose();
});
test('manual save immediate, repeated click does not create twice, clean existing save is a no-op',async()=>{
 const f=setup();const a=f.c.save({manual:true}),b=f.c.save({manual:true});await Promise.all([a,b]);assert.equal(f.calls.length,1);
 await f.c.save({manual:true});assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);f.c.dispose();
});
test('autosave off persists per-user, manual still works and re-enabling saves dirty work',async()=>{
 const f=setup();f.c.setAutosave(false);f.change();await f.flush();assert.equal(f.calls.length,0);assert.equal(f.c.getState().dirty,true);assert.equal(f.storage.getItem(autosaveKey(owner)),'off');
 await f.c.save({manual:true});assert.equal(f.calls.length,1);f.change();f.c.setAutosave(true);await f.flush();assert.equal(f.calls.length,2);f.c.dispose();
});
test('in-flight save coalesces latest mutations and advances expected revision without parallel writes',async()=>{
 const d=deferred(),f=setup();f.api.createProject=async data=>{f.calls.push({kind:'createProject',data});return d.promise;};
 f.change();const first=f.c.save();await tick();f.change();f.change();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);assert.equal(f.c.getState().status,'saving');
 d.resolve({ok:true,project:{revision:1}});await first;assert.equal(f.c.getState().status,'dirty');assert.ok(f.recovery.getItem('latest'));await f.flush();
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].data.revision,1);assert.equal(f.calls[1].data.snapshot.pitch.width,1230);assert.equal(f.c.getState().dirty,false);f.c.dispose();
});
test('failure retains latest recovery, does not retry infinitely; retry uses same creation UUID',async()=>{
 const f=setup();f.api.createProject=async data=>{f.calls.push(data);return{ok:false,error:{code:'project_request_failed'}};};f.change();await f.flush();
 assert.equal(f.c.getState().status,'error');assert.equal(f.timers.size,0);assert.ok(f.recovery.getItem('latest'));await f.flush();assert.equal(f.calls.length,1);
 await f.c.save({manual:true});assert.equal(f.calls[0].id,f.calls[1].id);assert.equal(f.c.getState().dirty,true);f.c.dispose();
});
test('CAS conflict stops autosave across edits and offers a separate copy instead of overwrite',async()=>{
 const f=setup({project:{id,title:'Plan',revision:3}});f.api.updateProject=async data=>{f.calls.push(data);return{ok:false,error:{code:'conflict'}};};
 f.change();await f.flush();assert.equal(f.c.getState().status,'conflict');f.change();assert.equal(f.timers.size,0);await f.c.save();assert.equal(f.calls.length,1);
 await f.c.save({copy:true});assert.equal(f.calls[1].kind,'createProject');assert.equal(f.calls[1].data.id,copyId);assert.equal(f.calls[1].data.revision,null);assert.match(f.calls[1].data.title,/Kopya/);f.c.dispose();
});
test('identity loss/dispose preserves unsaved recovery and stale success cannot update UI or URL',async()=>{
 const d=deferred();let urls=0;const f=setup({onSaved(){urls++;}});f.api.createProject=()=>d.promise;f.change();const p=f.c.save();await tick();const events=f.events.length;
 f.switchUser();f.c.dispose();d.resolve({ok:true,project:{revision:1}});await p;assert.equal(f.events.length,events);assert.equal(urls,0);assert.ok(f.recovery.getItem('latest'));assert.equal(f.timers.size,0);
});
test('local recovery user/tab isolation, restore, conditional cleanup and no token/session fields',()=>{
 const storage=memory(),sessionStorage=memory();let n=0;const ids=[id,copyId,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
 const make=(userId=owner)=>createProjectRecovery({storage,sessionStorage,userId,newId:()=>ids[n++%3],current:()=>true,now:()=>100});
 const first=make();assert.equal(first.read(),null);assert.equal(first.write({id,revision:null,title:'',snapshot:snapshot()}),true);
 const second=make();assert.ok(second.read());assert.equal(second.read().title,'İsimsiz çalışma');
 assert.equal(make('different-user').read(),null);assert.equal(storage.data.size,1);
 second.adopt();second.write({id,revision:1,title:'Plan',snapshot:snapshot()});assert.equal(storage.data.size,2);second.clear();assert.equal(storage.data.size,0);
 assert.doesNotMatch(JSON.stringify([...sessionStorage.data]),/access_token|refresh_token/);
});
test('opening without editing does not lose a previous recovery pointer; blocked storage is controlled',()=>{
 const storage=memory(),sessionStorage=memory();const args={storage,sessionStorage,userId:owner,current:()=>true,newId:()=>copyId};
 const first=createProjectRecovery({...args,newId:()=>id});first.write({id,revision:null,title:'Plan',snapshot:snapshot()});
 createProjectRecovery(args);assert.ok(createProjectRecovery(args).read());
 const blocked=createProjectRecovery({...args,storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.equal(blocked.read(),null);assert.equal(blocked.write({}),false);
});
