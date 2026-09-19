import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createProfileApi,normalizeProfile} from '../src/lib/profile-api.js';
import {profileColumns} from '../src/lib/profile-bootstrap.js';
import {A,B,row,profileClient,deferred,tick} from './helpers/profile-fixture.mjs';

const make = (handler, current = () => true) => {
  const f = profileClient(handler);
  return {...f,api:createProfileApi({client:f.client,validatedUser:{id:A},current})};
};
const input = {username:' New_Name ',display_name:' Enes Ünal '};
const values = {username:'New_Name',display_name:'Enes Ünal'};
const err = code => ({ok:false,error:{code}});

test('profile normalization reuses ASCII username rules and SQL character length; rejects controls',()=>{
  for(const username of ['abc','Abc_123','a'.repeat(24),' abc ']) assert.ok(normalizeProfile({username,display_name:''}));
  for(const username of ['', 'ab','a'.repeat(25),'a b','enes.unal','enes-unal','enes/unal','İsim','abc😀','a\nb','abc\t'])
    assert.equal(normalizeProfile({username,display_name:''}),null,username);
  assert.deepEqual(normalizeProfile(input),values);
  for(const display_name of ['', '   '])assert.equal(normalizeProfile({username:'abc',display_name}).display_name,null);
  for(const display_name of ['A','x'.repeat(60),'😀'.repeat(60)])assert.ok(normalizeProfile({username:'abc',display_name}));
  for(const display_name of ['x'.repeat(61),'😀'.repeat(61),'A\nB','A\u0085B','A\u007fB'])assert.equal(normalizeProfile({username:'abc',display_name}),null);
});

test('load returns only explicit columns for validated own id; foreign rows and raw errors rejected',async()=>{
  const f=make(()=>({data:{...row(),avatar_url:'private',extra:'hidden'}}));
  assert.deepEqual(await f.api.load(),{ok:true,profile:row()});
  assert.deepEqual(f.calls,[{kind:'select',table:'profiles',filters:[['id',A]],columns:profileColumns,single:true}]);
  for(const [response,code] of [[{data:row(B)},'state_changed'],[{error:{message:'private SQL',hint:'private',details:'private'}},'profile_load_failed']])
    assert.deepEqual(await make(()=>response).api.load(),err(code));
});

test('existing profile UPDATE uses only editable columns and returns canonical fields without metadata update',async()=>{
  const f=make(call=>({data:call.kind==='update'?{...row(),...values}:row()}));
  const saved=await f.api.save({...input,id:B,avatar_url:'x',email:'x',role:'admin',updated_at:'x'});
  assert.deepEqual(saved,{ok:true,profile:{...row(),...values}});
  assert.deepEqual(f.calls.map(c=>c.kind),['select','update']);
  assert.deepEqual(f.calls[1],{kind:'update',table:'profiles',filters:[['id',A]],values,columns:profileColumns,single:true});
});

test('invalid/unauthenticated/stale input starts no request; save foreign response is rejected',async()=>{
  const f=make();assert.deepEqual(await f.api.save({username:'ab',display_name:''}),err('invalid_profile'));assert.equal(f.calls.length,0);
  assert.deepEqual(await make(undefined,()=>false).api.load(),err('state_changed'));
  assert.deepEqual(await createProfileApi({client:f.client,validatedUser:null,current:()=>true}).save(input),err('unauthenticated'));
  const g=make(c=>({data:c.kind==='update'?row(B):row()}));assert.deepEqual(await g.api.save(input),err('state_changed'));
  assert.deepEqual(await make(c=>({data:c.kind==='update'?null:row()})).api.save(input),err('profile_save_failed'));
});

test('missing profile reuses server-validated metadata bootstrap; canonical row wins over seed',async()=>{
  let exists=false;
  const f=make(c=>{if(c.kind==='insert'){exists=true;assert.deepEqual(c.values,{id:A,username:'SeedName'});return {error:null};}return {data:exists?row():null};});
  assert.deepEqual(await f.api.load(),{ok:true,profile:row()});
  assert.deepEqual(f.calls.map(c=>c.kind),['select','getUser','select','insert','select']);
});

