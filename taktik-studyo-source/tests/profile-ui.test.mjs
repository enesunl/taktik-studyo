import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preferenceColumns} from '../src/lib/profile-preferences.js';
import {mountProfile,profileInitials} from '../src/lib/profile-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {createProtectedPage} from '../src/lib/protected-page.js';
import {A,B,row,deferred,tick,profileDocument,profileClient,ProfileNode} from './helpers/profile-fixture.mjs';

test('both edit buttons open one form; cancel restores persisted values, focus and read-only rows without requests',async()=>{
 const f=profileDocument();let loads=0,saves=0;
 const page=mountProfile({document:f.document,current:()=>true,validatedUser:{id:A,email:'real@example.test'},api:{load:async()=>{loads++;return {ok:true,profile:row()};},save:async()=>{saves++;return {ok:true,profile:row()};}}});await page.ready;
 const fields=f.mounts[0].fields;
 assert.equal(fields.form.hidden,true);assert.equal(fields['#profileReadUsername'].textContent,'Canonical');assert.equal(fields['#profileReadEmail'].textContent,'real@example.test');
 for(const opener of ['#profileEdit','#profileAccountEdit']){
  await fields[opener].emit('click');assert.equal(fields.form.hidden,false);assert.equal(fields.form.inert,false);assert.equal(fields['#profileReadOnly'].hidden,true);assert.equal(fields[opener].attrs['aria-expanded'],'true');
  fields['#profileUsername'].value='unsaved';fields['#profileDisplayName'].value='Unsaved name';
  await fields['#profileCancel'].emit('click');assert.equal(fields.form.hidden,true);assert.equal(fields.form.inert,true);assert.equal(fields['#profileReadOnly'].hidden,false);
  assert.equal(fields['#profileUsername'].value,'Canonical');assert.equal(fields['#profileDisplayName'].value,'Görünen ad');assert.equal(fields['#profileName'].textContent,'Görünen ad');assert(fields[opener].focused);assert.equal(fields[opener].attrs['aria-expanded'],'false');
 }
 assert.equal(loads,1);assert.equal(saves,0);page.dispose();
 for(const key of ['#profileEdit','#profileAccountEdit','#profileCancel'])assert.equal(fields[key].listeners.size,0);
});

test('failed save stays editable; cancel is blocked during save and later restores the latest server values',async()=>{
 const f=profileDocument(),wait=deferred();let saves=0;
 const page=mountProfile({document:f.document,current:()=>true,validatedUser:{id:A},api:{load:async()=>({ok:true,profile:row()}),save:()=>++saves===1?Promise.resolve({ok:false,error:{code:'username_conflict'}}):wait.promise}});await page.ready;
 const fields=f.mounts[0].fields;await fields['#profileAccountEdit'].emit('click');fields['#profileUsername'].value='Taken';await fields.form.emit('submit');
 assert.equal(fields.form.hidden,false);assert.equal(fields['#profileUsername'].value,'Taken');assert.match(fields['#profileStatus'].textContent,/kullanılıyor/);assert.equal(fields['#profileReadUsername'].textContent,'Canonical');
 fields['#profileUsername'].value='ServerName';const pending=fields.form.emit('submit');assert.equal(fields['#profileCancel'].disabled,true);await fields['#profileCancel'].emit('click');assert.equal(fields.form.hidden,false);
 wait.resolve({ok:true,profile:{...row(),username:'ServerName',display_name:'New persisted'}});await pending;assert.equal(fields.form.hidden,true);assert.equal(fields['#profileReadUsername'].textContent,'ServerName');
 await fields['#profileEdit'].emit('click');fields['#profileDisplayName'].value='Discard';await fields['#profileCancel'].emit('click');assert.equal(fields['#profileDisplayName'].value,'New persisted');assert.equal(saves,2);page.dispose();
});

test('profile hero uses real name/email, initials and existing editor; save refreshes identity',async()=>{
 assert.equal(profileInitials('Enes Ünal'),'EU');assert.equal(profileInitials('  İpek  Çelik '),'IC');assert.equal(profileInitials('Ali'),'A');assert.equal(profileInitials(''),'TS');assert.equal(profileInitials(null),'TS');
 const f=profileDocument(),page=mountProfile({document:f.document,current:()=>true,validatedUser:{id:A,email:'member@example.test'},api:{load:async()=>({ok:true,profile:row()}),save:async()=>({ok:true,profile:{...row(),display_name:'Enes Ünal'}})}});await page.ready;
 const fields=f.mounts[0].fields;assert.equal(fields['#profileName'].textContent,'Görünen ad');assert.equal(fields['#profileInitials'].textContent,'GA');
 await fields['#profileEdit'].emit('click');assert(fields['#profileAccount'].scrolled);assert(fields['#profileDisplayName'].focused);
 await fields.form.emit('submit');assert.equal(fields['#profileName'].textContent,'Enes Ünal');assert.equal(fields['#profileInitials'].textContent,'EU');page.dispose();
});

