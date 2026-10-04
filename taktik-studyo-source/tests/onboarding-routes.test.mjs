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
test('welcome route never redirects itself and keeps guard logout; callback/recovery have no onboarding interception',async()=>{
 for(const complete of [false,true]){
  const f=fixture({path:'/hos-geldin',complete}),page=startPage(f.options);await page.ready;assert.equal(f.nodes.protectedContent.hidden,false);assert.equal(f.navigation.length,0);assert.equal(f.calls.length,0);
  await f.nodes.signOut.emit('click');await tick();assert.deepEqual(f.navigation,['/giris.html']);assert.equal(f.nodes.protectedContent.hidden,true);page.dispose();
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
