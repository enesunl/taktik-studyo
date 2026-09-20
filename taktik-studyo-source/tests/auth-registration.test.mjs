import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,credentials,user,session} from './helpers/auth-fixture.mjs';
import {confirmationUrl,consumeEmailLink} from '../src/lib/auth-validation.js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';

// Stub the Auth methods themselves so these tests require the API boundary guard,
// independently of the lower-level session controller's existing checks.
function boundaryFixture() {
  const f = {state:{status:'signed_out',user:null},initialization:Promise.resolve({ok:true}),
    calls:{initialize:0,signup:0,verify:0}};
  const auth = {
    initialize(){f.calls.initialize++; return f.initialization;},
    getCurrentUser:() => f.state.user,
    getState:() => f.state,
    async signUpWithPassword(){f.calls.signup++; return {ok:false,error:{code:'unexpected_signup'}};},
    async verifyEmailToken(){f.calls.verify++; return {ok:false,error:{code:'unexpected_verify'}};},
  };
  f.api = createAuthPageApi({auth,client:null,origin:'https://taktikstudyo.com'});
  return f;
}

test('signup API blocks a session appearing after UI check or during initialization', async () => {
  for (const timing of ['before_call','during_initialize']) {
    const f = boundaryFixture();
    assert.equal(f.api.getState().user,null);
    let resolve; f.initialization = new Promise(done => {resolve = done;});
    if (timing === 'before_call') f.state = {status:'signed_in',user};
    const result = f.api.signUp(credentials);
    f.state = {status:'signed_in',user}; resolve({ok:true});
    assert.deepEqual(await result,{ok:false,error:{code:'existing_session'}});
    assert.deepEqual(f.calls,{initialize:1,signup:0,verify:0});
  }
});

test('email verification API blocks a session appearing after callback check or during initialization', async () => {
  for (const timing of ['before_call','during_initialize']) {
    const f = boundaryFixture();
    assert.equal(f.api.getState().user,null);
    let resolve; f.initialization = new Promise(done => {resolve = done;});
    if (timing === 'before_call') f.state = {status:'signed_in',user};
    const result = f.api.verifyEmail('unconsumed-token');
    f.state = {status:'signed_in',user}; resolve({ok:true});
    assert.deepEqual(await result,{ok:false,error:{code:'existing_session'}});
    assert.deepEqual(f.calls,{initialize:1,signup:0,verify:0});
  }
});

test('email verification API blocks password recovery even without a current user snapshot', async () => {
  for (const currentUser of [null,user]) {
    const f = boundaryFixture();
    f.state = {status:'password_recovery',user:currentUser};
    assert.deepEqual(await f.api.verifyEmail('unconsumed-token'),{ok:false,error:{code:'existing_session'}});
    assert.deepEqual(f.calls,{initialize:1,signup:0,verify:0});
  }
});

test('signup and email verification API return initialization failure without delegating', async () => {
  for (const operation of ['signUp','verifyEmail']) {
    const f = boundaryFixture(), failure = {ok:false,error:{code:'session_restore_failed'}};
    f.initialization = Promise.resolve(failure);
    assert.equal(await f.api[operation](operation === 'signUp' ? credentials : 'unconsumed-token'),failure);
    assert.deepEqual(f.calls,{initialize:1,signup:0,verify:0});
  }
});

test('signup sends trimmed email, untouched password, username seed and exact callback; no confirmation/session output', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.api.signUp(credentials), {ok:true,status:'confirmation_pending'});
    assert.deepEqual(f.calls.signup, [{email:credentials.email.trim(),password:credentials.password,
      options:{data:{username:credentials.username},emailRedirectTo:'https://taktikstudyo.com/auth-callback.html'}}]);
    assert.equal(f.calls.getUser,0); assert.equal(f.calls.insert.length,0);
  } finally {f.auth.dispose();}
});

