import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {fixture,pageFixture,user,session,credentials} from './helpers/auth-fixture.mjs';

const B = {...user,id:'22222222-2222-4222-8222-222222222222',email:'b@example.test'};
const changed = {ok:false,error:{code:'state_changed'}};
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
function setup(t,kind = 'login') {
  const f = fixture(), form = pageFixture(kind);
  let result;
  const method = kind === 'callback' ? 'verifyEmail' : kind === 'register' ? 'signUp' : 'signIn';
  form.options.api = {...f.api,async [method](args) {result = await f.api[method](args); return result;}};
  const logouts = [];
  f.client.auth.signOut = async options => {logouts.push(options); f.emit('SIGNED_OUT',null); return {error:null};};
  const page = mountAuthPage(form.options);
  t.after(() => {page.dispose();f.auth.dispose();});
  return {...f,form,page,logouts,result:() => result,
    submit:() => (kind === 'callback' ? form.fields.authSubmit : form.fields.authForm).emit(kind === 'callback' ? 'click' : 'submit'),
    switchToB:() => f.emit('SIGNED_IN',{...session,user:B})};
}
function assertStale(f,expectedUser = B) {
  assert.deepEqual(f.result(),changed);
  assert.equal(f.auth.getCurrentUser().id,expectedUser.id);
  assert.equal(f.auth.getState().status,'signed_in');
  assert.equal(f.logouts.length,0);
  assert.deepEqual(f.form.calls,[],'stale operation must not navigate');
  assert.doesNotMatch(f.form.fields.authMessage.textContent,/Giriş başarılı|E-posta adresin doğrulandı|Kaydın oluşturuldu/);
  assert.equal(f.form.fields.profileMessage.textContent,'');
  assert.equal(f.calls.insert.length,0,'neither A nor B profile may be inserted by stale work');
  assert.equal(f.calls.select.some(call => call.value === B.id),false);
}

test('API initialization await cannot hide signed-out -> B -> signed-out before dispatch',async t=>{
  for(const method of ['signIn','signUp','verifyEmail']) {
    const f=fixture();t.after(()=>f.auth.dispose());await f.auth.initialize();
    const work=f.api[method](method==='verifyEmail'?'unused-confirmation-fixture':credentials);
    f.emit('SIGNED_IN',{...session,user:B});f.emit('SIGNED_OUT',null);
    assert.deepEqual(await work,changed);
    assert.equal(f.calls.login.length+f.calls.signup.length+f.calls.verify.length,0);
    assert.equal(f.calls.getUser,0);assert.equal(f.calls.insert.length,0);
  }
});

test('A login validation pending -> confirmed B -> late successful A: no navigation, bootstrap or logout',async t => {
  const f=setup(t), entered=deferred(), reply=deferred();
  f.client.auth.getUser=()=>{f.calls.getUser++;entered.resolve();return reply.promise;};
  await f.page.ready;const work=f.submit();await entered.promise;
  f.switchToB();reply.resolve({data:{user},error:null});await work;
  assertStale(f);assert.equal(f.calls.getUser,1);assert.equal(f.calls.select.length,0);
});

test('A confirmation verify pending -> B -> late A verify: no validation, navigation or logout of B',async t => {
  const f=setup(t,'callback'),entered=deferred(),reply=deferred();
  f.client.auth.verifyOtp=args=>{f.calls.verify.push(args);entered.resolve();return reply.promise;};
  await f.page.ready;assert.equal(f.calls.verify.length,0);
  const work=f.submit();await entered.promise;f.switchToB();
  reply.resolve({data:{user,session},error:null});await work;
  assertStale(f);assert.equal(f.calls.getUser,0);assert.equal(f.calls.select.length,0);
});

for(const kind of ['login','callback']) for(const boundary of ['profile-user','profile-select']) {
  test(`${kind}: validated A -> ${boundary} pending -> B -> late bootstrap cannot write success/navigation`,async t => {
    const f=setup(t,kind),entered=deferred(),reply=deferred();
    if(boundary==='profile-user') {
      f.client.auth.getUser=async()=>{
        if(++f.calls.getUser===2){entered.resolve();return reply.promise;}
        return {data:{user},error:null};
      };
    } else {
      f.client.from=table=>({select(columns){return {eq(column,value){f.calls.select.push({table,columns,column,value});
        return {maybeSingle(){entered.resolve();return reply.promise;}};}};},
        insert(payload){f.calls.insert.push(payload);throw Error('unexpected stale write');}});
    }
    await f.page.ready;const work=f.submit();await entered.promise;
    f.switchToB();reply.resolve(boundary==='profile-user'?{data:{user}}:{data:null});await work;
    assertStale(f);
    assert.equal(f.calls.select.length,boundary==='profile-user'?0:1);
  });
}

