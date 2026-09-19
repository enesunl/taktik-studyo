import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountRecoveryPage} from '../src/lib/recovery-ui.js';
import {pageFixture,element} from './helpers/auth-fixture.mjs';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
function fixture(page = 'reset',search = '?token_hash=phase5-recovery-token-fixture&type=recovery') {
  const f = pageFixture(page,search);
  f.fields.recoveryLinks = element();
  f.options.location.pathname = page === 'reset' ? '/sifre-yenile.html' : '/sifremi-unuttum.html';
  f.api.requestPasswordReset = async args => {f.calls.push(['request',args]); return {ok:true,status:'recovery_requested'};};
  f.api.completePasswordRecovery = async args => {f.calls.push(['complete',args]); return {ok:true,status:'password_updated'};};
  return f;
}

test('reset mount synchronously sanitizes URL and never consumes token until explicit submit', async () => {
  const f = fixture(), wait = deferred();
  f.api.initialize = () => {assert.deepEqual(f.historyCalls,[[null,'','/sifre-yenile.html']]); return wait.promise;};
  const page = mountRecoveryPage(f.options);
  assert.equal(f.calls.length,0); assert.equal(f.fields.authSubmit.disabled,true);
  wait.resolve({ok:true}); await page.ready;
  assert.equal(f.calls.length,0); assert.equal(f.fields.authSubmit.disabled,false);
  await f.fields.authForm.emit('submit');
  assert.deepEqual(f.calls,[['complete',{tokenHash:'phase5-recovery-token-fixture',password:' twelve chars '}]]);
  assert.match(f.fields.authMessage.textContent,/Şifren güncellendi/);
  assert.equal(f.fields.password.value,''); assert.equal(f.fields.passwordConfirmation.value,'');
  assert.doesNotMatch(JSON.stringify(page),/phase5-|session|token/); page.dispose();
});

test('reset UI password mismatch and short password do not consume token or send confirmation', async () => {
  const f = fixture(), page = mountRecoveryPage(f.options); await page.ready;
  f.fields.password.value = 'short'; await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/12 karakter/);
  f.fields.password.value = 'a'.repeat(256); await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/eşleşmiyor/); assert.equal(f.calls.length,0);
  f.fields.passwordConfirmation.value = f.fields.password.value; await f.fields.authForm.emit('submit');
  assert.equal(f.calls.length,1); assert.equal('passwordConfirmation' in f.calls[0][1],false); page.dispose();
});

test('forgot password uses email-only keyboard submit, validates locally and displays generic success', async () => {
  const f = fixture('forgot'), page = mountRecoveryPage(f.options); await page.ready;
  f.fields.email.value = 'invalid'; await f.fields.authForm.emit('submit');
  assert.match(f.fields.authMessage.textContent,/Geçerli bir e-posta/); assert.equal(f.calls.length,0);
  f.fields.email.value = ' user@example.test '; await f.fields.authForm.emit('submit');
  assert.deepEqual(f.calls,[['request',{email:'user@example.test'}]]);
  assert.equal(f.fields.authMessage.textContent,'Eğer bu e-posta ile bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.');
  assert.equal(f.historyCalls.length,0); page.dispose();
});

test('recovery forms prevent double submit; reset hides navigation during the single API operation', async () => {
  for (const kind of ['forgot','reset']) {
    const f = fixture(kind), wait = deferred();
    f.api[kind === 'forgot' ? 'requestPasswordReset' : 'completePasswordRecovery'] = args => {f.calls.push(args); return wait.promise;};
    const page = mountRecoveryPage(f.options); await page.ready;
    const submitting = f.fields.authForm.emit('submit'); await f.fields.authForm.emit('submit');
    assert.equal(f.calls.length,1); assert.equal(f.fields.authSubmit.disabled,true);
    assert.equal(f.fields.recoveryLinks.hidden,true); assert.equal(f.fields.authForm.attributes['aria-busy'],'true');
    wait.resolve({ok:true}); await submitting;
    assert.equal(f.fields.recoveryLinks.hidden,false); assert.equal(f.fields.authForm.attributes['aria-busy'],'false');
    await f.fields.authForm.emit('submit'); assert.equal(f.calls.length,1); page.dispose();
  }
});

test('request errors including CAPTCHA use controlled text and allow resubmission', async () => {
  for (const code of ['recovery_request_failed','captcha_required','unknown_private_code']) {
    const f = fixture('forgot'); f.api.requestPasswordReset = async () => ({ok:false,error:{code,message:'RAW ACCOUNT NOT FOUND'}});
    const page = mountRecoveryPage(f.options); await page.ready; await f.fields.authForm.emit('submit');
    assert.doesNotMatch(f.fields.authMessage.textContent,/RAW|NOT FOUND|unknown_private/);
    assert.equal(f.fields.authSubmit.disabled,false); page.dispose();
  }
});

