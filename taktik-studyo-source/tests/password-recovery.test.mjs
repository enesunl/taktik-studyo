import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';
import {consumeRecoveryLink,recoveryUrl} from '../src/lib/auth-validation.js';
import {createRecoveryTransport} from '../src/lib/recovery-transport.js';

const user = {id:'11111111-1111-4111-8111-111111111111',email:'user@example.test'};
const other = {id:'22222222-2222-4222-8222-222222222222',email:'other@example.test'};
const session = {user,access_token:'phase5-private-access-fixture',refresh_token:'phase5-private-refresh-fixture'};
const otherSession = {...session,user:other,access_token:'phase5-other-access-fixture'};
const input = {tokenHash:'phase5-recovery-token-fixture',password:' twelve chars '};
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
function fixture({origin = 'https://taktikstudyo.com',captchaConfigured = false,initial = null} = {}) {
  let callback, current = initial, recoveryCallback, recoveryCurrent = null;
  const f = {calls:[],states:[],mainMutations:0,recoveryDisposals:0};
  f.emit = (event,value) => {current = value; callback?.(event,value); f.states.push(f.auth.getState());};
  f.emitRecovery = (event,value) => {recoveryCurrent = value; recoveryCallback?.(event,value); f.states.push(f.auth.getState());};
  const client = {auth:{
    onAuthStateChange(fn){callback = fn; return {data:{subscription:{unsubscribe(){callback = null;}}}};},
    async getSession(){return {data:{session:current}};},
    async resetPasswordForEmail(email,options){f.calls.push(['request',email,options]); return f.requestResult || {data:{},error:null};},
    verifyOtp(){f.mainMutations++; throw Error('Main recovery verify forbidden');},
    updateUser(){f.mainMutations++; throw Error('Main recovery update forbidden');},
    signOut(){f.mainMutations++; throw Error('Main recovery signout forbidden');},
    getUser(){throw Error('Recovery must not bootstrap profiles');},
  },from(){throw Error('Recovery must not access database');}};
  const recoveryClient = {auth:{
    onAuthStateChange(fn){recoveryCallback = fn; return {data:{subscription:{unsubscribe(){recoveryCallback = null;}}}};},
    async getSession(){return {data:{session:recoveryCurrent}};},
    async verifyOtp(args){f.calls.push(['verify',args]); f.states.push(f.auth.getState());
      if (f.verify) {const result = await f.verify(); if (result.data?.session && !recoveryCurrent) f.emitRecovery('PASSWORD_RECOVERY',result.data.session); return result;}
      f.emitRecovery('PASSWORD_RECOVERY',session); return {data:{session,user},error:null};},
    async updateUser(args){f.calls.push(['update',args]);
      if (f.update) return f.update();
      f.emitRecovery('USER_UPDATED',session); return {data:{user},error:null};},
    async signOut(options){f.calls.push(['signout',options]);
      if (f.logout) return f.logout();
      f.emitRecovery('SIGNED_OUT',null); return {error:null};},
    async dispose(){f.recoveryDisposals++;},
  }};
  f.client = client; f.recoveryClient = recoveryClient;
  f.auth = createAuthSession(client,() => ({client:recoveryClient,transport:createRecoveryTransport('https://example.test',() => {throw Error('No HTTP in fake');})}));
  f.api = createAuthPageApi({auth:f.auth,client,origin,captchaConfigured});
  return f;
}

test('reset request trims email and sends exact production/local redirect without profile work', async () => {
  for (const origin of ['https://taktikstudyo.com','http://localhost:4173']) {
    const f = fixture({origin});
    try {
      assert.deepEqual(await f.api.requestPasswordReset({email:' user@example.test '}),{ok:true,status:'recovery_requested'});
      assert.deepEqual(f.calls,[['request','user@example.test',{redirectTo:origin+'/sifre-yenile.html'}]]);
      assert.equal(f.auth.getState().status,'signed_out');
    } finally {f.auth.dispose();}
  }
});

test('recovery URL allowlist rejects external, encoded, protocol, port, query and similar-domain tricks', async () => {
  for (const origin of ['https://attacker.com','//taktikstudyo.com','http://localhost:4174','https://taktikstudyo.com.attacker.com',
    'https://taktikstudyo.com?next=https://attacker.com','https%3A%2F%2Fattacker.com','https://taktikstudyo.com/',
    'http://taktikstudyo.com','http://127.0.0.1:4173']) {
    assert.equal(recoveryUrl(origin),null);
    const f = fixture({origin});
    try {
      assert.equal((await f.api.requestPasswordReset({email:user.email})).error.code,'recovery_invalid');
      assert.equal(f.calls.length,0);
    } finally {f.auth.dispose();}
  }
});

