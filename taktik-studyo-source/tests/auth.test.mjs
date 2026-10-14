import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSession} from '../src/lib/auth-session.js';
import {safeInternalRedirect} from '../src/lib/auth-redirects.js';

const user = {id:'11111111-1111-4111-8111-111111111111', email:'test@example.test', email_confirmed_at:'2026-09-18T10:00:00Z', user_metadata:{untrusted:true}};
const session = {user, access_token:'private-test-token', refresh_token:'private-test-refresh'};
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };
function fixture(initial = session) {
  let callback, current = initial;
  const calls = {register:0, unsubscribe:0, restore:0, validate:0};
  const client = {auth:{
    onAuthStateChange(fn) { calls.register++; callback = fn; return {data:{subscription:{unsubscribe(){calls.unsubscribe++; callback = null;}}}}; },
    async getSession() { calls.restore++; return {data:{session:current}, error:null}; },
    async getUser() { calls.validate++; return {data:{user:current?.user || null}, error:null}; },
    async signInWithPassword(value) { calls.credentials = value; current = session; callback?.('SIGNED_IN', session); return {data:{session, user}, error:null}; },
    async signOut(options) { calls.signOut = options; current = null; callback?.('SIGNED_OUT', null); return {error:null}; },
  }};
  return {client, calls, emit(event, value) { current = value; callback?.(event, value); }};
}

test('restore is single-flight, identity only, immutable and not server validation', async () => {
  const f = fixture(), auth = createAuthSession(f.client);
  const first = auth.initialize(); assert.equal(auth.initialize(), first);
  assert.equal((await first).ok, true);
  assert.equal(f.calls.register, 1); assert.equal(f.calls.restore, 1); assert.equal(f.calls.validate, 0);
  assert.deepEqual(auth.getCurrentUser(), {id:user.id, email:user.email, emailConfirmedAt:user.email_confirmed_at});
  assert.ok(Object.isFrozen(auth.getState())); assert.ok(Object.isFrozen(auth.getCurrentUser()));
  assert.doesNotMatch(JSON.stringify(auth.getState()), /private-test|untrusted|access_token|refresh_token/);
  assert.equal((await auth.validateUser()).ok, true); assert.equal(f.calls.validate, 1);
  auth.dispose();
});

test('server validation fails closed without erasing restored identity on network errors', async () => {
  const f = fixture(), auth = createAuthSession(f.client); await auth.initialize();
  f.client.auth.getUser = async () => ({error:{message:'private-test-token'}, data:{user:null}});
  assert.deepEqual(await auth.validateUser(), {ok:false, error:{code:'user_validation_failed'}});
  assert.equal(auth.getCurrentUser().id, user.id);
  f.client.auth.getUser = async () => ({error:null, data:{user:null}});
  assert.equal((await auth.validateUser()).error.code, 'user_validation_failed');
  f.client.auth.getUser = async () => { throw Error('internal stack and credentials'); };
  assert.deepEqual(await auth.validateUser(), {ok:false, error:{code:'user_validation_failed'}});
  auth.dispose();
});

test('sign in delegates credentials and CAPTCHA, local logout exposes no session', async () => {
  const f = fixture(null), auth = createAuthSession(f.client);
  assert.equal((await auth.initialize()).state.status, 'signed_out');
  const result = await auth.signInWithPassword({email:user.email, password:' password ', captchaToken:'bot-proof'});
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.credentials, {email:user.email, password:' password ', options:{captchaToken:'bot-proof'}});
  assert.equal(result.user.id, user.id); assert.equal('session' in result, false);
  assert.equal((await auth.signOut()).ok, true); assert.deepEqual(f.calls.signOut, {scope:'local'});
  assert.equal(auth.getCurrentUser(), null);
  auth.dispose();
});

test('recovery events stay classified until sign-out; unrelated normal Auth events remain signed-in', async () => {
  const f = fixture(), auth = createAuthSession(f.client);
  try {
    assert.equal(auth.getState().status, 'idle');
    await auth.initialize();
    assert.equal(auth.getState().status, 'signed_in');
    f.emit('PASSWORD_RECOVERY', session);
    assert.equal(auth.getState().status, 'password_recovery');
    assert.equal(auth.getCurrentUser().id, user.id);
    assert.doesNotMatch(JSON.stringify(auth.getState()), /private-test|access_token|refresh_token/);
    for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
      f.emit(event, session);
      assert.equal(auth.getState().status, 'password_recovery');
    }
    f.emit('SIGNED_OUT', session);
    assert.equal(auth.getState().status, 'signed_out');
    assert.equal(auth.getCurrentUser(), null);
    for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
      f.emit(event, session);
      assert.equal(auth.getState().status, 'signed_in');
    }
    f.emit('SIGNED_OUT', null);
    for (const invalidSession of [null, {user:{}}, {user:{id:''}}]) {
      f.emit('PASSWORD_RECOVERY', invalidSession);
      assert.equal(auth.getState().status, 'signed_out');
      assert.equal(auth.getCurrentUser(), null);
    }
  } finally { auth.dispose(); }
});

