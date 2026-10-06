import test from 'node:test';
import assert from 'node:assert/strict';
import {startPage} from '../src/lib/page-bootstrap.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {loginDestination} from '../src/lib/auth-redirects.js';
import {preferenceColumns} from '../src/lib/profile-preferences.js';
import {A,B,row,ProfileNode,profileDocument,profileClient,deferred,tick} from './helpers/profile-fixture.mjs';
function fixture({path='/profil.html',status='signed_in',complete=false,schema=true}={}){
 let state={status,user:status==='signed_out'?null:{id:A}},validations=0;
 const listeners=new Set(),invalidators=new Set();
 const nodes=Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut'].map(id=>[id,new ProfileNode()]));
 const dom=profileDocument({getElementById:id=>nodes[id]}),window=new ProfileNode(),navigation=[];
 Object.assign(window,{location:{pathname:path,search:'',replace:url=>navigation.push(url)}});
 Object.defineProperty(window,'localStorage',{get(){throw Error('Onboarding/profile must not access draft storage');}});
 const f={...dom,nodes,window,navigation,read:null};
 const db=profileClient(c=>{
  if(c.columns===preferenceColumns){if(f.read)return f.read(c);return schema?{data:{id:c.filters[0][1],favorite_team_slug:null,onboarding_completed_at:complete?'2026-10-05T00:00:00Z':null,onboarding_version:complete?1:0}}:{error:{code:'42703'}};}
  return {data:row(c.filters[0]?.[1]||A)};
 });
 const auth={getState:()=>state,initialize:async()=>({ok:true}),validateUser:async()=>{validations++;return {ok:true,user:{id:state.user.id,email:'verified@example.test'}};},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},onInvalidate(fn){invalidators.add(fn);return()=>invalidators.delete(fn);},
  signOut:async()=>{f.switch(null);return {ok:true};}};
 f.switch=id=>{state={status:id?'signed_in':'signed_out',user:id?{id}:null};for(const fn of invalidators)fn();for(const fn of listeners)fn();};
 f.options={auth,client:db.client,window,document:dom.document,backend:{loadCatalogue(){throw Error('No catalogue allowed');}}};f.calls=db.calls;f.currentId=()=>state.user?.id;f.validations=()=>validations;return f;
}

test('authenticated catalogue failure renders page-data copy with retry, without relabeling Auth',async()=>{
 const f=fixture({path:'/haftanin-ilk-11i',complete:true});
 const page=startPage(f.options);await page.ready;
 assert.equal(f.validations(),1);assert.equal(f.currentId(),A);assert.equal(f.nodes.protectedContent.hidden,true);
 assert.equal(f.nodes.guardMessage.textContent,'Sayfa verileri şu anda yüklenemedi. Tekrar dene.');
 assert.equal(f.nodes.guardRetry.hidden,false);assert.deepEqual(f.navigation,[]);page.dispose();
});

test('welcome aliases are protected, login destination is allowlisted and unauthenticated/recovery behavior remains unchanged',async()=>{
 for(const path of ['/hos-geldin','/hos-geldin.html']){
  assert.deepEqual(resolvePage({pathname:path}),{kind:'protected',page:'onboarding',path:'/hos-geldin.html'});
  for(const status of ['signed_out','password_recovery']){
   const f=fixture({path,status}),page=startPage(f.options);await page.ready;assert.equal(f.validations(),0);assert.equal(f.calls.length,0);assert.equal(f.mounts.length,0);
   assert.equal(loginDestination(new URL(f.navigation[0],'https://example.test').search),'/hos-geldin.html');page.dispose();
  }
 }
});
test('incomplete verified user redirects before profile mount; completed/migrated user enters P1 and stays there on reload',async()=>{
 const fresh=fixture(),page=startPage(fresh.options);await page.ready;assert.deepEqual(fresh.navigation,['/hos-geldin?next=%2Fprofil.html']);assert.equal(fresh.mounts.length,0);assert.equal(fresh.nodes.protectedContent.hidden,true);page.dispose();
 for(let i=0;i<2;i++){
  const f=fixture({complete:true}),app=startPage(f.options);await app.ready;await tick();assert.equal(f.navigation.length,0);assert.equal(f.mounts.length,1);
  assert.equal(f.mounts[0].fields['#profileName'].textContent,'Görünen ad');assert.equal(f.mounts[0].fields['#profileEdit'].disabled,false);app.dispose();
 }
});
test('missing O1 schema keeps P1 usable, does not mark completion or write anything',async()=>{
 const f=fixture({schema:false}),page=startPage(f.options);await page.ready;await tick();assert.equal(f.navigation.length,0);assert.equal(f.mounts.length,1);
 assert.equal(f.mounts[0].fields['#profileStatus'].textContent,'');assert.equal(f.mounts[0].fields['#profileEdit'].disabled,false);assert(f.calls.every(c=>c.kind==='select'));page.dispose();
});
test('welcome reads O1 preferences, completed users bypass it and guard logout stays intact; callback/recovery have no interception',async()=>{
 for(const complete of [false,true]){
  const f=fixture({path:'/hos-geldin',complete}),page=startPage(f.options);await page.ready;await tick();assert.equal(f.nodes.protectedContent.hidden,false);assert.deepEqual(f.navigation,complete?['/studyo.html']:[]);assert.equal(f.calls.length,1);assert.equal(f.calls[0].columns,preferenceColumns);
  await f.nodes.signOut.emit('click');await tick();assert.deepEqual(f.navigation,complete?['/studyo.html','/giris.html']:['/giris.html']);assert.equal(f.nodes.protectedContent.hidden,true);assert.equal(f.nodes.protectedContent.children.length,0);page.dispose();
 }
 for(const path of ['/auth-callback.html','/sifre-yenile.html','/giris.html']){const f=fixture({path});assert.equal(startPage(f.options),undefined);assert.equal(f.calls.length,0);assert.equal(f.validations(),0);}
});
test('account switch while onboarding read is pending cannot redirect B from stale A result',async()=>{
 const f=fixture(),wait=deferred();f.read=c=>c.filters[0][1]===A?wait.promise:{data:{id:B,favorite_team_slug:null,onboarding_version:1,onboarding_completed_at:'2026-10-05T00:00:00Z'}};
 const page=startPage(f.options);await tick();f.switch(B);await tick();await tick();
 wait.resolve({data:{id:A,favorite_team_slug:null,onboarding_version:0,onboarding_completed_at:null}});await page.ready;
 assert.equal(f.navigation.length,0);assert.equal(f.mounts.length,1);assert.equal(f.currentId(),B);assert.equal(f.mounts[0].fields['#profileStatus'].textContent,'');page.dispose();
});
test('logout during onboarding read prevents its later navigation',async()=>{
 const f=fixture(),wait=deferred();f.read=()=>wait.promise;const page=startPage(f.options);await tick();await f.nodes.signOut.emit('click');await tick();
 wait.resolve({data:{id:A,favorite_team_slug:null,onboarding_version:0,onboarding_completed_at:null}});await page.ready;assert.deepEqual(f.navigation,['/giris.html']);assert.equal(f.mounts.length,0);page.dispose();
});

