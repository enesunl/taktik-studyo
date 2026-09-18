import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft, writeDraft} from '../src/lib/drafts.js';
import {userDraftKey, legacyDraftKeys, createUserDraftScope} from '../src/lib/draft-scope.js';
import {bindAuthenticatedDrafts} from '../src/lib/auth-drafts.js';
import {createAuthSession} from '../src/lib/auth-session.js';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const state = name => ({team:{name,short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,
  players:Array.from({length:11},(_,id)=>({id,name:'Player '+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]});
function harness() {
  const data=new Map(), reads=[], writes=[], pending=new Map(), callbacks=[], events=new Map(); let timer=0;
  const storage={getItem(key){reads.push(key);return data.get(key)??null;},setItem(key,value){writes.push(key);data.set(key,value);}};
  const eventTarget={addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},
    removeEventListener(name,fn){events.get(name)?.delete(fn);}};
  const timing={eventTarget,setTimer(fn){callbacks.push(fn);pending.set(++timer,fn);return timer;},clearTimer(id){pending.delete(id);}};
  return {data,storage,reads,writes,pending,callbacks,events,timing,
    flush(){const jobs=[...pending.values()];pending.clear();jobs.forEach(fn=>fn());},
    pagehide(){for(const fn of [...(events.get('pagehide')||[])])fn();}};
}

test('deterministic strict UUID/slot keys have no authenticated fallback', () => {
  assert.equal(userDraftKey(A,'main'),`taktik:draft:${A}:main:v2`);
  assert.equal(userDraftKey(A,'left'),`taktik:draft:${A}:comparison:left:v2`);
  assert.equal(userDraftKey(A,'right'),`taktik:draft:${A}:comparison:right:v2`);
  assert.equal(userDraftKey(A,'main'),userDraftKey(A,'main'));
  assert.notEqual(userDraftKey(A,'main'),userDraftKey(B,'main'));
  for(const id of [null,undefined,'','anonymous','../'+A,A+'x',' '+A,'11111111-1111-0111-8111-111111111111','11111111-1111-4111-7111-111111111111']) {
    assert.equal(userDraftKey(id,'main'),null);
    assert.equal(createUserDraftScope({userId:id}),null);
  }
  for(const slot of ['shared','comparison','__proto__','',null])assert.equal(userDraftKey(A,slot),null);
});

test('user and left/right isolation preserves payload version 1 without legacy adoption', () => {
  const h=harness();writeDraft(h.storage,legacyDraftKeys.main,state('Legacy'));
  const a=createUserDraftScope({userId:A,storage:h.storage}), b=createUserDraftScope({userId:B,storage:h.storage});
  assert.equal(a.context('main').read(),null);assert.equal(b.context('main').read(),null);
  for(const [scope,slot,name] of [[a,'main','A'],[b,'main','B'],[a,'left','A Left']]) {
    const writer=scope.context(slot).createWriter({...h.timing,getState:()=>state(name)});writer.schedule();h.flush();
  }
  assert.equal(a.context('main').read().team.name,'A');assert.equal(b.context('main').read().team.name,'B');
  assert.equal(a.context('right').read(),null);assert.equal(b.context('left').read(),null);
  assert.equal(JSON.parse(h.data.get(userDraftKey(A,'main'))).version,1);
  assert.equal(readDraft(h.storage,legacyDraftKeys.main).team.name,'Legacy');
  a.dispose();b.dispose();
});

test('legacy inspection only checks known keys; import is explicit, validated and non-destructive', () => {
  const h=harness();writeDraft(h.storage,legacyDraftKeys.main,state('Legacy'));
  h.data.set(legacyDraftKeys.left,'{bad');h.data.set(legacyDraftKeys.right,JSON.stringify({version:1,state:{bad:true}}));
  h.data.set(`taktik:draft:shared:${A}:v1`,'public');h.data.set(userDraftKey(B,'main'),'other-private');
  const scope=createUserDraftScope({userId:A,storage:h.storage});
  const info=scope.inspectLegacy();assert.equal(info.ok,true);
  assert.deepEqual(info.slots.map(s=>s.legacyValid),[true,false,false]);
  const allowed=new Set([...Object.values(legacyDraftKeys),...['main','left','right'].map(s=>userDraftKey(A,s))]);
  assert.ok(h.reads.every(k=>allowed.has(k)));assert.equal(h.data.has(userDraftKey(A,'main')),false);
  assert.equal(scope.importLegacy('main').code,'confirmation_required');
  assert.equal(scope.importLegacy('main',{confirmed:'true'}).code,'confirmation_required');
  assert.equal(scope.importLegacy('shared',{confirmed:true}).code,'invalid_slot');
  assert.equal(scope.importLegacy('left',{confirmed:true}).code,'invalid_source');
  assert.equal(scope.importLegacy('right',{confirmed:true}).code,'invalid_source');
  const original=h.data.get(legacyDraftKeys.main);
  assert.deepEqual(scope.importLegacy('main',{confirmed:true}),{ok:true,status:'imported'});
  assert.equal(scope.context('main').read().team.name,'Legacy');
  const imported=h.data.get(userDraftKey(A,'main'));
  writeDraft(h.storage,legacyDraftKeys.main,state('Changed legacy'));
  assert.equal(scope.importLegacy('main',{confirmed:true}).status,'skipped_existing');
  assert.equal(h.data.get(userDraftKey(A,'main')),imported);
  assert.ok(original);assert.equal(readDraft(h.storage,legacyDraftKeys.main).team.name,'Changed legacy');
  h.data.set(userDraftKey(A,'left'),'{corrupt target');writeDraft(h.storage,legacyDraftKeys.left,state('Valid source'));
  assert.equal(scope.importLegacy('left',{confirmed:true}).status,'skipped_existing');
  assert.equal(h.data.get(userDraftKey(A,'left')),'{corrupt target');scope.dispose();
});

test('legacy import preserves a target created while reading the source', () => {
  const h=harness(),target=userDraftKey(A,'main');
  writeDraft(h.storage,legacyDraftKeys.main,state('Legacy'));
  const source=h.data.get(legacyDraftKeys.main);
  const concurrent=JSON.stringify({version:1,savedAt:123,state:state('Other tab')});
  const targetReads=[];
  const storage={
    getItem(key){
      if(key===target)targetReads.push(h.data.get(key)??null);
      if(key===legacyDraftKeys.main)h.data.set(target,concurrent);
      return h.storage.getItem(key);
    },
    setItem:h.storage.setItem,
  };
  const scope=createUserDraftScope({userId:A,storage});
  try {
    h.writes.length=0;
    assert.deepEqual(scope.importLegacy('main',{confirmed:true}),{ok:true,status:'skipped_existing'});
    assert.deepEqual(targetReads,[null,concurrent]);
    assert.equal(h.data.get(target),concurrent);
    assert.equal(h.data.get(legacyDraftKeys.main),source);
    assert.deepEqual(h.writes,[]);
  } finally {scope.dispose();}
});

test('disposed A debounce/pagehide and retained callbacks cannot write into B context', () => {
  const h=harness();const a=createUserDraftScope({userId:A,storage:h.storage});
  const old=a.context('main').createWriter({...h.timing,getState:()=>state('A')});
  old.schedule();const delayed=h.callbacks.at(-1);const oldPagehide=[...h.events.get('pagehide')][0];
  a.dispose();assert.equal(h.events.get('pagehide').size,0);assert.equal(h.pending.size,0);
  const b=createUserDraftScope({userId:B,storage:h.storage});assert.equal(b.context('main').read(),null);
  const next=b.context('main').createWriter({...h.timing,getState:()=>state('B')});
  next.schedule();delayed();oldPagehide();old.schedule();assert.equal(old.flush(),false);
  h.flush();assert.equal(h.data.has(userDraftKey(A,'main')),false);assert.equal(b.context('main').read().team.name,'B');
  h.pagehide();b.dispose();assert.equal(h.events.get('pagehide').size,0);
  assert.ok(h.writes.every(k=>k===userDraftKey(B,'main')));
});

test('identity changes deny reads/writes before deferred Auth subscriber cleanup', () => {
  const h=harness();let current=A;
  const a=createUserDraftScope({userId:A,storage:h.storage,isCurrent:()=>current===A});
  const context=a.context('main'),writer=context.createWriter({...h.timing,getState:()=>state('A')});
  writer.schedule();current=B;h.flush();
  assert.equal(context.read(),null);assert.equal(a.isActive(),false);assert.equal(h.writes.length,0);
  assert.equal(h.events.get('pagehide').size,0);assert.equal(a.importLegacy('main',{confirmed:true}).code,'inactive_scope');
});

test('writer cancels debounce, flushes pagehide and skips active gestures', () => {
  const h=harness();let canSave=false;
  const scope=createUserDraftScope({userId:A,storage:h.storage});
  const writer=scope.context('main').createWriter({...h.timing,getState:()=>state('A'),canSave:()=>canSave});
  writer.schedule();writer.schedule();assert.equal(h.pending.size,1);h.pagehide();assert.equal(h.writes.length,0);
  canSave=true;writer.schedule();h.pagehide();assert.equal(h.pending.size,0);assert.equal(h.writes.length,1);
  writer.schedule();writer.cancel();h.flush();assert.equal(h.writes.length,1);
  writer.dispose();writer.dispose();scope.dispose();h.pagehide();assert.equal(h.writes.length,1);
});

test('unavailable/quota storage and malformed drafts fail without fallback', () => {
  const unavailable={getItem(){throw Error('unavailable');},setItem(){throw Error('quota');}};
  const scope=createUserDraftScope({userId:A,storage:unavailable});
  assert.equal(scope.context('main').read(),null);assert.equal(scope.inspectLegacy().code,'storage_unavailable');
  assert.equal(scope.importLegacy('main',{confirmed:true}).code,'storage_unavailable');
  const writer=scope.context('main').createWriter({getState:()=>state('A')});assert.equal(writer.flush(),false);scope.dispose();
  const h=harness();writeDraft(h.storage,legacyDraftKeys.main,state('Legacy'));
  const quota=createUserDraftScope({userId:A,storage:{getItem:h.storage.getItem,setItem(){throw Error('quota');}}});
  assert.equal(quota.importLegacy('main',{confirmed:true}).code,'write_failed');
  assert.equal(h.data.has(userDraftKey(A,'main')),false);quota.dispose();
  h.data.set(userDraftKey(A,'main'),'{bad');
  const corrupt=createUserDraftScope({userId:A,storage:h.storage});assert.equal(corrupt.context('main').read(),null);corrupt.dispose();
});

test('opt-in Auth binding reads only Auth identity, disposes mounts, preserves all draft keys on logout', async () => {
  const h=harness();let sdkCallback,current={user:{id:A}};
  const client={auth:{onAuthStateChange(fn){sdkCallback=fn;return {data:{subscription:{unsubscribe(){}}}};},
    async getSession(){return {data:{session:current}};},async signOut(options){assert.deepEqual(options,{scope:'local'});current=null;sdkCallback('SIGNED_OUT',null);return {};}}};
  const auth=createAuthSession(client),mounts=[],cleanups=[];
  const binding=bindAuthenticatedDrafts({auth,storage:h.storage,mount(scope){
    const context=scope.context('main');mounts.push(context);
    const name=auth.getCurrentUser().id;const writer=context.createWriter({...h.timing,getState:()=>state(name)});writer.schedule();
    return ()=>cleanups.push(name);
  }});
  try {
    writeDraft(h.storage,legacyDraftKeys.main,state('Legacy'));writeDraft(h.storage,`taktik:draft:shared:${A}:v1`,state('Shared'));
    const first=binding.start();assert.equal(binding.start(),first);await first;h.flush();
    assert.equal(mounts.length,1);assert.equal(mounts[0].read().team.name,A);
    current={user:{id:B}};sdkCallback('SIGNED_IN',current);
    assert.equal(mounts[0].read(),null);
    await new Promise(r=>setTimeout(r,15));h.flush();
    assert.equal(mounts.length,2);assert.equal(mounts[1].read().team.name,B);assert.deepEqual(cleanups,[A]);
    const before=[...h.data];await auth.signOut();await new Promise(r=>setTimeout(r,15));
    assert.deepEqual([...h.data],before);assert.deepEqual(cleanups,[A,B]);assert.equal(h.events.get('pagehide').size,0);
    current={user:{id:A}};sdkCallback('PASSWORD_RECOVERY',current);await new Promise(r=>setTimeout(r,15));
    assert.equal(mounts.length,2);
    current={user:{id:'bad'}};sdkCallback('SIGNED_IN',current);await new Promise(r=>setTimeout(r,15));assert.equal(mounts.length,2);
  } finally {binding.dispose();auth.dispose();}
});
