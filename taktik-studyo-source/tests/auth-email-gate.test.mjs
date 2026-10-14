import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthApiError,createClient} from '@supabase/supabase-js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {fixture,pageFixture,user,session,credentials} from './helpers/auth-fixture.mjs';
import {ProfileNode,profileDocument,deferred,tick} from './helpers/profile-fixture.mjs';
import {loginUrl} from '../src/lib/auth-redirects.js';

const unconfirmed={...user,email_confirmed_at:undefined,confirmed_at:'2026-09-18',phone_confirmed_at:'2026-09-18',user_metadata:{email_verified:true,email_confirmed_at:'forged'}};
const B={...user,id:'22222222-2222-4222-8222-222222222222'};
const fail=code=>({ok:false,error:{code}});
function setup(initial=null) {
  const f=fixture({initial});f.logouts=[];
  f.client.auth.signOut=async options=>{f.logouts.push(options);f.emit('SIGNED_OUT',null);return {error:null};};
  return f;
}

test('password success with unconfirmed server user cleans locally, skips profile and never navigates',async()=>{
  const f=setup();f.userResult={data:{user:unconfirmed}};
  const form=pageFixture('login');form.options.api=f.api;const page=mountAuthPage(form.options);await page.ready;
  await form.fields.authForm.emit('submit');
  assert.deepEqual(f.logouts,[{scope:'local'}]);assert.equal(f.calls.getUser,1);
  assert.equal(f.calls.select.length,0);assert.equal(f.calls.insert.length,0);assert.equal(form.calls.length,0);
  assert.equal(f.auth.getState().status,'signed_out');assert.match(form.fields.authMessage.textContent,/E-posta adresini doğrulaman gerekiyor/);
  assert.equal(form.fields.authSubmit.disabled,false);page.dispose();f.auth.dispose();
});

test('SDK email_not_confirmed code is controlled, without inspecting raw message or bootstrapping',async()=>{
  const f=setup(),error=new AuthApiError('private',400,'email_not_confirmed');
  Object.defineProperty(error,'message',{get(){throw Error('must not inspect message');}});f.loginResult={error};
  assert.deepEqual(await f.api.signIn(credentials),fail('email_not_confirmed'));assert.equal(f.calls.getUser,0);assert.equal(f.logouts.length,0);
  const form=pageFixture('login');form.options.api=f.api;const page=mountAuthPage(form.options);await page.ready;await form.fields.authForm.emit('submit');
  assert.equal(form.calls.length,0);assert.match(form.fields.authMessage.textContent,/doğrulaman gerekiyor/);assert.equal(f.calls.select.length,0);
  page.dispose();f.auth.dispose();
});

test('server confirmation wins over local snapshot; metadata/confirmed_at/phone confirmation cannot substitute',async()=>{
  for(const confirmed of [false,true]){
    const f=setup({...session,user:confirmed?unconfirmed:user});f.userResult={data:{user:confirmed?user:unconfirmed}};
    const result=await f.auth.validateUser();
    if(confirmed){assert.equal(result.ok,true);assert.equal(result.user.emailConfirmedAt,user.email_confirmed_at);}
    else assert.deepEqual(result,fail('email_not_confirmed'));
    assert.equal(f.logouts.length,confirmed?0:1);f.auth.dispose();
  }
});

function route(f,path) {
  const nodes=Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut','legacyImport','studioRoot'].map(id=>[id,new ProfileNode()]));
  const calls={catalogue:0,board:0,storage:0,legacy:0,navigate:[]};
  const document=profileDocument({getElementById:id=>nodes[id],createElement(){calls.legacy++;throw Error('legacy must not mount');}});
  const window=Object.assign(new ProfileNode(),{location:{pathname:path,search:'',replace:url=>calls.navigate.push(url)},
    localStorage:{getItem(){calls.storage++;throw Error('draft must not load');}},
    TAKTIK_APP:{mountStudio(){calls.board++;}},TAKTIK_COMPARISON:{mount(){calls.board++;}}});
  const page=startPage({auth:f.auth,client:f.client,document:document.document,window,backend:{loadCatalogue(){calls.catalogue++;}}});
  return {page,calls,nodes,document};
}

