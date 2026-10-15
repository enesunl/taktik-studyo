import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consumeOAuthReturn,isOAuthReturn} from '../src/lib/auth-validation.js';
import {rememberOAuthNext,takeOAuthNext,OAUTH_NEXT_KEY} from '../src/lib/auth-redirects.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {mountTurnstile} from '../src/lib/turnstile.js';
import {fixture,pageFixture,element,user,session,id} from './helpers/auth-fixture.mjs';

// SEC2.2 Google OAuth through the existing Supabase Auth client (PKCE) and auth-callback page.
const callbackUrl='https://taktikstudyo.com/auth-callback.html';
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};};
function oauthClient(f,{exchange=null}={}){
  f.oauth=[];f.exchanged=[];f.signOuts=[];
  f.client.auth.signInWithOAuth=async args=>{f.oauth.push(args);return {data:{url:'https://accounts.google.test'},error:null};};
  f.client.auth.exchangeCodeForSession=async code=>{f.exchanged.push(code);const next=exchange??session;f.emit('SIGNED_IN',next);return {data:{session:next,user:next.user},error:null};};
  f.client.auth.signOut=async args=>{f.signOuts.push(args);f.emit('SIGNED_OUT',null);return {error:null};};
  return f;
}

test('callback return parsing: code only, cancelled and failed errors, URL cleaned first',()=>{
  const history=[];const loc=search=>({search,pathname:'/auth-callback.html'});const h={replaceState:(...a)=>history.push(a)};
  assert.equal(isOAuthReturn('?code=abc'),true);assert.equal(isOAuthReturn('?token_hash=x&type=email'),false);
  assert.deepEqual(consumeOAuthReturn(loc('?code=abc-123'),h),{ok:true,code:'abc-123'});
  assert.deepEqual(consumeOAuthReturn(loc('?error=access_denied&error_description=x'),h),{ok:false,error:{code:'oauth_cancelled'}});
  assert.deepEqual(consumeOAuthReturn(loc('?error=server_error'),h),{ok:false,error:{code:'oauth_failed'}});
  for(const bad of ['?code=a&next=/x','?code=a&code=b','?code=a%20b'])assert.equal(consumeOAuthReturn(loc(bad),h).ok,false,bad);
  assert(history.every(args=>args[2]==='/auth-callback.html'));
});

test('post-Google destination is allowlisted and read once',()=>{
  const s=memory();rememberOAuthNext(s,'/maclar.html');assert.equal(s.data.get(OAUTH_NEXT_KEY),'/maclar.html');
  assert.equal(takeOAuthNext(s),'/maclar.html');assert.equal(s.data.has(OAUTH_NEXT_KEY),false);assert.equal(takeOAuthNext(s),'/studyo.html');
  rememberOAuthNext(s,'https://evil.test/');assert.equal(takeOAuthNext(s),'/studyo.html');
  s.setItem(OAUTH_NEXT_KEY,'//evil.test');assert.equal(takeOAuthNext(s),'/studyo.html');assert.equal(takeOAuthNext(null),'/studyo.html');
});

test('session layer: Google sign-in only without a session, default scopes, allowlisted callback; reauth only with one',async()=>{
  const f=oauthClient(fixture());
  assert.equal((await f.auth.startOAuth({redirectTo:'https://evil.test/cb'})).error.code,'invalid_form');
  assert.equal((await f.auth.startOAuth({redirectTo:callbackUrl,reauthenticate:true})).error.code,'unauthenticated');
  assert.equal((await f.auth.startOAuth({redirectTo:callbackUrl})).ok,true);
  assert.deepEqual(f.oauth,[{provider:'google',options:{redirectTo:callbackUrl}}],'no extra scopes requested');
  const signed=oauthClient(fixture({initial:session}));
  assert.equal((await signed.auth.startOAuth({redirectTo:callbackUrl})).error.code,'existing_session');
  assert.equal((await signed.auth.startOAuth({redirectTo:callbackUrl,reauthenticate:true})).ok,true);
  assert.deepEqual(signed.oauth[0].options.queryParams,{prompt:'select_account'});
});