test('recovery update/cleanup failures never promise reuse or expose raw errors; completion stays disabled', async () => {
  for (const result of [{ok:false,error:{code:'password_update_failed',message:'RAW SECRET'}},
    {ok:false,error:{code:'recovery_cleanup_failed'},passwordUpdated:true},
    {ok:false,error:{code:'recovery_cleanup_failed'},passwordUpdated:false}]) {
    const f = fixture(); f.api.completePasswordRecovery = async () => result;
    const page = mountRecoveryPage(f.options); await page.ready; await f.fields.authForm.emit('submit');
    assert.doesNotMatch(f.fields.authMessage.textContent,/RAW|phase5-|twelve chars/);
    if (result.passwordUpdated) assert.match(f.fields.authMessage.textContent,/Şifren güncellendi ancak/);
    else assert.doesNotMatch(f.fields.authMessage.textContent,/Şifren güncellendi/);
    assert.equal(f.fields.authSubmit.disabled,true); page.dispose();
  }
});

test('existing login/recovery at mount or just before submit blocks recovery UI without API delegation', async () => {
  for (const kind of ['forgot','reset']) for (const atMount of [true,false]) for (const status of ['signed_in','password_recovery']) {
    const f = fixture(kind);
    if (atMount) f.state = {status,user:null};
    const page = mountRecoveryPage(f.options); await page.ready;
    f.state = {status,user:null}; await f.fields.authForm.emit('submit');
    assert.equal(f.calls.length,0); assert.match(f.fields.authMessage.textContent,/zaten bir oturum açık/);
    assert.equal(f.fields.authSubmit.disabled,true); page.dispose();
  }
});

test('invalid token/unavailable Auth and pagehide cannot enable a stale reset form', async () => {
  const invalid = fixture('reset','?token_hash=x&type=email');
  const page = mountRecoveryPage(invalid.options); await page.ready;
  await invalid.fields.authForm.emit('submit'); assert.equal(invalid.calls.length,0); page.dispose();
  const f = fixture(), wait = deferred(); f.api.initialize = () => wait.promise;
  const stale = mountRecoveryPage(f.options); await f.events.emit('pagehide');
  wait.resolve({ok:true}); await stale.ready; await f.fields.authForm.emit('submit');
  assert.equal(f.calls.length,0); assert.equal(f.fields.authSubmit.disabled,true); stale.dispose();
  const offline = fixture(); offline.api.initialize = async () => ({ok:false,error:{code:'auth_unavailable'}});
  const offlinePage = mountRecoveryPage(offline.options); await offlinePage.ready;
  assert.equal(offline.fields.authSubmit.disabled,true); offlinePage.dispose();
});

test('recovery UI never puts token in DOM, storage, cookies, logs or navigation', async () => {
  const f = fixture();
  for (const property of ['localStorage','sessionStorage','console'])
    Object.defineProperty(f.events,property,{get(){throw Error('Forbidden access');}});
  Object.defineProperty(f.options.document,'cookie',{set(){throw Error('Forbidden cookie');}});
  for (const el of Object.values(f.fields)) {
    Object.defineProperty(el,'innerHTML',{set(){throw Error('Forbidden HTML');}});
    Object.defineProperty(el,'dataset',{get(){throw Error('Forbidden dataset');}});
  }
  const page = mountRecoveryPage(f.options); await page.ready; await f.fields.authForm.emit('submit');
  assert.doesNotMatch(JSON.stringify(f.fields),/phase5-recovery-token-fixture/); page.dispose();
  const source = readFileSync(new URL('../src/lib/recovery-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:localStorage|sessionStorage|console)\s*[.[]|\.innerHTML|\.cookie|\.dataset|location\.(?:href|assign|replace)/);
});

test('recovery HTML uses local-only assets, early no-referrer and accessible forms', () => {
  for (const name of ['sifremi-unuttum','sifre-yenile']) {
    const html = readFileSync(new URL('../dist/'+name+'.html',import.meta.url),'utf8');
    assert.match(html,/<html lang="tr">/); assert.match(html,/role="alert" aria-live="polite"/);
    assert.match(html,/<form id="authForm">/); assert.match(html,/<button id="authSubmit" type="submit" disabled>/);
    assert.match(html,/<script src="backend.js" defer>/); assert.match(html,/<link rel="stylesheet" href="auth.css">/);
    assert.doesNotMatch(html,/(?:src|href)="(?:https?:)?\/\/|studyo\.html|profil\.html/);
    assert.ok(html.indexOf('name="referrer" content="no-referrer"') < html.indexOf('<link'));
    for (const input of html.matchAll(/<input id="([^"]+)"[^>]*>/g)) {
      assert.ok(html.includes('<label for="'+input[1]+'">'));
      assert.match(input[0],/autocomplete="(?:email|new-password)"/);
      if (input[1].startsWith('password')) {assert.match(input[0],/minlength="12"/); assert.doesNotMatch(input[0],/maxlength/);}
    }
  }
});
