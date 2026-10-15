import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {pageFixture,session,fixture,user} from './helpers/auth-fixture.mjs';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};

test('callback sanitizes immediately before async restore, load never verifies, click verifies exactly once', async () => {
  const f = pageFixture(), wait = deferred();
  f.api.initialize = () => {assert.deepEqual(f.historyCalls,[[null,'','/auth-callback.html']]); return wait.promise;};
  const page = mountAuthPage(f.options);
  assert.equal(f.historyCalls.length,1); assert.equal(f.fields.authSubmit.disabled,true);
  assert.equal(f.calls.length,0);
  wait.resolve({ok:true}); await page.ready;
  assert.equal(f.calls.length,0); assert.equal(f.fields.authSubmit.disabled,false);
  const verification = deferred();
  f.api.verifyEmail = token => {f.calls.push({token}); return verification.promise;};
  const click = f.fields.authSubmit.emit('click');
  await f.fields.authSubmit.emit('click');
  assert.deepEqual(f.calls,[{token:'fake-token-hash'}]);
  assert.equal(f.fields.authSubmit.disabled,true);
  f.state={status:'signed_in',user:session.user};
  verification.resolve({ok:true,userId:session.user.id,profile:{status:'ready'}}); await click;
  assert.match(f.fields.authMessage.textContent,/doğrulandı/);
  assert.match(f.fields.authMessage.textContent,/Diğer cihazlarda/);
  assert.doesNotMatch(JSON.stringify(page),/token|session/);
  assert.deepEqual(f.calls.at(-1),{kind:'replace',url:'/studyo.html'});
  await f.fields.authSubmit.emit('click'); assert.equal(f.calls.length,2);
  page.dispose();
});

test('callback invalid parameters or history failure disable verification', async () => {
  for (const search of ['', '?token_hash=x&type=recovery','?token_hash=x&type=email&token_hash=y']) {
    const f = pageFixture('callback',search); let initializations = 0;
    f.api.initialize = async () => {initializations++; return {ok:true};};
    const page = mountAuthPage(f.options); await page.ready;
    await f.fields.authSubmit.emit('click');
    assert.equal(f.calls.length,0); assert.equal(initializations,0);
    assert.match(f.fields.authMessage.textContent,/geçersiz/); page.dispose();
  }
});

test('callback existing signed-in/recovery session blocks load and later click collisions', async () => {
  for (const status of ['signed_in','password_recovery']) for (const atLoad of [true,false]) {
    const f = pageFixture();
    if (atLoad) f.state = {status,user:session.user};
    const page = mountAuthPage(f.options); await page.ready;
    f.state = {status,user:session.user};
    await f.fields.authSubmit.emit('click');
    assert.equal(f.calls.length,0); assert.equal(f.fields.authSubmit.disabled,true);
    assert.match(f.fields.authMessage.textContent,/zaten bir oturum açık/);
    assert.match(f.fields.authMessage.textContent,/gizli pencere/);
    page.dispose();
  }
});

test('callback verification error is controlled, consumes memory reference and does not retry token', async () => {
  const f = pageFixture();
  f.api.verifyEmail = async token => {f.calls.push(token); return {ok:false,error:{code:'confirmation_failed',message:'RAW PRIVATE'}};};
  const page = mountAuthPage(f.options); await page.ready;
  await f.fields.authSubmit.emit('click'); await f.fields.authSubmit.emit('click');
  assert.equal(f.calls.length,1); assert.match(f.fields.authMessage.textContent,/tamamlanamadı/);
  assert.doesNotMatch(f.fields.authMessage.textContent,/RAW PRIVATE|fake-token/); page.dispose();
});

test('callback never uses local/session storage, console or innerHTML; navigation follows click success', async () => {
  const f = pageFixture();
  for (const property of ['localStorage','sessionStorage','console']) {
    Object.defineProperty(f.options.eventTarget,property,{get(){throw Error(property+' forbidden');}});
  }
  for (const el of Object.values(f.fields)) Object.defineProperty(el,'innerHTML',{set(){throw Error('unsafe HTML');}});
  const page = mountAuthPage(f.options); await page.ready; await f.fields.authSubmit.emit('click'); page.dispose();
  for (const file of ['auth-ui.js','auth-validation.js','auth-page-api.js','profile-bootstrap.js']) {
    const source = readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|console)\s*[.[]|\.innerHTML\s*=/);
  }
});