test('signup rejects invalid username, non-ASCII, email and short passwords before SDK', async () => {
  const f = fixture();
  try {
    for (const username of ['', 'ab', 'a'.repeat(25), 'Çağrı', 'name-name', ' test ', 'abc\n', null])
      assert.equal((await f.api.signUp({...credentials,username})).error.code,'invalid_form');
    for (const email of ['', 'invalid', 'a@b', null, 42])
      assert.equal((await f.api.signUp({...credentials,email})).error.code,'invalid_form');
    for (const password of ['', 'a'.repeat(11), null])
      assert.equal((await f.api.signUp({...credentials,password})).error.code,'invalid_form');
    assert.equal((await f.auth.signUpWithPassword({...credentials,email:42})).error.code,'invalid_form');
    assert.equal(f.calls.signup.length,0);
    assert.equal((await f.api.signUp({...credentials,password:'a'.repeat(256)})).ok,true);
  } finally {f.auth.dispose();}
});

test('signup obfuscated/existing and unexpected session responses have identical safe result', async () => {
  for (const response of [{data:{user,session:null}}, {data:{user:{...user,identities:[]},session:null}},
    {data:{user,session}}, {error:{code:'user_already_exists',message:'email is registered'}},
    {error:{code:'email_exists',message:'private internal detail'}}]) {
    const f = fixture(); f.signupResult = response;
    try {assert.deepEqual(await f.api.signUp(credentials),{ok:true,status:'confirmation_pending'});}
    finally {f.auth.dispose();}
  }
});

test('signup and verification failures expose controlled codes, never raw server messages', async () => {
  const f = fixture();
  try {
    f.signupResult = {error:{message:'private server detail',code:'unexpected'}};
    assert.deepEqual(await f.api.signUp(credentials),{ok:false,error:{code:'sign_up_failed'}});
    f.verificationResult = {error:{message:'private token expired'}};
    assert.deepEqual(await f.api.verifyEmail('token-only-memory'),{ok:false,error:{code:'confirmation_failed'}});
    assert.equal(f.calls.getUser,0);
    f.client.auth.signUp = async () => {throw Error('private');};
    assert.equal((await f.api.signUp(credentials)).error.code,'sign_up_failed');
  } finally {f.auth.dispose();}
});

test('callback URL accepts only exact production/localhost origins', async () => {
  for (const origin of ['https://taktikstudyo.com','http://localhost:4173']) assert.equal(confirmationUrl(origin),origin+'/auth-callback.html');
  for (const origin of ['https://evil.example','https://taktikstudyo.com.evil.example','http://127.0.0.1:4173',
    'https://taktikstudyo.com/','http://localhost:4174','null',undefined]) {
    assert.equal(confirmationUrl(origin),null);
    if (!origin) continue;
    const f = fixture({origin});
    assert.equal((await f.api.signUp(credentials)).error.code,'callback_origin_not_allowed');
    assert.equal(f.calls.signup.length,0); f.auth.dispose();
  }
});

test('email callback requires exactly token_hash + type=email and sanitizes valid/invalid URLs', () => {
  const parse = search => {
    const writes = [];
    const result = consumeEmailLink({search,pathname:'/auth-callback.html',hash:'#private'}, {replaceState(...args){writes.push(args);}});
    assert.deepEqual(writes,[[null,'','/auth-callback.html']]); return result;
  };
  assert.deepEqual(parse('?token_hash=abc%2B%2F%3D-%E2%98%83&type=email'),{ok:true,tokenHash:'abc+/=-☃'});
  for (const query of ['', '?type=email', '?token_hash=x','?token_hash=x&type=recovery','?token_hash=x&type=EMAIL',
    '?token_hash=x&token_hash=y&type=email','?token_hash=x&type=email&type=email','?token_hash=x&type=email&next=evil',
    '?token_hash=&type=email','?token_hash=a%00b&type=email','?token_hash=a%0ab&type=email','?token_hash=a+b&type=email',
    '?token_hash=%ZZ&type=email','?token_hash=%C0%80&type=email','?token_hash='+ 'a'.repeat(2049)+'&type=email']) {
    assert.deepEqual(parse(query),{ok:false,error:{code:'confirmation_invalid'}});
  }
  assert.equal(consumeEmailLink({search:'?token_hash=x&type=email'}, {replaceState(){throw Error();}}).ok,false);
});

