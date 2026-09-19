import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';
import {createRecoveryTransport} from '../src/lib/recovery-transport.js';
import {createRecoveryClient} from '../src/lib/recovery-client.js';

const url = 'https://abcdefghijklmnopqrst.supabase.co', key = 'sb_publishable_local_test_only';
const user = {id:'11111111-1111-4111-8111-111111111111',email:'user@example.test',aud:'authenticated',role:'authenticated'};
const other = {...user,id:'22222222-2222-4222-8222-222222222222'};
const jwt = id => [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
  Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
  'phase5_fake_signature_not_real'].join('.');
const session = target => ({user:target,access_token:jwt(target.id),refresh_token:'phase5-private-refresh-fixture',
  token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600});
const input = {tokenHash:'phase5-recovery-token-fixture',password:' new password 12 '};
const authStorageKey = 'taktik:auth:abcdefghijklmnopqrst.supabase.co:v1';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
function device() {
  const f = {store:new Map(),storageWrites:[],calls:[],states:[],logoutError:false,clients:[]};
  const http = async (source,input,options = {}) => {
    const target = new URL(input); assert.equal(target.origin,url,'only fake HTTP is permitted');
    const method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    const authorization = new Headers(options.headers).get('authorization');
    f.calls.push({source,path:target.pathname,method,body,authorization,redirect:target.searchParams.get('redirect_to')});
    if (target.pathname === '/auth/v1/token') return Response.json(session(other));
    if (target.pathname === '/auth/v1/recover') return Response.json({});
    if (target.pathname === '/auth/v1/verify') {await f.duringVerify?.(); return Response.json(session(user));}
    if (target.pathname === '/auth/v1/user' && method === 'PUT') return Response.json(user);
    if (target.pathname === '/auth/v1/logout') {
      assert.equal(target.searchParams.get('scope'),'local');
      return f.logoutError ? Response.json({code:'unexpected_failure',message:'RAW SDK DETAILS'},{status:500}) : new Response(null,{status:204});
    }
    throw Error('Unexpected endpoint: recovery must not query profiles');
  };
  f.newMain = () => {
    const client = createClient(url,key,{global:{fetch:(...args) => http('main',...args)},auth:{autoRefreshToken:true,persistSession:true,
      detectSessionInUrl:false,storageKey:authStorageKey,storage:{getItem:k => f.store.get(k) ?? null,
        setItem(k,v){f.storageWrites.push(k); f.store.set(k,v);},removeItem:k => f.store.delete(k)}}});
    f.clients.push(client); return client;
  };
  f.client = f.newMain();
  f.auth = createAuthSession(f.client,() => {
    const dedicated = createRecoveryClient({url,key},(...args) => http('recovery',...args));
    f.recoveryClient = dedicated.client; f.clients.push(dedicated.client);
    dedicated.client.auth.onAuthStateChange(event => {if (event !== 'INITIAL_SESSION') f.states.push(f.auth.getState());});
    f.onCreateRecovery?.(dedicated);
    return dedicated;
  });
  f.api = createAuthPageApi({auth:f.auth,client:f.client,origin:'http://localhost:4173'});
  f.close = async () => {f.auth.dispose(); await Promise.all(f.clients.map(client => client.auth.dispose()));};
  return f;
}