test('register form validates password match/length and username before sending API credentials', async () => {
  const f = pageFixture('register'), page = mountAuthPage(f.options); await page.ready;
  f.fields.passwordConfirmation.value = 'mismatch';
  await f.fields.authForm.emit('submit'); assert.match(f.fields.authMessage.textContent,/eşleşmiyor/);
  f.fields.password.value = f.fields.passwordConfirmation.value = 'short';
  await f.fields.authForm.emit('submit'); assert.match(f.fields.authMessage.textContent,/12 karakter/);
  f.fields.password.value = f.fields.passwordConfirmation.value = ' twelve chars ';
  f.fields.username.value = 'Çağrı';
  await f.fields.authForm.emit('submit'); assert.match(f.fields.authMessage.textContent,/3–24/);
  assert.equal(f.calls.length,0);
  f.fields.username.value = 'Name_1'; await f.fields.authForm.emit('submit');
  assert.deepEqual(f.calls,[{kind:'signup',args:{email:'test@example.test',password:' twelve chars ',username:'Name_1',termsAccepted:true}},{kind:'replace',url:'/giris.html?reason=confirmation_pending'}]);
  assert.equal(f.fields.password.value,''); assert.equal(f.fields.passwordConfirmation.value,'');
  assert.match(f.fields.authMessage.textContent,/Kayıt işlemi uygunsa/); page.dispose();
});

test('login and signup disable duplicate keyboard submissions during pending requests', async () => {
  for (const kind of ['login','register']) {
    const f = pageFixture(kind), wait = deferred();
    f.api[kind === 'login' ? 'signIn' : 'signUp'] = args => {f.calls.push(args); return wait.promise;};
    const page = mountAuthPage(f.options); await page.ready;
    const first = f.fields.authForm.emit('submit');
    await f.fields.authForm.emit('submit'); assert.equal(f.calls.length,1);
    assert.equal(f.fields.authSubmit.disabled,true); assert.equal(f.fields.authForm.attributes['aria-busy'],'true');
    if (kind === 'login') f.state = {status:'signed_in',user};
    wait.resolve({ok:true,...(kind === 'register' ? {status:'confirmation_pending'} : {userId:user.id})}); await first;
    assert.equal(f.fields.authSubmit.disabled,true); assert.equal(f.fields.password.value,'');
    assert.equal(f.fields.authForm.attributes['aria-busy'],'false'); page.dispose();
  }
});

test('login failure is controlled, retry enabled; profile failure keeps success message', async () => {
  const f = pageFixture('login');
  f.api.signIn = async () => ({ok:false,error:{code:'sign_in_failed',message:'raw account missing'}});
  const page = mountAuthPage(f.options); await page.ready;
  await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/Giriş yapılamadı/);
  assert.doesNotMatch(f.fields.authMessage.textContent,/raw account/);
  assert.equal(f.fields.authSubmit.disabled,false); assert.equal(f.fields.password.value,'');
  f.fields.password.value = 'twelve characters';
  f.api.signIn = async () => {f.state = {status:'signed_in',user}; return {ok:true,userId:user.id,profile:{ok:false,status:'username_conflict'}};};
  await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/Giriş başarılı/);
  assert.match(f.fields.profileMessage.textContent,/kullanıcı adı kullanılamıyor/); page.dispose();
});