test('profile workspace shows service counts, newest rows, safe titles and meaningful project links',async()=>{
 const f=profileDocument(),wait=deferred();let calls=0;
 const page=mountProfile({document:f.document,current:()=>true,validatedUser:{id:A,email:'real@example.test'},api:{load:async()=>({ok:true,profile:null})},projects:{getWorkspaceSummary:()=>{calls++;return wait.promise;}}});
 const fields=f.mounts[0].fields;assert(fields['#profileStats'].hidden);assert(fields['#profileEmpty'].hidden);assert.match(fields['#profileProjectsStatus'].textContent,/yükleniyor/);
 const older={id:A,title:'Eski',studio_mode:'free',updated_at:'2026-09-20T10:00:00Z'},newer={id:B,title:'<img src=x>',studio_mode:'match',updated_at:'2026-10-01T11:00:00Z'};
 wait.resolve({ok:true,counts:{total:37,free:25,match:12},projects:[older,newer]});await page.ready;
 assert.equal(calls,1);assert.equal(fields['#profileName'].textContent,'real@example.test');assert.equal(fields['#profileInitials'].textContent,'TS');
 assert.equal(fields['#profileCountTotal'].textContent,'37');assert.equal(fields['#profileCountFree'].textContent,'25');assert.equal(fields['#profileCountMatch'].textContent,'12');
 assert.equal(fields['#profileStats'].hidden,false);assert.equal(fields['#profileEmpty'].hidden,true);
 const item=fields['#profileRecent'].children[0];assert.equal(item.children[0].children[0].textContent,'<img src=x>');assert.equal(item.children[0].children[1].textContent,'Maç çalışması');assert.equal(item.children[2].href,'/mac-studyosu?project='+B);assert.equal(item.children[2].attrs['aria-label'],'<img src=x> çalışmasını aç');assert.equal(item.children[1].attrs.datetime,'2026-10-01T11:00:00.000Z');page.dispose();
});

test('projects error is independent of editing, retry distinguishes empty from failure and prevents duplicate fetches',async()=>{
 const f=profileDocument(),wait=deferred();let calls=0;
 const page=mountProfile({document:f.document,current:()=>true,validatedUser:{id:A},api:{load:async()=>({ok:true,profile:row()})},projects:{getWorkspaceSummary:()=>++calls===1?Promise.resolve({ok:false,error:{message:'private SQL'}}):wait.promise}});await page.ready;
 const fields=f.mounts[0].fields;assert.equal(fields.form.hidden,true);await fields['#profileEdit'].emit('click');assert.equal(fields.form.hidden,false);assert(fields['#profileStats'].hidden);assert(fields['#profileEmpty'].hidden);assert.equal(fields['#profileProjectsRetry'].hidden,false);assert.doesNotMatch(fields['#profileProjectsStatus'].textContent,/private/);
 const pending=fields['#profileProjectsRetry'].emit('click');await fields['#profileProjectsRetry'].emit('click');assert.equal(calls,2);
 wait.resolve({ok:true,projects:[],counts:{total:0,free:0,match:0}});await pending;assert.equal(fields['#profileEmpty'].hidden,false);assert.equal(fields['#profileCountTotal'].textContent,'0');page.dispose();
});

test('late workspace results cannot repopulate disposed or changed-account profile; logout delegates once',async()=>{
 for(const dispose of [false,true]){
  const f=profileDocument(),wait=deferred();let current=true,signouts=0;
  const page=mountProfile({document:f.document,current:()=>current,validatedUser:{id:A},api:{load:async()=>({ok:true,profile:row()})},projects:{getWorkspaceSummary:()=>wait.promise},onSignOut:()=>{signouts++;}});
  const fields=f.mounts[0].fields;await fields['#profileSignOut'].emit('click');assert.equal(signouts,1);
  if(dispose)page.dispose();else current=false;
  wait.resolve({ok:true,projects:[],counts:{total:9,free:9,match:0}});await page.ready;assert.equal(fields['#profileCountTotal'].textContent,'');await fields['#profileSignOut'].emit('click');assert.equal(signouts,1);page.dispose();
 }
});