test('reset request rejects malformed email, missing Auth and nonallowlisted direct redirect', async () => {
  const f = fixture();
  try {
    for (const email of [undefined,null,42,'','missing@','@example.test','a b@example.test'])
      assert.equal((await f.api.requestPasswordReset({email})).error.code,'invalid_form');
    assert.equal((await f.auth.requestPasswordReset({email:user.email,redirectTo:'https://attacker.com'})).error.code,'invalid_form');
    assert.equal(f.calls.length,0);
    const offline = createAuthSession(null);
    assert.equal((await offline.requestPasswordReset({email:user.email,redirectTo:recoveryUrl('https://taktikstudyo.com')})).error.code,'auth_unavailable');
    assert.equal((await offline.completePasswordRecovery(input)).error.code,'auth_unavailable');
  } finally {f.auth.dispose();}
});

test('reset request obfuscates account errors and sanitizes rate limit/network errors', async () => {
  const f = fixture();
  try {
    for (const code of ['user_not_found','identity_not_found','email_exists','user_already_exists']) {
      f.requestResult = {error:{code,message:'raw private email details'}};
      assert.deepEqual(await f.api.requestPasswordReset({email:user.email}),{ok:true,status:'recovery_requested'});
    }
    for (const code of ['over_email_send_rate_limit','email_address_invalid','unexpected_failure']) {
      f.requestResult = {error:{code,message:'private account details'}};
      assert.deepEqual(await f.api.requestPasswordReset({email:user.email}),{ok:false,error:{code:'recovery_request_failed'}});
    }
    f.client.auth.resetPasswordForEmail = async () => {throw Error('private network details');};
    assert.deepEqual(await f.api.requestPasswordReset({email:user.email}),{ok:false,error:{code:'recovery_request_failed'}});
  } finally {f.auth.dispose();}
});

test('reset request CAPTCHA is optional or fails closed and passes supported options.captchaToken', async () => {
  const f = fixture({captchaConfigured:true});
  try {
    assert.equal((await f.api.requestPasswordReset({email:user.email})).error.code,'captcha_required');
    assert.equal(f.calls.length,0);
    assert.equal((await f.api.requestPasswordReset({email:user.email,captchaToken:'phase5-captcha-fixture'})).ok,true);
    assert.deepEqual(f.calls[0][2],{redirectTo:'https://taktikstudyo.com/sifre-yenile.html',captchaToken:'phase5-captcha-fixture'});
  } finally {f.auth.dispose();}
});

test('existing signed-in or recovery identity blocks request and completion with no logout', async () => {
  const f = fixture({initial:session});
  try {
    await f.auth.initialize();
    for (const event of ['SIGNED_IN','PASSWORD_RECOVERY']) {
      f.emit(event,session);
      assert.equal((await f.api.requestPasswordReset({email:user.email})).error.code,'existing_session');
      assert.equal((await f.api.completePasswordRecovery(input)).error.code,'existing_session');
      assert.equal((await f.auth.completePasswordRecovery(input)).error.code,'existing_session');
    }
    assert.equal(f.calls.length,0);
  } finally {f.auth.dispose();}
});

test('API recovery boundaries await initialization and reject races/recovery without user snapshots', async () => {
  for (const method of ['requestPasswordReset','completePasswordRecovery']) {
    const wait = deferred(); let state = {status:'signed_out',user:null}, called = 0;
    const auth = {initialize:() => wait.promise,getState:() => state,getCurrentUser:() => state.user,
      [method](){called++; return {ok:true};}};
    const api = createAuthPageApi({auth,client:null,origin:'https://taktikstudyo.com'});
    const result = api[method](method === 'requestPasswordReset' ? {email:user.email} : input);
    state = {status:'password_recovery',user:null}; wait.resolve({ok:true});
    assert.equal((await result).error.code,'existing_session'); assert.equal(called,0);
    auth.initialize = async () => ({ok:false,error:{code:'session_restore_failed'}});
    assert.equal((await api[method](method === 'requestPasswordReset' ? {email:user.email} : input)).error.code,'session_restore_failed');
  }
});