test('existing session blocks login/register UI; unavailable Auth stays controlled', async () => {
  for (const kind of ['login','register']) {
    const f = pageFixture(kind); f.state = {status:'signed_in',user:session.user};
    const page = mountAuthPage(f.options); await page.ready;
    await f.fields.authForm.emit('submit'); assert.equal(f.calls.length,0);
    assert.match(f.fields.authMessage.textContent,/zaten bir oturum açık/); page.dispose();
  }
  const f = pageFixture('login'); f.api.initialize = async () => ({ok:false,error:{code:'auth_unavailable'}});
  const page = mountAuthPage(f.options); await page.ready;
  assert.equal(f.fields.authSubmit.disabled,true); assert.match(f.fields.authMessage.textContent,/kullanılamıyor/); page.dispose();
});

test('pagehide clears callback memory and prevents pending restore from enabling old UI', async () => {
  const f = pageFixture(), wait = deferred(); f.api.initialize = () => wait.promise;
  const page = mountAuthPage(f.options); await f.events.emit('pagehide');
  wait.resolve({ok:true}); await page.ready;
  await f.fields.authSubmit.emit('click'); assert.equal(f.calls.length,0);
  assert.equal(f.fields.authSubmit.disabled,true); page.dispose();
});

test('static Auth pages provide accessible local-only forms with safe callback referrer policy', () => {
  for (const name of ['giris','kayit','auth-callback']) {
    const html = readFileSync(new URL('../dist/'+name+'.html',import.meta.url),'utf8');
    assert.match(html,/<html lang="tr">/);
    assert.match(html,/role="alert" aria-live="polite"/);
    assert.match(html,/<button id="authSubmit" type="(?:submit|button)" disabled>/);
    assert.match(html,/<script src="backend.js" defer>/);
    assert.doesNotMatch(html,/(?:src|href)="(?:https?:)?\/\/|studyo\.html|profil\.html/);
    if (name === 'giris') assert.match(html,/<a href="\/sifremi-unuttum.html">Şifremi unuttum<\/a>/);
    assert.ok(html.indexOf('name="referrer" content="no-referrer"') < html.indexOf('<link'));
    for (const input of html.matchAll(/<input id="([^"]+)"[^>]*>/g)) {
      assert.ok(html.includes('<label for="'+input[1]+'">'));
      // LEGAL1 Terms checkbox: labelled, but autocomplete does not apply to checkboxes.
      if (!/type="checkbox"/.test(input[0])) assert.match(input[0],/autocomplete="(?:email|username|current-password|new-password)"/);
      if (input[1].startsWith('password')) assert.doesNotMatch(input[0],/maxlength/);
    }
  }
  assert.match(readFileSync(new URL('../dist/auth.css',import.meta.url),'utf8'),/:focus-visible/);
});