for(const kind of ['login','callback']) {
  test(`${kind}: A -> B -> A during profile await never regains the old operation generation`,async t => {
    const f=setup(t,kind),entered=deferred(),reply=deferred();
    f.client.auth.getUser=async()=>{
      if(++f.calls.getUser===2){entered.resolve();return reply.promise;}
      return {data:{user}};
    };
    await f.page.ready;const work=f.submit();await entered.promise;
    f.switchToB();f.emit('SIGNED_IN',session);reply.resolve({data:{user}});await work;
    assertStale(f,user);assert.equal(f.calls.select.length,0);
  });

  test(`${kind}: first SDK identity transition cannot hide a B -> A switch before its response`,async t => {
    const f=setup(t,kind),entered=deferred(),reply=deferred();
    const method=kind==='login'?'signInWithPassword':'verifyOtp';
    f.client.auth[method]=()=>{entered.resolve();return reply.promise;};
    await f.page.ready;const work=f.submit();await entered.promise;
    f.switchToB();f.emit('SIGNED_IN',session);reply.resolve({data:{user,session}});await work;
    assertStale(f,user);assert.equal(f.calls.getUser,0);
  });

  test(`${kind}: final UI gate rejects an otherwise successful result after an A -> B -> A change`,async t => {
    const f=fixture(),form=pageFixture(kind),method=kind==='login'?'signIn':'verifyEmail';
    form.options.api={...f.api,async [method](args){
      const result=await f.api[method](args);assert.equal(result.ok,true);
      f.emit('SIGNED_IN',{...session,user:B});f.emit('SIGNED_IN',session);
      assert.equal(f.api.isCurrentResult(result),false);return result;
    }};
    const page=mountAuthPage(form.options);t.after(()=>{page.dispose();f.auth.dispose();});
    await page.ready;await (kind==='login'?form.fields.authForm:form.fields.authSubmit).emit(kind==='login'?'submit':'click');
    assert.deepEqual(form.calls,[]);assert.equal(form.fields.profileMessage.textContent,'');
    assert.doesNotMatch(form.fields.authMessage.textContent,/Giriş başarılı|E-posta adresin doğrulandı/);
  });
}

test('signup response pending after B login cannot replace navigation with confirmation-pending success',async t=>{
  const f=setup(t,'register'),entered=deferred(),reply=deferred();
  f.client.auth.signUp=()=>{entered.resolve();return reply.promise;};
  await f.page.ready;const work=f.submit();await entered.promise;f.switchToB();
  reply.resolve({data:{user,session:null}});await work;assertStale(f);
});

test('stale unconfirmed validation never cleans B; current unconfirmed validation still signs out locally',async t=>{
  for(const switchAccount of [true,false]) {
    const f=setup(t),entered=deferred(),reply=deferred();
    f.client.auth.getUser=()=>{entered.resolve();return reply.promise;};
    await f.page.ready;const work=f.submit();await entered.promise;
    if(switchAccount)f.switchToB();
    reply.resolve({data:{user:{...user,email_confirmed_at:undefined}}});await work;
    if(switchAccount)assertStale(f);
    else {assert.equal(f.result().error.code,'email_not_confirmed');assert.deepEqual(f.logouts,[{scope:'local'}]);assert.equal(f.auth.getState().status,'signed_out');assert.deepEqual(f.form.calls,[]);}
  }
});

test('same-account success retains navigation; generation guard tolerates same-identity refresh but not dispose/restore',async t=>{
  const f=setup(t);await f.page.ready;await f.submit();
  assert.equal(f.result().ok,true);assert.equal(f.result().userId,user.id);
  assert.deepEqual(f.form.calls,[{kind:'navigate',url:'/studyo.html'}]);
  assert.match(f.form.fields.authMessage.textContent,/Giriş başarılı/);
  f.emit('TOKEN_REFRESHED',session);assert.equal(f.api.isCurrentResult(f.result()),true);
  assert.equal(f.api.isCurrentResult({...f.result()}),false,'untracked result is not an operation proof');
  f.auth.dispose();await f.auth.initialize();assert.equal(f.auth.getCurrentUser().id,user.id);
  assert.equal(f.api.isCurrentResult(f.result()),false);
  assert.doesNotMatch(JSON.stringify(f.result()),/token|session|generation|revision/);
});
