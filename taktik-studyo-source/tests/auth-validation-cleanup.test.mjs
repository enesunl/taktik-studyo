import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createClient,AuthApiError,AuthSessionMissingError,AuthRetryableFetchError} from '@supabase/supabase-js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createProtectedPage} from '../src/lib/protected-page.js';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {fixture,pageFixture,user,session} from './helpers/auth-fixture.mjs';
import {loginUrl} from '../src/lib/auth-redirects.js';

const B={...user,id:'22222222-2222-4222-8222-222222222222'};
const tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function setup(error=null){
  const f=fixture({initial:session});const calls={logout:0,mount:0,show:[],navigate:[]};
  f.userResult={data:{user:error?null:user},error};
  f.client.auth.signOut=async options=>{calls.logout++;assert.deepEqual(options,{scope:'local'});f.emit('SIGNED_OUT',null);return{error:null};};
  const guard=createProtectedPage({auth:f.auth,storage:{getItem:()=>null},path:'/studyo.html',
    mount:()=>{calls.mount++;return()=>{};},show:s=>calls.show.push(s),navigate:url=>calls.navigate.push(url)});
  return Object.assign(f,{calls,guard,close(){guard.dispose();f.auth.dispose();}});
}

test('verified restored user mounts only after getUser succeeds',async()=>{
  const f=setup();await f.guard.start();assert.equal(f.calls.mount,1);assert.equal(f.calls.logout,0);assert.equal(f.auth.getState().status,'signed_in');f.close();
});

test('documented invalid session types/codes clean locally before safe login; raw messages are never inspected',async t=>{
  const errors=[new AuthSessionMissingError(),...['session_not_found','session_expired','bad_jwt','user_not_found','refresh_token_not_found','refresh_token_already_used']
    .map(code=>new AuthApiError('private',400,code))];
  for(const error of errors)await t.test(error.code||error.name,async()=>{
    Object.defineProperty(error,'message',{get(){throw Error('message matching forbidden');}});
    const f=setup(error);await f.guard.start();await tick();
    assert.equal(f.calls.mount,0);assert.equal(f.calls.logout,1);assert.deepEqual(f.calls.navigate,[loginUrl('/studyo.html')]);
    assert.equal(f.auth.getState().status,'signed_out');
    const form=pageFixture('login');form.options.api=f.api;const page=mountAuthPage(form.options);await page.ready;
    assert.equal(form.fields.authSubmit.disabled,false,'stale existing_session no longer blocks login');page.dispose();f.close();
  });
});

test('transient/unknown/status-only failures never logout or redirect and keep retry available',async t=>{
  const errors=[new AuthRetryableFetchError('timeout',0),new AuthRetryableFetchError('upstream',503),
    new AuthApiError('timeout',408,'request_timeout'),new AuthApiError('service',500,'unexpected_failure'),
    new AuthApiError('MFA',403,'insufficient_aal'),new AuthApiError('unknown',401,undefined),
    new AuthApiError('limit',429,'over_request_rate_limit'),{status:401},{status:403},
    {name:'Error',code:'session_expired',message:'untyped error is not server evidence'}];
  for(const [index,error] of errors.entries())await t.test(String(index),async()=>{
    const f=setup(error);await f.guard.start();await tick();assert.equal(f.calls.mount,0);assert.equal(f.calls.logout,0);
    assert.deepEqual(f.calls.navigate,[]);assert.equal(f.calls.show.at(-1),'error');assert.equal(f.auth.getCurrentUser().id,user.id);
    f.userResult={data:{user},error:null};await f.guard.retry();assert.equal(f.calls.mount,1);f.close();
  });
});

test('thrown timeout stays transient; valid existing login page remains blocked',async()=>{
  const f=setup();f.client.auth.getUser=async()=>{throw new DOMException('private','TimeoutError');};
  await f.guard.start();assert.equal(f.calls.logout,0);assert.equal(f.calls.show.at(-1),'error');
  const form=pageFixture('login');form.options.api=f.api;const page=mountAuthPage(form.options);await page.ready;
  assert.equal(form.fields.authSubmit.disabled,true);page.dispose();f.close();
});

