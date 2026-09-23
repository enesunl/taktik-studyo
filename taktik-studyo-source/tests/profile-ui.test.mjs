import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountProfile} from '../src/lib/profile-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {createProtectedPage} from '../src/lib/protected-page.js';
import {A,B,row,deferred,tick,profileDocument,profileClient,ProfileNode} from './helpers/profile-fixture.mjs';

test('profile form stays hidden during load; safe text/value rendering and canonical save, double submit blocked',async()=>{
  const f=profileDocument(),wait=deferred(),saved=deferred(),calls=[];
  const api={load:()=>wait.promise,save:input=>{calls.push(input);return saved.promise;}};
  const page=mountProfile({document:f.document,api,validatedUser:{id:A,email:'<img src=x>'},current:()=>true});
  const fields=f.mounts[0].fields;
  assert.equal(fields.form.hidden,true);assert.equal(fields.form.inert,true);
  wait.resolve({ok:true,profile:{...row(),display_name:'<script>test</script>'}});await page.ready;
  assert.equal(fields.form.hidden,false);assert.equal(fields['#profileDisplayName'].value,'<script>test</script>');
  assert.equal(fields['#profileEmail'].textContent,'<img src=x>');
  fields['#profileUsername'].value=' New ';fields['#profileDisplayName'].value=' Name ';
  const pending=fields.form.emit('submit');await fields.form.emit('submit');
  assert.deepEqual(calls,[{username:' New ',display_name:' Name '}]);assert.equal(fields['#profileSave'].disabled,true);
  saved.resolve({ok:true,profile:{...row(),username:'New',display_name:'Name'}});await pending;
  assert.equal(fields['#profileUsername'].value,'New');assert.equal(fields['#profileStatus'].textContent,'Profilin güncellendi.');
  assert.equal(fields['#profileSave'].disabled,false);page.dispose();assert.equal(f.root.children.length,0);assert.equal(fields.form.listeners.size,0);
});

test('missing profile stays editable; conflict/generic errors are safe; load error offers retry without save',async()=>{
  const f=profileDocument();let loaded=false,error='username_conflict',saves=0;
  const api={load:async()=>loaded?{ok:true,profile:null}:{ok:false,error:{message:'private SQL'}},save:async()=>{saves++;return {ok:false,error:{code:error,message:'private SQL',details:'private'}};}};
  const page=mountProfile({document:f.document,api,validatedUser:{id:A},current:()=>true});await page.ready;
  const fields=f.mounts[0].fields;
  assert.equal(fields.form.hidden,true);assert.equal(fields['#profileRetry'].hidden,false);await fields.form.emit('submit');assert.equal(saves,0);
  loaded=true;await fields['#profileRetry'].emit('click');assert.equal(fields.form.hidden,false);assert.match(fields['#profileStatus'].textContent,/tamamlamak/);
  await fields.form.emit('submit');assert.match(fields['#profileStatus'].textContent,/kullanılıyor/);
  error='unexpected';await fields.form.emit('submit');assert.match(fields['#profileStatus'].textContent,/güncellenemedi/);
  assert.doesNotMatch(fields['#profileStatus'].textContent,/private/);page.dispose();
});

function routeFixture(initialId=A) {
  let state={status:initialId?'signed_in':'signed_out',user:initialId?{id:initialId,email:'local-untrusted'}:null};
  const listeners=new Set(),invalidators=new Set(),nodes=Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut'].map(id=>[id,new ProfileNode()]));
  const dom=profileDocument({getElementById:id=>nodes[id]}),window=new ProfileNode(),navigations=[],requests=[];
  Object.assign(window,{location:{pathname:'/profil.html',search:'',replace:url=>navigations.push(url)}});
  Object.defineProperty(window,'localStorage',{get(){throw Error('Profile must not access draft storage');}});
  const f={...dom,nodes,window,navigations,requests,validation:async()=>({ok:true,user:{id:state.user.id,email:'server-validated@example.test'}}),handler:c=>({data:row(c.filters[0][1],c.filters[0][1]===A?'Alice':'Bobby')})};
  const db=profileClient(c=>{requests.push(c);return f.handler(c);});
  const auth={getState:()=>state,initialize:async()=>({ok:true}),validateUser:()=>f.validation(),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},onInvalidate(fn){invalidators.add(fn);return()=>invalidators.delete(fn);},
    signOut:async()=>{f.emit(null);return {ok:true};}};
  f.emit=(id,status=id?'signed_in':'signed_out')=>{state={status,user:id?{id,email:'local-untrusted'}:null};for(const fn of invalidators)fn();for(const fn of listeners)fn();};
  f.options={auth,document:dom.document,window,client:db.client,backend:{loadCatalogue(){throw Error('No catalogue');}}};
  return f;
}