test('profile form stays hidden during load; safe text/value rendering and canonical save, double submit blocked',async()=>{
  const f=profileDocument(),wait=deferred(),saved=deferred(),calls=[];
  const api={load:()=>wait.promise,save:input=>{calls.push(input);return saved.promise;}};
  const page=mountProfile({document:f.document,api,validatedUser:{id:A,email:'<img src=x>'},current:()=>true});
  const fields=f.mounts[0].fields;
  assert.equal(fields.form.hidden,true);assert.equal(fields.form.inert,true);
  wait.resolve({ok:true,profile:{...row(),display_name:'<script>test</script>'}});await page.ready;
  assert.equal(fields.form.hidden,true);assert.equal(fields.form.inert,true);assert.equal(fields['#profileReadOnly'].hidden,false);assert.equal(fields['#profileReadDisplayName'].textContent,'<script>test</script>');
  await fields.form.emit('submit');assert.equal(calls.length,0);await fields['#profileEdit'].emit('click');assert.equal(fields.form.hidden,false);assert.equal(fields['#profileDisplayName'].value,'<script>test</script>');
  assert.equal(fields['#profileEmail'].textContent,'<img src=x>');
  fields['#profileUsername'].value=' New ';fields['#profileDisplayName'].value=' Name ';
  const pending=fields.form.emit('submit');await fields.form.emit('submit');
  assert.deepEqual(calls,[{username:' New ',display_name:' Name '}]);assert.equal(fields['#profileSave'].disabled,true);
  saved.resolve({ok:true,profile:{...row(),username:'New',display_name:'Name'}});await pending;
  assert.equal(fields['#profileUsername'].value,'New');assert.equal(fields['#profileStatus'].textContent,'Profilin güncellendi.');
  assert.equal(fields['#profileSave'].disabled,false);assert.equal(fields.form.hidden,true);assert.equal(fields['#profileReadUsername'].textContent,'New');assert.equal(fields['#profileReadDisplayName'].textContent,'Name');page.dispose();assert.equal(f.root.children.length,0);assert.equal(fields.form.listeners.size,0);
});

test('missing profile stays editable; conflict/generic errors are safe; load error offers retry without save',async()=>{
  const f=profileDocument();let loaded=false,error='username_conflict',saves=0;
  const api={load:async()=>loaded?{ok:true,profile:null}:{ok:false,error:{message:'private SQL'}},save:async()=>{saves++;return {ok:false,error:{code:error,message:'private SQL',details:'private'}};}};
  const page=mountProfile({document:f.document,api,validatedUser:{id:A},current:()=>true});await page.ready;
  const fields=f.mounts[0].fields;
  assert.equal(fields.form.hidden,true);assert.equal(fields['#profileRetry'].hidden,false);await fields.form.emit('submit');assert.equal(saves,0);
  loaded=true;await fields['#profileRetry'].emit('click');assert.equal(fields.form.hidden,true);assert.match(fields['#profileStatus'].textContent,/tamamlamak/);await fields['#profileAccountEdit'].emit('click');assert.equal(fields.form.hidden,false);
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
  const db=profileClient(c=>{requests.push(c);return c.columns===preferenceColumns?{error:{code:'42703'}}:f.handler(c);});
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
    if(operation==='save'){await a['#profileEdit'].emit('click');a['#profileUsername'].value='AliceNew';pending=a.form.emit('submit');await tick();}
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
  await fields['#profileAccountEdit'].emit('click');const pending=fields.form.emit('submit');await tick();await fields['#profileSignOut'].emit('click');
  assert.equal(f.root.children.length,0);assert.equal(f.nodes.protectedContent.hidden,true);
  wait.resolve({data:row()});await pending;await tick();assert.equal(f.root.children.length,0);assert.equal(f.navigations.at(-1),'/giris.html');page.dispose();
});