test('session layer: code exchange signs in; reauthentication keeps the same account; another account is signed out',async()=>{
  const f=oauthClient(fixture());const r=await f.auth.exchangeOAuthCode('pkce-code');
  assert.equal(r.ok,true);assert.equal(f.auth.getCurrentUser().id,id);assert.deepEqual(f.exchanged,['pkce-code']);
  assert.equal((await f.auth.exchangeOAuthCode('bad code')).error.code,'oauth_failed');
  const same=oauthClient(fixture({initial:session}));assert.equal((await same.auth.exchangeOAuthCode('c')).ok,true);assert.deepEqual(same.signOuts,[]);
  const otherUser={...user,id:'22222222-2222-4222-8222-222222222222'};
  const other=oauthClient(fixture({initial:session}),{exchange:{...session,user:otherUser}});
  other.userResult={data:{user:otherUser},error:null};
  const changed=await other.auth.exchangeOAuthCode('c');
  assert.equal(changed.error.code,'account_changed');assert.deepEqual(other.signOuts,[{scope:'local'}]);assert.equal(other.auth.getCurrentUser(),null);
});

test('page API: Google appears only when Auth settings enable it; completion bootstraps like e-mail sign-in',async()=>{
  const f=oauthClient(fixture());
  for(const [settings,expected] of [[{external:{google:true}},true],[{external:{google:false}},false],[null,false]]){
    const api=createAuthPageApi({auth:f.auth,client:f.client,origin:'https://taktikstudyo.com',providerSettings:async()=>settings});
    assert.equal(await api.googleAvailable(),expected);
  }
  assert.equal(await createAuthPageApi({auth:f.auth,client:f.client,origin:'https://taktikstudyo.com',providerSettings:async()=>{throw Error('offline');}}).googleAvailable(),false);
  assert.equal((await createAuthPageApi({auth:f.auth,client:f.client,origin:'https://evil.test'}).startGoogle()).error.code,'callback_origin_not_allowed');
  const result=await f.api.completeOAuth('code-1');
  assert.equal(result.ok,true);assert.equal(result.userId,id);assert.equal(result.profile.status,'ready');
});

function googlePage(page='login',search='',{available=true,start}={}){
  const f=pageFixture(page,search),storage=memory();
  f.fields.oauthActions=element();f.fields.oauthActions.hidden=true;f.fields.googleAuth=element();f.fields.googleAuth.disabled=true;
  f.api.googleAvailable=async()=>available;
  f.api.startGoogle=start??(async()=>{f.calls.push({kind:'google'});return {ok:true};});
  f.api.completeOAuth=async code=>{f.calls.push({kind:'oauth',code});f.state={status:'signed_in',user};return {ok:true,userId:id,profile:{status:'profile_incomplete'}};};
  f.options.storage=storage;f.storage=storage;return f;
}
const settle=()=>new Promise(r=>setTimeout(r,0));

test('login page: Google button only when enabled; it stores the destination and starts the redirect',async()=>{
  const off=googlePage('login','',{available:false});const p0=mountAuthPage(off.options);await p0.ready;await settle();
  assert.equal(off.fields.oauthActions.hidden,true);p0.dispose();
  const f=googlePage('login','?next=/maclar.html');const page=mountAuthPage(f.options);await page.ready;await settle();
  assert.equal(f.fields.oauthActions.hidden,false);assert.equal(f.fields.googleAuth.disabled,false);
  await f.fields.googleAuth.emit('click');
  assert.deepEqual(f.calls,[{kind:'google'}]);assert.equal(f.storage.data.get('taktik:oauth:next'),'/maclar.html');
  assert.match(f.fields.authMessage.textContent,/Google/);page.dispose();
  const failing=googlePage('register','',{start:async()=>({ok:false,error:{code:'oauth_unavailable'}})});const p2=mountAuthPage(failing.options);await p2.ready;await settle();
  await failing.fields.googleAuth.emit('click');assert.match(failing.fields.authMessage.textContent,/şu anda kullanılamıyor/);
  assert.equal(failing.fields.googleAuth.disabled,false);assert.equal(failing.fields.authSubmit.disabled,false);p2.dispose();
});