test('profile guard validates before own load; no catalogue, import or storage; email is server-validated',async()=>{
  const f=routeFixture(),wait=deferred();f.validation=()=>wait.promise;
  const page=startPage(f.options);await tick();assert.equal(f.mounts.length,0);assert.equal(f.requests.length,0);assert.equal(f.nodes.protectedContent.hidden,true);
  wait.resolve({ok:true,user:{id:A,email:'server@example.test'}});await page.ready;await tick();
  assert.equal(f.mounts[0].fields['#profileEmail'].textContent,'server@example.test');assert.equal(f.mounts[0].fields['#profileUsername'].value,'Alice');
  assert.deepEqual(f.requests[0].filters,[['id',A]]);page.dispose();
});

test('profile guard supplies immutable validated context and omits draft scope',async()=>{
  const f=routeFixture();let context;
  const guard=createProtectedPage({auth:f.options.auth,path:'/profil.html',drafts:false,show(){},navigate(){},mount(scope,current,user){assert.equal(scope,null);assert.equal(current(),true);context=user;}});
  await guard.start();assert.equal(Object.isFrozen(context),true);assert.deepEqual(context,{id:A,email:'server-validated@example.test'});guard.dispose();
});

test('unauthenticated, recovery and failed server validation never mount profile or fetch data',async()=>{
  for(const mode of ['signed_out','password_recovery','error','mismatch']){
    const f=routeFixture(mode==='signed_out'?null:A);
    if(mode==='password_recovery')f.emit(A,mode);
    if(mode==='error')f.validation=async()=>({ok:false,error:{code:'user_validation_failed'}});
    if(mode==='mismatch')f.validation=async()=>({ok:true,user:{id:B}});
    const page=startPage(f.options);await page.ready;assert.equal(f.mounts.length,0);assert.equal(f.requests.length,0);assert.equal(f.nodes.protectedContent.hidden,true);
    if(['signed_out','password_recovery'].includes(mode))assert.match(f.navigations[0],/^\/giris.html\?next=/);
    else assert.equal(f.nodes.guardRetry.hidden,false);
    page.dispose();
  }
});

test('A pending load/save is disposed immediately on switch; B waits for validation and ignores A results',async()=>{
  for(const operation of ['load','save']){
    const f=routeFixture(),wait=deferred();
    f.handler=c=>c.filters[0][1]===A&&(operation==='load'||c.kind==='update')?wait.promise:{data:row(c.filters[0][1],c.filters[0][1]===A?'Alice':'Bobby')};
    const page=startPage(f.options);await page.ready;await tick();const a=f.mounts[0].fields;
    let pending;
    if(operation==='save'){a['#profileUsername'].value='AliceNew';pending=a.form.emit('submit');await tick();}
    const validation=deferred();f.validation=()=>validation.promise;f.emit(B);
    assert.equal(f.nodes.protectedContent.hidden,true);assert.equal(f.root.children.length,0);assert.equal(a['#profileUsername'].value,'');
    assert.equal(f.mounts.length,1);
    validation.resolve({ok:true,user:{id:B,email:'b@example.test'}});await tick();await tick();
    const b=f.mounts[1].fields;assert.equal(b['#profileUsername'].value,'Bobby');
    wait.resolve({data:row(A,'Late_A')});await pending;await tick();
    assert.equal(b['#profileUsername'].value,'Bobby');assert.equal(b['#profileStatus'].textContent,'');
    assert.equal(f.requests.filter(c=>c.kind==='update').every(c=>c.filters[0][1]===A),true);
    page.dispose();
  }
});

test('profile logout immediately removes form and pending save cannot repopulate it',async()=>{
  const f=routeFixture(),wait=deferred(),page=startPage(f.options);await page.ready;await tick();
  const fields=f.mounts[0].fields;f.handler=c=>c.kind==='update'?wait.promise:{data:row()};
  const pending=fields.form.emit('submit');await tick();await f.nodes.signOut.emit('click');
  assert.equal(f.root.children.length,0);assert.equal(f.nodes.protectedContent.hidden,true);
  wait.resolve({data:row()});await pending;await tick();assert.equal(f.root.children.length,0);assert.equal(f.navigations.at(-1),'/giris.html');page.dispose();
});

test('profile markup has accessible labels, status, keyboard submit and no extra scripts or forbidden edits',()=>{
  const html=readFileSync(new URL('../dist/profil.html',import.meta.url),'utf8');
  for(const id of ['profileUsername','profileDisplayName'])assert.match(html,new RegExp('label for="'+id+'"'));
  assert.match(html,/<form hidden inert novalidate>/);assert.match(html,/type="submit"/);assert.match(html,/role="status" aria-live="polite"/);
  assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]),['theme.js','navigation.js','backend.js']);
  assert.doesNotMatch(html,/avatar_url|type="password"|type="email"/);
  const ui=readFileSync(new URL('../src/lib/profile-ui.js',import.meta.url),'utf8');assert.doesNotMatch(ui,/innerHTML|localStorage|sessionStorage/);
  const api=readFileSync(new URL('../src/lib/profile-api.js',import.meta.url),'utf8');assert.doesNotMatch(api,/\.upsert\(|\.updateUser\(|\.eq\('username'/);
});