test('real SDK recovery on two mocked devices needs no PKCE; CAPTCHA mapping and verify/update/local logout order', async () => {
  const pc = device(), phone = device();
  try {
    await Promise.all([pc.auth.initialize(),phone.auth.initialize()]);
    assert.deepEqual(await pc.api.requestPasswordReset({email:' user@example.test ',captchaToken:'phase5-captcha-fixture'}),{ok:true,status:'recovery_requested'});
    assert.equal(pc.calls[0].redirect,'http://localhost:4173/sifre-yenile.html');
    assert.equal(pc.calls[0].body.email,user.email);
    assert.equal(pc.calls[0].body.gotrue_meta_security.captcha_token,'phase5-captcha-fixture');
    assert.equal(pc.calls[0].source,'main');
    assert.equal(phone.calls.length,0); assert.equal(phone.store.size,0);
    assert.deepEqual(await phone.api.completePasswordRecovery(input),{ok:true,status:'password_updated'});
    assert.deepEqual(phone.calls.map(call => [call.path,call.method]),[
      ['/auth/v1/verify','POST'],['/auth/v1/user','PUT'],['/auth/v1/logout','POST']]);
    assert.equal(phone.calls[0].body.token_hash,input.tokenHash); assert.equal(phone.calls[0].body.type,'recovery');
    assert.equal('code_verifier' in phone.calls[0].body,false);
    assert.equal(phone.calls[1].body.password,input.password);
    assert.equal(phone.calls[1].authorization,'Bearer '+jwt(user.id));
    assert.ok(phone.states.every(state => state.status === 'password_recovery' && state.user === null));
    assert.ok(phone.calls.every(call => call.source === 'recovery'));
    assert.equal(pc.auth.getState().status,'signed_out'); assert.equal(phone.auth.getState().status,'signed_out');
    assert.equal(phone.store.has(authStorageKey),false); assert.deepEqual(phone.storageWrites,[]);
    assert.doesNotMatch(JSON.stringify([...pc.store,...phone.store]),/phase5-recovery-token-fixture|code-verifier|new password/);
  } finally {await pc.close(); await phone.close();}
});

test('real SDK dispatch guard aborts when main logs in between identity check and recovery update dispatch', async () => {
  const f = device();
  try {
    await f.auth.initialize();
    f.onCreateRecovery = ({client}) => {
      const originalUpdate = client.auth.updateUser.bind(client.auth);
      client.auth.updateUser = async attributes => {
        await f.client.auth.signInWithPassword({email:other.email,password:'normal-login-password'});
        return originalUpdate(attributes);
      };
    };
    assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'state_changed'}});
    assert.deepEqual(f.calls.map(call => call.path),['/auth/v1/verify','/auth/v1/token']);
    assert.equal((await f.client.auth.getSession()).data.session.user.id,other.id);
    assert.equal(f.auth.getState().status,'signed_in');
    assert.equal(f.auth.getCurrentUser().id,other.id);
  } finally {await f.close();}
});

test('real SDK logout error is surfaced even if SDK itself removes its local session on error', async () => {
  const f = device(); f.logoutError = true;
  try {
    assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'recovery_cleanup_failed'},passwordUpdated:true});
    assert.equal(f.auth.getState().status,'signed_out');
    assert.equal(f.store.has(authStorageKey),false); assert.deepEqual(f.storageWrites,[]);
    const reloaded = createAuthSession(f.newMain());
    await reloaded.initialize();
    assert.equal(reloaded.getState().status,'signed_out'); reloaded.dispose();
  } finally {await f.close();}
});

test('crash/reload after recovery verify cannot restore recovery through main INITIAL_SESSION', async () => {
  const f = device(), reachedUpdate = deferred(), resume = deferred();
  let completion, reloaded;
  f.onCreateRecovery = ({client}) => {
    const update = client.auth.updateUser.bind(client.auth);
    client.auth.updateUser = async args => {reachedUpdate.resolve(); await resume.promise; return update(args);};
  };
  try {
    completion = f.api.completePasswordRecovery(input);
    await reachedUpdate.promise;
    assert.equal((await f.recoveryClient.auth.getSession()).data.session.user.id,user.id);
    assert.equal((await f.client.auth.getSession()).data.session,null);
    assert.equal(f.auth.getState().status,'password_recovery'); assert.equal(f.auth.getCurrentUser(),null);
    assert.equal(f.store.has(authStorageKey),false); assert.deepEqual(f.storageWrites,[]);
    assert.deepEqual(f.calls.map(call => call.path),['/auth/v1/verify']);
    // Simulate losing the page/controller before update/signout. The replacement
    // normal client sees the exact same persistent storage without clearing it.
    f.auth.dispose();
    reloaded = createAuthSession(f.newMain());
    await reloaded.initialize();
    assert.deepEqual(reloaded.getState(),{status:'signed_out',user:null,event:'INITIAL_SESSION'});
    assert.equal(f.store.has(authStorageKey),false);
    resume.resolve();
    assert.equal((await completion).error.code,'state_changed');
  } finally {resume.resolve(); await completion; reloaded?.dispose(); await f.close();}
});