test('A invalid result after B Auth event cannot clean B or apply a stale redirect',async()=>{
  const f=setup(),wait=deferred();let first=true;
  f.client.auth.getUser=()=>{if(first){first=false;return wait.promise;}return Promise.resolve({data:{user:B},error:null});};
  const pending=f.guard.start();await tick();f.emit('SIGNED_IN',{...session,user:B});
  wait.resolve({data:{user:null},error:new AuthApiError('private',400,'bad_jwt')});await pending;await tick();
  assert.equal(f.auth.getCurrentUser().id,B.id);assert.equal(f.calls.logout,0);assert.deepEqual(f.calls.navigate,[]);assert.equal(f.calls.mount,1);f.close();
});

test('cleanup rechecks public SDK identity and generation immediately before signOut',async()=>{
  for(const notified of [true,false]){
    const f=setup(new AuthApiError('private',400,'session_expired'));await f.auth.initialize();
    f.client.auth.getSession=async()=>{if(notified)f.emit('SIGNED_IN',{...session,user:B});return{data:{session:{...session,user:B}},error:null};};
    assert.deepEqual(await f.auth.validateUser(),{ok:false,error:{code:'state_changed'}});
    assert.equal(f.calls.logout,0);f.close();
  }
});

test('cleanup error cannot race SDK SIGNED_OUT into login redirect, even if SDK cleared storage',async()=>{
  for(const cleared of [false,true])for(const throws of [false,true]){
    const f=setup(new AuthApiError('private',400,'bad_jwt'));
    f.client.auth.signOut=async()=>{f.calls.logout++;if(cleared)f.emit('SIGNED_OUT',null);await tick();if(throws)throw Error('private');return{error:new AuthRetryableFetchError('offline',0)};};
    await f.guard.start();await tick();assert.equal(f.calls.logout,1);assert.deepEqual(f.calls.navigate,[]);
    assert.equal(f.calls.mount,0);assert.equal(f.calls.show.at(-1),'error');f.close();
  }
});

test('installed SDK missing-session self-cleanup and explicit local logout both lead to login without persistence loop',async()=>{
  for(const code of ['session_not_found','bad_jwt','session_expired']){
    const store=new Map(),calls=[];
    const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
    const jwt=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'phase6_test_signature'].join('.');
    const client=createClient('https://abcdefghijklmnopqrst.supabase.co','sb_publishable_test_fixture_only',{
      auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage,storageKey:'test:invalid-cleanup'},
      global:{fetch:async(input,options={})=>{
        const url=new URL(input);calls.push(url.pathname);
        if(url.pathname.endsWith('/token'))return Response.json({access_token:jwt,refresh_token:'phase6_test_refresh',expires_in:3600,token_type:'bearer',user});
        if(url.pathname.endsWith('/user'))return Response.json({code,message:'private'},{status:401,headers:{'x-supabase-api-version':'2024-01-01'}});
        if(url.pathname.endsWith('/logout')){assert.equal(url.searchParams.get('scope'),'local');return Response.json({code:'bad_jwt',message:'private'},{status:401,headers:{'x-supabase-api-version':'2024-01-01'}});}
        throw Error('Unexpected mock request');
      }},
    });
    const auth=createAuthSession(client),navigations=[],shows=[];
    const guard=createProtectedPage({auth,storage,path:'/studyo.html',mount(){throw Error('must not mount');},show:s=>shows.push(s),navigate:p=>navigations.push(p)});
    try{
      await client.auth.signInWithPassword({email:user.email,password:'fake local fixture'});assert.equal(store.has('test:invalid-cleanup'),true);
      await guard.start();await tick();assert.deepEqual(navigations,[loginUrl('/studyo.html')],JSON.stringify({code,shows,calls,state:auth.getState()}));assert.equal(store.has('test:invalid-cleanup'),false);
      assert.equal(auth.getState().status,'signed_out');assert.equal((await client.auth.getSession()).data.session,null);
      assert.equal(calls.filter(p=>p.endsWith('/logout')).length,code==='session_not_found'?0:1);
      const fresh=createAuthSession(client);await fresh.initialize();assert.equal(fresh.getCurrentUser(),null);fresh.dispose();
    }finally{guard.dispose();auth.dispose();await client.auth.dispose();}
  }
});

test('protected HTML labels contain the exact accessible Turkish spelling',()=>{
  for(const file of ['studyo','profil']){
    const html=readFileSync(new URL('../dist/'+file+'.html',import.meta.url),'utf8');
    assert.match(html,/aria-label="Oturum doğrulama"/);assert.doesNotMatch(html,/Oturum do\?rulama/);
  }
});