test('callback page: Google return completes without a click and continues to the stored page; errors are explained',async()=>{
  const f=googlePage('callback','?code=pkce-code');f.storage.setItem('taktik:oauth:next','/profil.html');
  const page=mountAuthPage(f.options);assert.deepEqual(f.historyCalls,[[null,'','/auth-callback.html']]);await page.ready;
  assert.deepEqual(f.calls,[{kind:'oauth',code:'pkce-code'},{kind:'replace',url:'/profil.html'}]);assert.equal(f.storage.data.size,0);page.dispose();
  const cancelled=googlePage('callback','?error=access_denied');const p2=mountAuthPage(cancelled.options);await p2.ready;
  assert.deepEqual(cancelled.calls,[]);assert.match(cancelled.fields.authMessage.textContent,/iptal/);p2.dispose();
  const changed=googlePage('callback','?code=c');changed.api.completeOAuth=async()=>({ok:false,error:{code:'account_changed'}});
  const p3=mountAuthPage(changed.options);await p3.ready;assert.match(changed.fields.authMessage.textContent,/oturum kapatıldı/);p3.dispose();
});

test('Auth Turnstile: token required when configured, sent once, widget reset after every attempt',async()=>{
  const rendered=[];let resets=0;
  const fake={render(host,options){rendered.push(options);return 'w1';},reset(){resets++;},remove(){}};
  const host={};let token='';const w=mountTurnstile({host,siteKey:'site-key-123456',action:'login',onChange:t=>{token=t;},load:async()=>fake});
  await w.ready;assert.equal(rendered[0].action,'login');assert.equal(w.token(),'');
  rendered[0].callback('tok-1');assert.equal(w.token(),'tok-1');assert.equal(token,'tok-1');
  rendered[0]['expired-callback']();assert.equal(w.token(),'');
  rendered[0].callback('tok-2');w.reset();assert.equal(w.token(),'');assert.equal(resets,1);w.dispose();
  // Login form: the token rides along with the credentials only when present.
  globalThis.window={turnstile:fake};globalThis.document={createElement:()=>({}),head:{append(){}}};
  try{
    const f=pageFixture('login','');f.fields.authSubmit.before=()=>{};f.options.document.createElement=()=>({});f.options.captchaSiteKey='site-key-123456';
    const page=mountAuthPage(f.options);await page.ready;await settle();
    await f.fields.authForm.emit('submit');assert.equal(f.calls.length,0);assert.match(f.fields.authMessage.textContent,/güvenlik doğrulamasını/);
    rendered.at(-1).callback('tok-3');await f.fields.authForm.emit('submit');
    assert.equal(f.calls[0].args.captchaToken,'tok-3');page.dispose();
  }finally{delete globalThis.window;delete globalThis.document;}
});

test('Google markup is hidden by default on login and register; no client secret in the bundle sources',()=>{
  for(const page of ['giris','kayit']){
    const html=readFileSync(new URL(`../dist/${page}.html`,import.meta.url),'utf8');
    assert.match(html,/<div id="oauthActions" class="oauth-actions" hidden>/);assert.match(html,/<button id="googleAuth" type="button" class="oauth-google" disabled>/);
  }
  for(const file of ['auth-session.js','auth-page-api.js','auth-ui.js','supabase.js'])
    assert.doesNotMatch(readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8'),/client_secret|GOOGLE_SECRET|GOCSPX/i);
  assert.match(readFileSync(new URL('../src/lib/supabase.js',import.meta.url),'utf8'),/flowType:'pkce'/);
});