test('recovery parser accepts only single token_hash/type=recovery and always sanitizes synchronously', () => {
  const parse = search => {
    const changes = [];
    const result = consumeRecoveryLink({search,pathname:'/sifre-yenile.html',hash:'#secret'},{replaceState(...args){changes.push(args);}});
    assert.deepEqual(changes,[[null,'','/sifre-yenile.html']]); return result;
  };
  assert.deepEqual(parse('?token_hash=a%2B%2F%3D-%E2%98%83&type=recovery'),{ok:true,tokenHash:'a+/=-☃'});
  for (const search of ['', '?type=recovery','?token_hash=x','?token_hash=x&type=email','?token_hash=x&type=other',
    '?token_hash=x&token_hash=y&type=recovery','?token_hash=x&type=recovery&type=recovery',
    '?token_hash=x&type=recovery&next=evil','?token_hash=&type=recovery','?token_hash='+ 'x'.repeat(2049)+'&type=recovery',
    '?token_hash=x%00y&type=recovery','?token_hash=x%7Fy&type=recovery','?token_hash=x+y&type=recovery',
    '?token_hash=x%0ay&type=recovery','?token_hash=%ZZ&type=recovery','?token_hash=%C0%80&type=recovery'])
    assert.deepEqual(parse(search),{ok:false,error:{code:'recovery_invalid'}});
  assert.equal(consumeRecoveryLink({search:'?token_hash=x&type=recovery'},{replaceState(){throw Error();}}).error.code,'recovery_invalid');
});

test('valid recovery orders verify recovery, untouched password update, local signout; no raw result', async () => {
  const f = fixture();
  try {
    const result = await f.api.completePasswordRecovery(input);
    assert.deepEqual(result,{ok:true,status:'password_updated'});
    assert.deepEqual(f.calls,[['verify',{token_hash:input.tokenHash,type:'recovery'}],['update',{password:input.password}],['signout',{scope:'local'}]]);
    assert.equal(f.states[0].status,'password_recovery');
    assert.ok(f.states.slice(0,-1).every(state => state.status === 'password_recovery'));
    assert.equal(f.auth.getState().status,'signed_out');
    assert.equal(f.mainMutations,0); assert.equal(f.recoveryDisposals,1);
    assert.ok(f.states.every(state => state.user === null));
    assert.doesNotMatch(JSON.stringify([result,f.states]),/phase5-|access_token|refresh_token|token_hash/);
  } finally {f.auth.dispose();}
});

test('recovery rejects short/untyped passwords and bad token before consumption', async () => {
  const f = fixture();
  try {
    for (const password of ['', 'x'.repeat(11),null,42])
      assert.equal((await f.api.completePasswordRecovery({...input,password})).error.code,'invalid_form');
    assert.equal((await f.auth.completePasswordRecovery({...input,password:'short'})).error.code,'invalid_form');
    assert.equal((await f.api.completePasswordRecovery({...input,tokenHash:' '})).error.code,'recovery_invalid');
    assert.equal(f.calls.length,0);
  } finally {f.auth.dispose();}
});

test('SIGNED_IN, USER_UPDATED and TOKEN_REFRESHED never promote an active recovery session', async () => {
  const f = fixture();
  f.verify = async () => {
    for (const event of ['SIGNED_IN','PASSWORD_RECOVERY','TOKEN_REFRESHED']) {
      f.emitRecovery(event,session); assert.equal(f.auth.getState().status,'password_recovery');
    }
    return {data:{user,session}};
  };
  f.update = async () => {
    for (const event of ['USER_UPDATED','TOKEN_REFRESHED','SIGNED_IN']) {
      f.emitRecovery(event,session); assert.equal(f.auth.getState().status,'password_recovery');
    }
    return {data:{user}};
  };
  try {assert.equal((await f.auth.completePasswordRecovery(input)).ok,true); assert.equal(f.auth.getState().status,'signed_out');}
  finally {f.auth.dispose();}
});

test('concurrent recovery and normal Auth calls cannot start while recovery verify is pending', async () => {
  const f = fixture(), wait = deferred(), started = deferred();
  f.verify = () => {started.resolve(); return wait.promise;};
  try {
    await f.auth.initialize();
    const result = f.auth.completePasswordRecovery(input); await started.promise;
    assert.equal(f.auth.getState().status,'password_recovery');
    assert.equal((await f.auth.completePasswordRecovery(input)).error.code,'existing_session');
    assert.equal((await f.auth.signInWithPassword({email:user.email,password:'normal-password'})).error.code,'existing_session');
    assert.equal((await f.auth.verifyEmailToken('other-token')).error.code,'existing_session');
    assert.equal((await f.auth.requestPasswordReset({email:user.email,redirectTo:recoveryUrl('https://taktikstudyo.com')})).error.code,'existing_session');
    wait.resolve({data:{user,session}});
    assert.equal((await result).ok,true);
    assert.equal(f.calls.filter(([name]) => name === 'verify').length,1);
  } finally {f.auth.dispose();}
});