test('verifyOtp uses only token_hash/type, profiles server-verified user and exposes no session', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.api.verifyEmail('a+/-valid-token'),{ok:true,userId:user.id,profile:{ok:true,status:'ready'}});
    assert.deepEqual(f.calls.verify,[{token_hash:'a+/-valid-token',type:'email'}]);
    assert.equal(f.calls.getUser,2); assert.equal(f.auth.getState().status,'signed_in');
    assert.doesNotMatch(JSON.stringify(f.auth.getState()),/fake-access|fake-refresh|user_metadata/);
  } finally {f.auth.dispose();}
});

test('existing login or recovery session blocks verification and signup without signout', async () => {
  const f = fixture({initial:session});
  try {
    await f.auth.initialize();
    for (const event of ['SIGNED_IN','PASSWORD_RECOVERY']) {
      f.emit(event,session);
      assert.equal((await f.api.verifyEmail('token')).error.code,'existing_session');
      assert.equal((await f.api.signUp(credentials)).error.code,'existing_session');
      assert.equal((await f.api.signIn(credentials)).error.code,'existing_session');
    }
    assert.equal(f.calls.verify.length,0); assert.equal(f.calls.signup.length,0); assert.equal(f.calls.login.length,0);
  } finally {f.auth.dispose();}
});

test('login validates input, trims only email and returns profile success without session', async () => {
  const f = fixture();
  try {
    for (const args of [{...credentials,email:'bad'}, {...credentials,password:''}])
      assert.equal((await f.api.signIn(args)).error.code,'invalid_form');
    assert.equal(f.calls.login.length,0);
    assert.deepEqual(await f.api.signIn(credentials),{ok:true,userId:user.id,profile:{ok:true,status:'ready'}});
    assert.deepEqual(f.calls.login,[{email:credentials.email.trim(),password:credentials.password}]);
    assert.equal(f.calls.getUser,2);
  } finally {f.auth.dispose();}
});

test('login/confirmation profile failure or conflict never reverses Auth success', async () => {
  for (const operation of ['signIn','verifyEmail']) for (const conflict of [false,true]) {
    const f = fixture();
    f.rows = conflict ? [{data:null,error:null}] : [{error:{message:'private'}}];
    f.insertResult = {error:{code:'23505',message:'private'}};
    try {
      assert.deepEqual(await f.api[operation](operation === 'signIn' ? credentials : 'token'),
        {ok:true,userId:user.id,profile:{ok:false,status:conflict ? 'username_conflict' : 'profile_error'}});
      assert.equal(f.auth.getState().status,'signed_in');
    } finally {f.auth.dispose();}
  }
});

test('login raw errors and absent Auth configuration are controlled', async () => {
  const f = fixture();
  try {
    f.loginResult = {error:{message:'user not found: private',status:400}};
    assert.deepEqual(await f.api.signIn(credentials),{ok:false,error:{code:'sign_in_failed'}});
    assert.equal(f.calls.getUser,0);
    const offline = createAuthSession(null);
    assert.equal((await offline.signUpWithPassword({...credentials,emailRedirectTo:confirmationUrl('https://taktikstudyo.com')})).error.code,'auth_unavailable');
    assert.equal((await offline.verifyEmailToken('token')).error.code,'auth_unavailable');
  } finally {f.auth.dispose();}
});

test('Auth CAPTCHA hook is optional, configurable and delegated via SDK options only', async () => {
  for (const operation of ['signIn','signUp']) {
    const f = fixture({captchaConfigured:true});
    try {
      assert.equal((await f.api[operation](credentials)).error.code,'captcha_required');
      assert.equal((await f.api[operation]({...credentials,captchaToken:'x'.repeat(2049)})).error.code,'captcha_required');
      assert.equal(f.calls.signup.length + f.calls.login.length,0);
      const result = await f.api[operation]({...credentials,captchaToken:'auth-proof'});
      assert.equal(result.ok,true);
      const call = operation === 'signIn' ? f.calls.login[0] : f.calls.signup[0];
      assert.equal(call.options.captchaToken,'auth-proof');
      assert.doesNotMatch(JSON.stringify(result),/auth-proof|fake-access|fake-refresh/);
    } finally {f.auth.dispose();}
  }
});