test('all three protected routes block unconfirmed restore before profile/catalogue/scope/import/board',async()=>{
  for(const path of ['/studyo.html','/profil.html']){
    const f=setup(session);f.userResult={data:{user:unconfirmed}};const r=route(f,path);await r.page.ready;await tick();
    assert.deepEqual(r.calls,{catalogue:0,board:0,storage:0,legacy:0,navigate:[loginUrl(path)+'&reason=email_not_confirmed']});
    assert.equal(r.document.mounts.length,0);assert.equal(r.nodes.protectedContent.hidden,true);assert.equal(f.calls.select.length,0);
    assert.deepEqual(f.logouts,[{scope:'local'}]);r.page.dispose();f.auth.dispose();
  }
});

test('unconfirmed cleanup failure stays closed without redirect, including SDK SIGNED_OUT before failure',async()=>{
  for(const emits of [false,true])for(const throws of [false,true]){
    const f=setup(session);f.userResult={data:{user:unconfirmed}};
    f.client.auth.signOut=async()=>{if(emits)f.emit('SIGNED_OUT',null);await tick();if(throws)throw Error('private');return {error:new AuthApiError('private',500)};};
    const r=route(f,'/studyo.html');await r.page.ready;await tick();
    assert.equal(r.calls.board,0);assert.deepEqual(r.calls.navigate,[]);assert.equal(r.nodes.protectedContent.hidden,true);assert.equal(r.nodes.guardRetry.hidden,false);
    r.page.dispose();f.auth.dispose();
  }
});

test('A unconfirmed response after B event cannot sign out B, redirect B, or replace B profile',async()=>{
  const f=setup(session),wait=deferred();let first=true;
  f.client.auth.getUser=()=>first?(first=false,wait.promise):Promise.resolve({data:{user:B}});
  f.rows=[{data:{id:B.id,username:'Confirmed_B',display_name:null}}];
  const r=route(f,'/profil.html');await tick();f.emit('SIGNED_IN',{...session,user:B});
  wait.resolve({data:{user:unconfirmed}});await r.page.ready;await tick();await tick();
  assert.equal(f.logouts.length,0);assert.deepEqual(r.calls.navigate,[]);assert.equal(f.auth.getCurrentUser().id,B.id);
  assert.equal(r.document.mounts.at(-1).fields['#profileUsername'].value,'Confirmed_B');r.page.dispose();f.auth.dispose();
});

test('unconfirmed cleanup rechecks SDK replacement session before delayed cross-tab notification',async()=>{
  for(const notified of [false,true]){
    const f=setup(session);await f.auth.initialize();f.userResult={data:{user:unconfirmed}};
    f.client.auth.getSession=async()=>{if(notified)f.emit('SIGNED_IN',{...session,user:B});return {data:{session:{...session,user:B}}};};
    assert.deepEqual(await f.auth.validateUser(),fail('state_changed'));assert.equal(f.logouts.length,0);f.auth.dispose();
  }
});

test('login/callback keep returned identity pinned across the async validation initialization boundary',async()=>{
  for(const operation of ['signIn','verifyEmail']){
    const f=setup();await f.auth.initialize();
    const method=operation==='signIn'?'signInWithPassword':'verifyOtp';
    f.client.auth[method]=async()=>{
      f.emit('SIGNED_IN',session);
      // SDK result is accepted while A is current, but B arrives before the
      // awaited initialize inside validateUser resumes.
      queueMicrotask(()=>queueMicrotask(()=>f.emit('SIGNED_IN',{...session,user:B})));
      return {data:{user,session}};
    };
    f.userResult={data:{user:B}};
    assert.deepEqual(await f.api[operation](operation==='signIn'?credentials:'email-gate-test-token'),fail('state_changed'));
    assert.equal(f.logouts.length,0);assert.equal(f.calls.select.length,0);f.auth.dispose();
  }
});

