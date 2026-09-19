import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {pageFixture,session} from './helpers/auth-fixture.mjs';
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
  verification.resolve({ok:true,profile:{status:'ready'}}); await click;
  assert.match(f.fields.authMessage.textContent,/doğrulandı/);
  assert.match(f.fields.authMessage.textContent,/Diğer cihazlarda/);
  assert.doesNotMatch(JSON.stringify(page),/token|session/);
  await f.fields.authSubmit.emit('click'); assert.equal(f.calls.length,1);
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

test('callback never uses local/session storage, console, innerHTML or navigation', async () => {
  const f = pageFixture();
  for (const property of ['localStorage','sessionStorage','console']) {
    Object.defineProperty(f.options.eventTarget,property,{get(){throw Error(property+' forbidden');}});
  }
  for (const el of Object.values(f.fields)) Object.defineProperty(el,'innerHTML',{set(){throw Error('unsafe HTML');}});
  const page = mountAuthPage(f.options); await page.ready; await f.fields.authSubmit.emit('click'); page.dispose();
  for (const file of ['auth-ui.js','auth-validation.js','auth-page-api.js','profile-bootstrap.js']) {
    const source = readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|console)\s*[.[]|\.innerHTML\s*=|location\.(?:href|assign|replace)\s*[=(]/);
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
  assert.deepEqual(f.calls,[{kind:'signup',args:{email:'test@example.test',password:' twelve chars ',username:'Name_1'}}]);
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
    wait.resolve({ok:true}); await first;
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
  f.api.signIn = async () => ({ok:true,profile:{ok:false,status:'username_conflict'}});
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
      assert.match(input[0],/autocomplete="(?:email|username|current-password|new-password)"/);
      if (input[1].startsWith('password')) assert.doesNotMatch(input[0],/maxlength/);
    }
  }
  assert.match(readFileSync(new URL('../dist/auth.css',import.meta.url),'utf8'),/:focus-visible/);
});