test('incomplete bootstrap leaves missing profile recoverable via explicit own INSERT',async()=>{
  const f=make(c=>({data:c.kind==='insert'?{...row(),...values}:null}));
  f.client.auth.getUser=async()=>({data:{user:{id:A,email_confirmed_at:'yes',user_metadata:{username:'invalid seed!'}}}});
  assert.deepEqual(await f.api.load(),{ok:true,profile:null});
  assert.equal(f.calls.some(c=>c.kind==='insert'),false);
  assert.deepEqual(await f.api.save(input),{ok:true,profile:{...row(),...values}});
  assert.deepEqual(f.calls.at(-1),{kind:'insert',table:'profiles',filters:[],values:{id:A,...values},columns:profileColumns,single:true});
});

test('INSERT 23505 rereads only own id then applies requested UPDATE, or reports username conflict',async()=>{
  for(const appeared of [true,false]){
    let selects=0;
    const f=make(c=>c.kind==='select'?{data:++selects>1&&appeared?row():null}:c.kind==='insert'?{error:{code:'23505',message:'private'}}:{data:{...row(),...values}});
    const result=await f.api.save(input);
    assert.deepEqual(result,appeared?{ok:true,profile:{...row(),...values}}:err('username_conflict'));
    assert.deepEqual(f.calls.map(c=>c.kind),appeared?['select','insert','select','update']:['select','insert','select']);
    for(const c of f.calls.filter(c=>c.kind!=='insert'))assert.deepEqual(c.filters,[['id',A]]);
  }
});

test('case-insensitive uniqueness and DB/network failures expose only controlled codes',async()=>{
  for(const [error,code] of [[{code:'23505',message:'lower username private'},'username_conflict'],[{code:'42501',details:'private'},'profile_save_failed']]){
    const f=make(c=>c.kind==='select'?{data:row()}:{error});assert.deepEqual(await f.api.save(input),err(code));
  }
  const f=make(()=>{throw Error('private network');});assert.deepEqual(await f.api.save(input),err('profile_save_failed'));
  assert.deepEqual(await f.api.load(),err('profile_load_failed'));
});

test('account switch during load, before write or during save discards A results and never targets B',async()=>{
  for(const during of ['load','select','update']){
    let active=true;const wait=deferred();
    const f=make(c=>during==='update'&&c.kind==='select'?{data:row()}:wait.promise,()=>active);
    const pending=during==='load'?f.api.load():f.api.save(input);await tick();active=false;wait.resolve({data:row()});
    assert.deepEqual(await pending,err('state_changed'));
    assert.equal(f.calls.length,during==='update'?2:1);
    for(const c of f.calls)assert.deepEqual(c.filters,[['id',A]]);
  }
});

test('installed SDK generates exact own-row select/update/insert HTTP contracts (mock transport only)',async()=>{
  const requests=[];let exists=true;
  const client=createClient('https://profile-sdk.invalid','public-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
    const method=options.method||'GET';requests.push({url:new URL(url),method,body:options.body?JSON.parse(options.body):null});
    return new Response(JSON.stringify(method==='GET'&&!exists?[]:[row()]),{status:200,headers:{'Content-Type':'application/json'}});
  }}});
  const api=createProfileApi({client,validatedUser:{id:A},current:()=>true});
  assert.equal((await api.load()).ok,true);assert.equal((await api.save(input)).ok,true);exists=false;assert.equal((await api.save(input)).ok,true);
  assert.deepEqual(requests.map(r=>r.method),['GET','GET','PATCH','GET','POST']);
  for(const r of requests){assert.equal(r.url.pathname,'/rest/v1/profiles');assert.equal(r.url.searchParams.get('select'),profileColumns);if(r.method!=='POST')assert.equal(r.url.searchParams.get('id'),'eq.'+A);}
  assert.deepEqual(requests[2].body,values);assert.deepEqual(requests[4].body,{id:A,...values});
});