test('welcome account switch disposes A progress and starts B at step one without old writes',async()=>{
 const f=fixture({path:'/hos-geldin'}),page=startPage(f.options);await page.ready;await tick();
 const walk=(n=f.nodes.protectedContent)=>[n,...n.children.flatMap(walk)];
 const click=text=>walk().find(n=>n.tagName==='button'&&n.textContent===text).emit('click');
 await click('Başla →');assert.equal(walk().find(n=>n.tagName==='h1').textContent,'TAKTİĞİNİ\nSAHADA GÖSTER.');
 const staleSkip=walk().find(n=>n.textContent==='Atla');f.switch(B);await tick();await tick();
 assert.equal(walk().find(n=>n.tagName==='h1').textContent,"TAKTİK STÜDYO'YA\nHOŞ GELDİN.");
 await staleSkip.emit('click');assert.equal(f.currentId(),B);assert.equal(f.navigation.length,0);assert(f.calls.every(c=>c.kind==='select'));
 assert.deepEqual(f.calls.filter(c=>c.columns===preferenceColumns).map(c=>c.filters[0][1]),[A,B]);page.dispose();
});

test('welcome pending A completion-read result never navigates B or overwrites its onboarding',async()=>{
 const f=fixture({path:'/hos-geldin'}),wait=deferred();
 f.read=c=>c.filters[0][1]===A?wait.promise:{data:{id:B,favorite_team_slug:null,onboarding_version:0,onboarding_completed_at:null}};
 const page=startPage(f.options);await page.ready;await tick();f.switch(B);await tick();await tick();
 wait.resolve({data:{id:A,favorite_team_slug:null,onboarding_version:1,onboarding_completed_at:'2026-10-05T00:00:00Z'}});await tick();
 assert.equal(f.currentId(),B);assert.equal(f.navigation.length,0);
 assert.equal(f.nodes.protectedContent.children[0].textContent,'1 / 5');assert(f.calls.every(c=>c.kind==='select'));page.dispose();
});

test('O2 picker and membership share the configured canonical transport; completion writes only to Auth/Profile client',async()=>{
 const f=fixture({path:'/hos-geldin'});
 const create=f.options.document.createElement;
 f.options.document.createElement=tag=>Object.assign(create(tag),{style:{setProperty(){}}});
 const teams=profileClient(c=>{
  assert.equal(c.table,'catalogue_teams');assert.equal(c.kind,'select');
  return {data:c.columns==='id'?{id:'galatasaray'}:[{id:'galatasaray',display_name:'Galatasaray',short_name:'GS',color_primary:'#a51935',color_secondary:'#efb62a',sort_order:0,catalogue_active:true}]};
 });
 const from=teams.client.from;
 teams.client.from=table=>{const q=from(table);q.order=()=>q;q.limit=()=>q;return q;};
 f.options.backend.catalogue={canonical:true,dataClient:teams.client};
 f.read=c=>({data:{id:A,favorite_team_slug:c.values?.favorite_team_slug??null,onboarding_version:c.kind==='update'?1:0,onboarding_completed_at:c.kind==='update'?'2026-10-05T00:00:00Z':null}});
 const page=startPage(f.options);await page.ready;await tick();
 const walk=(n=f.nodes.protectedContent)=>[n,...n.children.flatMap(walk)];
 const click=async text=>{await walk().find(n=>n.tagName==='button'&&n.textContent===text).emit('click');await tick();};
 await click('Başla →');for(let i=0;i<3;i++)await click('Devam →');
 await walk().find(n=>n.tagName==='input'&&n.value==='galatasaray').emit('change');
 await click("Taktik Stüdyo'ya Başla →");
 assert.deepEqual(f.navigation,['/studyo.html']);assert.equal(teams.calls.length,2);
 assert.deepEqual(teams.calls[1].filters,[['id','galatasaray'],['catalogue_active',true]]);
 assert(f.calls.every(c=>c.table==='profiles'));
 assert.deepEqual(f.calls.filter(c=>c.kind==='update').map(c=>c.values),[{favorite_team_slug:'galatasaray',onboarding_version:1}]);
 page.dispose();
});