test('profile markup has accessible labels, status, keyboard submit and no extra scripts or forbidden edits',()=>{
  const html=readFileSync(new URL('../dist/profil.html',import.meta.url),'utf8');
  for(const id of ['profileUsername','profileDisplayName'])assert.match(html,new RegExp('label for="'+id+'"'));
  assert.match(html,/<form id="profileEditForm" hidden inert novalidate>/);assert.match(html,/type="submit"/);assert.match(html,/role="status" aria-live="polite"/);
  assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]),['theme.js','backend.js']);
  assert.doesNotMatch(html,/avatar_url|type="password"|type="email"/);
  const ui=readFileSync(new URL('../src/lib/profile-ui.js',import.meta.url),'utf8');assert.doesNotMatch(ui,/innerHTML|localStorage|sessionStorage/);
  const api=readFileSync(new URL('../src/lib/profile-api.js',import.meta.url),'utf8');assert.doesNotMatch(api,/\.upsert\(|\.updateUser\(|\.eq\('username'/);
  assert.match(html,/href="\/calismalarim">Tüm çalışmalarımı gör/);assert.match(html,/href="\/haftanin-ilk-11i">İlk 11 Oluştur/);
  assert.match(html,/id="profileInitials"[^>]+aria-hidden="true"/);assert.doesNotMatch(html,/profile-quick|Çalışma kısayolları|Yeni stüdyo çalışması/);
  assert.match(html,/href="\/studyo.html">Taktik Tahtasını Aç/);assert.match(html,/href="\/mac-studyosu">Maç Stüdyosunu Aç/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.doesNotMatch(html,/subscription|weekly_xi_history|favorite_team|profileFavorite|profile-favorite|FUTBOL TERCİHİ|Yakında/);
});


test('hero prefers display name then username; verified email occurs once even for the final fallback',async()=>{
 const email='member@example.test';
 for(const [profile,title,avatar] of [
  [{...row(),display_name:'cuhara'},'cuhara','C'],
  [{...row(),display_name:null,username:'cuhara'},'cuhara','C'],
  [{...row(),display_name:'   ',username:'cuhara'},'cuhara','C'],
  [null,email,'TS'],
  [{...row(),display_name:email},email,'M'],
 ]){
  const f=profileDocument(),page=mountProfile({document:f.document,validatedUser:{id:A,email},current:()=>true,api:{load:async()=>({ok:true,profile})}});await page.ready;
  const fields=f.mounts[0].fields,name=fields['#profileName'],subtitle=fields['#profileEmail'];
  assert.equal(name.textContent,title);assert.equal(fields['#profileInitials'].textContent,avatar);
  assert.equal([name,subtitle].filter(n=>!n.hidden&&n.textContent===email).length,1);
  if(title!==email){assert.equal(subtitle.hidden,false);assert.equal(subtitle.textContent,email);}else{assert.equal(subtitle.hidden,true);assert.equal(subtitle.textContent,'');}
  assert.equal(fields['#profileEdit'].disabled,false);await fields['#profileEdit'].emit('click');assert.equal(fields.form.hidden,false);await fields['#profileCancel'].emit('click');assert.equal(fields['#profileReadOnly'].hidden,false);page.dispose();
 }
});

test('canonical mode reads empty account projects and edits profile through Auth client despite unavailable catalogue',async()=>{
 const f=routeFixture(),localTables=[];let teamRequests=0;
 f.handler=c=>c.table==='studio_projects'?(c.options?.head?{data:null,count:0}:{data:[]}):{data:row()};
 f.options.backend.catalogue={canonical:true,dataClient:{from(table){localTables.push(table);throw Error('Local data unavailable');}},loadTeams(){teamRequests++;throw Error('No team request allowed');}};
 const page=startPage(f.options);await page.ready;await tick();
 const fields=f.mounts[0].fields;assert.equal(fields['#profileName'].textContent,'Görünen ad');assert.equal(fields['#profileStatus'].textContent,'');assert.equal(fields['#profileEdit'].disabled,false);
 assert.equal(teamRequests,0);assert.deepEqual(localTables,[]);
 assert.equal(fields['#profileEmpty'].hidden,false);assert.equal(fields['#profileCountTotal'].textContent,'0');
 const projectReads=f.requests.filter(c=>c.table==='studio_projects');assert.equal(projectReads.length,3);
 assert.equal(projectReads.filter(c=>c.options?.head&&c.options.count==='exact').length,2);
 assert(projectReads.every(c=>!c.columns.split(',').includes('snapshot')&&!c.columns.split(',').includes('mode')));
 await fields['#profileEdit'].emit('click');fields['#profileDisplayName'].value='Saved Name';
 f.handler=c=>({data:c.kind==='update'?{...row(),...c.values}:row()});
 await fields.form.emit('submit');assert.equal(fields['#profileName'].textContent,'Saved Name');assert.equal(fields.form.hidden,true);assert.equal(fields['#profileReadOnly'].hidden,false);
 assert(f.requests.some(c=>c.kind==='update'));assert.equal(f.requests.filter(c=>c.columns===preferenceColumns).length,1);for(const c of f.requests.filter(c=>c.table==='profiles'&&c.columns!==preferenceColumns))assert.equal(c.columns,'id,username,display_name,created_at,updated_at');assert.equal(teamRequests,0);page.dispose();
});