test('duplicate events/listeners are idempotent; delivery runs outside SDK callbacks', async () => {
  const f = fixture(null), auth = createAuthSession(f.client); await auth.initialize();
  const events = []; const listener = state => events.push(state.event);
  const off = auth.subscribe(listener); auth.subscribe(listener);
  await tick(); events.length = 0;
  f.emit('SIGNED_IN', session); f.emit('SIGNED_IN', session);
  assert.equal(events.length, 0);
  await tick(); assert.deepEqual(events, ['SIGNED_IN']);
  f.emit('TOKEN_REFRESHED', {...session, access_token:'rotated'});
  f.emit('TOKEN_REFRESHED', {...session, access_token:'rotated-again'});
  await tick(); assert.deepEqual(events, ['SIGNED_IN', 'TOKEN_REFRESHED']);
  f.emit('INITIAL_SESSION', null); assert.equal(auth.getCurrentUser().id, user.id);
  off(); f.emit('SIGNED_OUT', null); await tick(); assert.equal(events.length, 2);
  auth.dispose(); auth.dispose(); assert.equal(f.calls.unsubscribe, 1);
  await auth.initialize(); assert.equal(f.calls.register, 2); auth.dispose();
});

test('unsubscribe and cleanup cancel queued notifications and isolate failing listeners', async () => {
  const f = fixture(), auth = createAuthSession(f.client); await auth.initialize();
  let delivered = 0;
  auth.subscribe(() => {throw Error('private');});
  auth.subscribe(async () => {throw Error('private');});
  const off = auth.subscribe(() => delivered++); off();
  await tick(); assert.equal(delivered, 0);
  auth.subscribe(() => delivered++); auth.dispose(); await tick(); assert.equal(delivered, 0);
});

test('late session restore and user validation cannot resurrect an old identity', async () => {
  const f = fixture(), restore = deferred(), auth = createAuthSession(f.client);
  f.client.auth.getSession = () => restore.promise;
  const ready = auth.initialize(); await Promise.resolve();
  f.emit('SIGNED_OUT', null); restore.resolve({data:{session}, error:null});
  await ready; assert.equal(auth.getCurrentUser(), null);
  const validation = deferred(); f.client.auth.getUser = () => validation.promise;
  const validating = auth.validateUser(); await Promise.resolve();
  f.emit('SIGNED_IN', session); validation.resolve({data:{user}, error:null});
  assert.equal((await validating).error.code, 'state_changed'); auth.dispose();
});

test('restore errors are sanitized, retry unsubscribes first, offline client is controlled', async () => {
  const f = fixture(), auth = createAuthSession(f.client);
  f.client.auth.getSession = async () => {throw Error('private credentials');};
  assert.deepEqual(await auth.initialize(), {ok:false, error:{code:'session_restore_failed'}});
  assert.equal(f.calls.unsubscribe, 1);
  f.client.auth.getSession = async () => ({data:{session:null}, error:null});
  assert.equal((await auth.initialize()).ok, true); assert.equal(f.calls.register, 2);
  assert.equal((await auth.signInWithPassword({email:'', password:''})).error.code, 'invalid_credentials');
  f.client.auth.signInWithPassword = async () => ({error:{message:'private'}, data:{}});
  assert.equal((await auth.signInWithPassword({email:user.email, password:'secret'})).error.code, 'sign_in_failed');
  f.client.auth.signOut = async () => {throw Error('private');};
  assert.equal((await auth.signOut()).error.code, 'sign_out_failed'); auth.dispose();
  const offline = createAuthSession(null);
  for (const operation of [() => offline.initialize(), () => offline.validateUser(), () => offline.signOut()]) {
    assert.deepEqual(await operation(), {ok:false, error:{code:'auth_unavailable'}});
  }
});

test('cleanup during restore invalidates pending work and permits clean reinitialization', async () => {
  const f = fixture(), wait = deferred(), auth = createAuthSession(f.client);
  f.client.auth.getSession = () => wait.promise;
  const first = auth.initialize(); await Promise.resolve(); auth.dispose();
  wait.resolve({data:{session}, error:null}); assert.equal((await first).error.code, 'state_changed');
  assert.equal(auth.getState().status, 'idle');
  f.client.auth.getSession = async () => ({data:{session:null}, error:null});
  assert.equal((await auth.initialize()).ok, true); assert.equal(auth.getCurrentUser(), null); auth.dispose();
});

test('safe redirects use exact root-relative whitelist, reject all encoded/external variants', () => {
  for (const path of ['/studyo.html', '/profil.html']) assert.equal(safeInternalRedirect(path), path);
  for (const path of [null, undefined, 1, {}, '', '/', '/unknown', 'studyo.html',
    'https://evil.example', 'http://evil.example', '//evil.example', '\\evil.example', '/\\evil.example',
    'javascript:alert(1)', 'data:text/html,x', '%2f%2fevil.example', '/%2f%2fevil.example',
    'https%3A%2F%2Fevil.example', '%252f%252fevil.example', '/%73tudyo.html',
    '/studyo.html?next=https://evil.example', '/studyo.html#x', '/foo/../studyo.html',
    '/studyo.html/', '/studyo.html\n', ' /studyo.html', 'https://taktikstudyo.com/studyo.html']) {
    assert.equal(safeInternalRedirect(path), null, String(path));
  }
});