test('verify failure/exception produces a controlled result and never updates a password', async () => {
  for (const throws of [false,true]) {
    const f = fixture();
    f.verify = async () => {if (throws) throw Error('raw token'); return {error:{message:'private expired token'}};};
    try {
      assert.deepEqual(await f.auth.completePasswordRecovery(input),{ok:false,error:{code:'recovery_failed'}});
      assert.deepEqual(f.calls.map(([name]) => name),['verify']);
      assert.equal(f.auth.getState().status,'signed_out');
    } finally {f.auth.dispose();}
  }
});

test('update failure/exception attempts local cleanup and requires a new link', async () => {
  for (const throws of [false,true]) {
    const f = fixture();
    f.update = async () => {if (throws) throw Error('raw password'); return {error:{message:'raw internal error'}};};
    try {
      assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'password_update_failed'}});
      assert.deepEqual(f.calls.map(([name]) => name),['verify','update','signout']);
      assert.equal(f.auth.getState().status,'signed_out');
    } finally {f.auth.dispose();}
  }
});

test('dedicated cleanup failure is explicit and cannot create a main authenticated session', async () => {
  for (const passwordUpdated of [true,false]) for (const throws of [true,false]) {
    const f = fixture();
    if (!passwordUpdated) f.update = async () => ({error:{message:'raw'}});
    f.logout = async () => {if (throws) throw Error('raw logout'); return {error:{message:'raw logout'}};};
    try {
      assert.deepEqual(await f.api.completePasswordRecovery(input),{ok:false,error:{code:'recovery_cleanup_failed'},passwordUpdated});
      for (const event of ['USER_UPDATED','TOKEN_REFRESHED','SIGNED_IN']) {
        f.emitRecovery(event,session); assert.equal(f.auth.getState().status,'signed_out');
      }
      assert.equal(f.mainMutations,0); assert.equal(f.recoveryDisposals,1);
      assert.equal(f.auth.getCurrentUser(),null);
    } finally {f.auth.dispose();}
  }
});

test('account switch during verification never updates another account or logs it out', async () => {
  const f = fixture();
  f.verify = async () => {f.emit('SIGNED_IN',otherSession); return {data:{user,session}};};
  try {
    assert.deepEqual(await f.auth.completePasswordRecovery(input),{ok:false,error:{code:'state_changed'}});
    assert.deepEqual(f.calls.map(([name]) => name),['verify','signout']);
    assert.equal(f.auth.getCurrentUser().id,other.id);
    assert.equal(f.mainMutations,0);
  } finally {f.auth.dispose();}
});

test('a dedicated A/B/A identity race stays invalid; cleanup never touches main Auth', async () => {
  const f = fixture();
  f.verify = async () => {f.emitRecovery('SIGNED_IN',session); f.emitRecovery('SIGNED_IN',otherSession); f.emitRecovery('PASSWORD_RECOVERY',session); return {data:{user,session}};};
  try {
    assert.deepEqual(await f.auth.completePasswordRecovery(input),{ok:false,error:{code:'state_changed'}});
    assert.deepEqual(f.calls.map(([name]) => name),['verify','signout']);
    assert.equal(f.auth.getState().status,'signed_out');
    assert.equal(f.mainMutations,0);
  } finally {f.auth.dispose();}
});

test('account switch while update is pending is reported and never logs out the new account', async () => {
  const f = fixture();
  f.update = async () => {f.emit('SIGNED_IN',otherSession); return {data:{user}};};
  try {
    assert.equal((await f.auth.completePasswordRecovery(input)).error.code,'state_changed');
    assert.deepEqual(f.calls.map(([name]) => name),['verify','update','signout']);
    assert.equal(f.auth.getCurrentUser().id,other.id);
    assert.equal(f.mainMutations,0);
  } finally {f.auth.dispose();}
});

test('verify response, dedicated current identity and updated user must match expected recovery identity', async () => {
  for (const mismatch of ['verify_response','current_session','updated_user']) {
    const f = fixture();
    if (mismatch === 'verify_response') f.verify = async () => ({data:{user:other,session}});
    if (mismatch === 'current_session') f.recoveryClient.auth.getSession = async () => ({data:{session:otherSession}});
    if (mismatch === 'updated_user') f.update = async () => ({data:{user:other}});
    try {
      const result = await f.auth.completePasswordRecovery(input);
      assert.equal(result.ok,false);
      assert.equal(f.calls.filter(([name]) => name === 'update').length,mismatch === 'updated_user' ? 1 : 0);
      assert.equal(f.mainMutations,0); assert.equal(f.auth.getCurrentUser(),null);
      assert.equal(f.auth.getState().status,'signed_out');
    } finally {f.auth.dispose();}
  }
});