test('main account change during verification cleans only the dedicated recovery session', async () => {
  const f = device();
  f.duringVerify = () => f.client.auth.signInWithPassword({email:other.email,password:'normal-login-password'});
  try {
    assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'state_changed'}});
    assert.equal(f.calls.some(call => call.method === 'PUT'),false);
    const logouts = f.calls.filter(call => call.path.endsWith('/logout'));
    assert.equal(logouts.length,1); assert.equal(logouts[0].source,'recovery');
    assert.equal(logouts[0].authorization,'Bearer '+jwt(user.id));
    assert.equal((await f.client.auth.getSession()).data.session.user.id,other.id);
    assert.equal(f.auth.getCurrentUser().id,other.id);
  } finally {await f.close();}
});

test('normal main login still persists and restores independently after recovery completion', async () => {
  const f = device(); let restored;
  try {
    assert.equal((await f.api.completePasswordRecovery(input)).ok,true);
    await f.client.auth.signInWithPassword({email:other.email,password:'normal-login-password'});
    assert.equal(f.store.has(authStorageKey),true);
    restored = createAuthSession(f.newMain()); await restored.initialize();
    assert.equal(restored.getState().status,'signed_in');
    assert.equal(f.calls.filter(call => call.path === '/auth/v1/token').length,1,'restore does not perform a new login');
    assert.equal(restored.getCurrentUser().id,other.id);
    assert.ok(f.storageWrites.every(k => k.startsWith(authStorageKey)));
  } finally {restored?.dispose(); await f.close();}
});

test('main persisted login without a delivered event blocks recovery before token consumption', async () => {
  const f = device();
  try {
    await f.auth.initialize();
    const otherTab = f.newMain();
    await otherTab.auth.signInWithPassword({email:other.email,password:'normal-login-password'});
    assert.equal(f.auth.getCurrentUser(),null,'no browser broadcast in this mock environment');
    assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'existing_session'}});
    assert.equal(f.recoveryClient,undefined);
    assert.equal(f.calls.some(call => call.path === '/auth/v1/verify'),false);
    assert.equal((await otherTab.auth.getSession()).data.session.user.id,other.id);
  } finally {await f.close();}
});

test('recovery transport leaves unrelated traffic untouched and blocks late verification/credential changes', async () => {
  const calls = []; let verifyAllowed = false, mutateAllowed = true, blocks = 0;
  const transport = createRecoveryTransport(url,async (...args) => {calls.push(args); return Response.json({ok:true});});
  const op = transport.begin({canVerify:() => verifyAllowed,canMutate:() => mutateAllowed,onBlocked:() => blocks++});
  assert.equal((await transport.fetch(url+'/auth/v1/verify',{method:'POST'})).status,409);
  verifyAllowed = true; await transport.fetch(url+'/auth/v1/verify',{method:'POST'});
  op.authorize('phase5-private-access-fixture');
  await transport.fetch(url+'/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer phase5-private-access-fixture'}});
  assert.equal((await transport.fetch(url+'/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer other'}})).status,409);
  mutateAllowed = false;
  assert.equal((await transport.fetch(url+'/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:'Bearer phase5-private-access-fixture'}})).status,409);
  await transport.fetch(url+'/rest/v1/teams');
  await transport.fetch(url+'/functions/v1/lineups',{method:'POST'});
  assert.equal(blocks,3); assert.equal(calls.length,4);
  op.release();
  await transport.fetch(url+'/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer other'}});
  assert.equal(calls.length,5);
});