test('callback needs confirmed same-id server result before success and bootstrap; sanitization remains synchronous',async()=>{
  for(const server of [user,unconfirmed,B]){
    const f=setup();f.userResult={data:{user:server}};const form=pageFixture('callback');form.options.api=f.api;
    const page=mountAuthPage(form.options);assert.deepEqual(form.historyCalls,[[null,'','/auth-callback.html']]);assert.equal(f.calls.verify.length,0);
    await page.ready;await form.fields.authSubmit.emit('click');
    if(server===user){assert.match(form.fields.authMessage.textContent,/E-posta adresin doğrulandı/);assert.equal(f.calls.select.length,1);}
    else {assert.doesNotMatch(form.fields.authMessage.textContent,/E-posta adresin doğrulandı/);assert.equal(f.calls.select.length,0);}
    assert.deepEqual(form.calls,server===user?[{kind:'replace',url:'/studyo.html'}]:[]);assert.equal(f.logouts.length,server===unconfirmed?1:0);page.dispose();f.auth.dispose();
  }
});

test('unexpected unconfirmed signup session is validated/cleaned but keeps generic confirmation-pending response',async()=>{
  const f=setup();f.userResult={data:{user:unconfirmed}};
  f.client.auth.signUp=async()=>{const s={...session,user:unconfirmed};f.emit('SIGNED_IN',s);return {data:{session:s,user:unconfirmed}};};
  assert.deepEqual(await f.api.signUp(credentials),{ok:true,status:'confirmation_pending'});
  assert.equal(f.auth.getState().status,'signed_out');assert.deepEqual(f.logouts,[{scope:'local'}]);assert.equal(f.calls.select.length,0);f.auth.dispose();
});

test('login reason accepts only a single fixed code, never echoes arbitrary query or changes safe next',async()=>{
  for(const [search,shown] of [['?reason=email_not_confirmed&next=/profil.html',true],['?reason=<img>',false],['?reason=email_not_confirmed&reason=email_not_confirmed',false]]){
    const f=pageFixture('login',search),page=mountAuthPage(f.options);await page.ready;
    assert.equal(f.fields.authMessage.textContent.includes('doğrulaman gerekiyor'),shown);assert.doesNotMatch(f.fields.authMessage.textContent,/<img>/);page.dispose();
  }
});

test('installed SDK password session + unconfirmed /user results in local logout, no profile REST and no persistent session',async()=>{
  const calls=[],store=new Map();
  const jwt=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'email_gate_fixture'].join('.');
  const client=createClient('https://email-gate.invalid','public-test-fixture',{auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'test:email-gate',storage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}},global:{fetch:async(input)=>{
    const url=new URL(input);calls.push(url.pathname);
    if(url.pathname.endsWith('/token'))return Response.json({access_token:jwt,refresh_token:'email_gate_refresh_fixture',expires_in:3600,token_type:'bearer',user:unconfirmed});
    if(url.pathname.endsWith('/user'))return Response.json(unconfirmed);
    if(url.pathname.endsWith('/logout')){assert.equal(url.searchParams.get('scope'),'local');return new Response(null,{status:204});}
    throw Error('No other network permitted');
  }}});
  const auth=createAuthSession(client),api=createAuthPageApi({auth,client,origin:'https://taktikstudyo.com'});
  try{
    assert.deepEqual(await api.signIn(credentials),fail('email_not_confirmed'));
    assert.deepEqual(calls,['/auth/v1/token','/auth/v1/user','/auth/v1/logout']);
    assert.equal((await client.auth.getSession()).data.session,null);assert.equal(store.has('test:email-gate'),false);assert.equal(auth.getState().status,'signed_out');
  }finally{auth.dispose();await client.auth.dispose();}
});