test('login reason allowlist displays exact controlled copy above the form, rejects unknown/duplicates',async()=>{
  const reasons={
    confirmation_pending:'Kaydın oluşturuldu. Devam etmek için e-posta adresine gönderdiğimiz doğrulama bağlantısını onayla.',
    email_not_confirmed:'E-posta adresini doğrulaman gerekiyor. Gelen kutundaki doğrulama bağlantısını kullan.',
  };
  for(const [reason,message] of Object.entries(reasons)){
    const f=pageFixture('login','?reason='+reason),page=mountAuthPage(f.options);await page.ready;
    assert.equal(f.fields.authMessage.textContent,message);assert.equal(f.fields.authSubmit.disabled,false);page.dispose();
  }
  for(const query of ['?reason=unknown','?reason=CONFIRMATION_PENDING','?reason=confirmation_pendingx','?reason=%3Cimg%20src=x%3E',
    '?reason=confirmation_pending&reason=confirmation_pending','?reason=email_not_confirmed&reason=confirmation_pending','?reason=confirmation_pending&reason=']){
    const f=pageFixture('login',query),page=mountAuthPage(f.options);await page.ready;assert.equal(f.fields.authMessage.textContent,'');page.dispose();
  }
  const html=readFileSync(new URL('../dist/giris.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('id="authMessage"')<html.indexOf('<form id="authForm"'));
});

test('signup with unexpected unconfirmed session cleans locally before fixed login replacement',async()=>{
  const f=fixture(),form=pageFixture('register','?next=https://attacker.test&email=private');
  const unconfirmed={...user,email_confirmed_at:undefined};const order=[];
  f.signupResult={data:{user:unconfirmed,session:{...session,user:unconfirmed}}};f.userResult={data:{user:unconfirmed}};
  f.client.auth.signOut=async options=>{assert.deepEqual(options,{scope:'local'});order.push('cleanup');f.emit('SIGNED_OUT',null);return {error:null};};
  form.options.api=f.api;form.options.location.replace=url=>order.push(url);
  const page=mountAuthPage(form.options);await page.ready;await form.fields.authForm.emit('submit');
  assert.deepEqual(order,['cleanup','/giris.html?reason=confirmation_pending']);assert.equal(f.auth.getState().status,'signed_out');
  assert.equal(f.calls.select.length,0);page.dispose();f.auth.dispose();
});

test('callback fixed studio replacement requires explicit click and accepts recoverable profile outcomes',async()=>{
  for(const profileStatus of ['ready','profile_incomplete','username_conflict','profile_error']){
    const f=pageFixture('callback');f.api.verifyEmail=async()=>{f.state={status:'signed_in',user};return {ok:true,userId:user.id,profile:{status:profileStatus}};};
    const page=mountAuthPage(f.options);await page.ready;assert.equal(f.calls.length,0);
    await f.fields.authSubmit.emit('click');assert.deepEqual(f.calls,[{kind:'replace',url:'/studyo.html'}]);
    assert.doesNotMatch(f.calls[0].url,/token|next|email|user/);page.dispose();
  }
});

test('callback failure codes and exceptions never navigate or expose raw errors',async()=>{
  for(const code of ['confirmation_invalid','confirmation_failed','email_not_confirmed','session_cleanup_failed','state_changed','user_validation_failed','throw']){
    const f=pageFixture('callback');f.api.verifyEmail=async()=>{if(code==='throw')throw Error('RAW secret');return {ok:false,error:{code,message:'RAW secret'}};};
    const page=mountAuthPage(f.options);await page.ready;await f.fields.authSubmit.emit('click');
    assert.equal(f.calls.length,0);assert.doesNotMatch(f.fields.authMessage.textContent,/RAW|fake-token/);assert.ok(f.fields.authMessage.textContent);page.dispose();
  }
});

test('callback UI rechecks authenticated same identity immediately before navigation',async()=>{
  for(const state of [{status:'signed_out',user:null},{status:'password_recovery',user},
    {status:'signed_in',user:{...user,id:'22222222-2222-4222-8222-222222222222'}}]){
    const f=pageFixture('callback');f.api.verifyEmail=async()=>{f.state=state;return {ok:true,userId:user.id,profile:{status:'ready'}};};
    const page=mountAuthPage(f.options);await page.ready;await f.fields.authSubmit.emit('click');
    assert.equal(f.calls.length,0);assert.match(f.fields.authMessage.textContent,/Oturum değişti/);page.dispose();
  }
});

test('B account during A callback verify or profile bootstrap blocks A navigation without logging B out',async()=>{
  for(const stage of ['verify','profile']){
    const f=fixture(),wait=deferred(),entered=deferred();const B={...user,id:'22222222-2222-4222-8222-222222222222'};
    if(stage==='verify')f.client.auth.verifyOtp=()=>{entered.resolve();return wait.promise;};
    else {let reads=0;f.client.auth.getUser=()=>++reads===1?Promise.resolve({data:{user}}):(entered.resolve(),wait.promise);}
    const form=pageFixture('callback');form.options.api=f.api;
    const page=mountAuthPage(form.options);await page.ready;const pending=form.fields.authSubmit.emit('click');await entered.promise;
    f.emit('SIGNED_IN',{...session,user:B});wait.resolve(stage==='verify'?{data:{user,session}}:{data:{user}});await pending;
    assert.equal(f.auth.getCurrentUser().id,B.id);assert.equal(form.calls.length,0);assert.match(form.fields.authMessage.textContent,/Oturum değişti/);
    assert.equal(f.calls.select.length,0);page.dispose();f.auth.dispose();
  }
});
