import {consumeEmailLink, consumeOAuthReturn, isOAuthReturn, emailValid, usernameValid} from './auth-validation.js';
import {loginDestination, rememberOAuthNext, takeOAuthNext} from './auth-redirects.js';
import {mountTurnstile} from './turnstile.js';

const messages = {
  invalid_form:'Alanları kontrol et. Geçerli bir e-posta ve şifre gir.',
  invalid_username:'Kullanıcı adı 3–24 karakter olmalı; yalnızca A–Z, a–z, 0–9 ve _ kullanılabilir.',
  short_password:'Şifren en az 12 karakter olmalı.',
  password_mismatch:'Şifreler eşleşmiyor.',
  sign_in_failed:'Giriş yapılamadı. Bilgilerini kontrol edip tekrar dene.',
  email_not_confirmed:'E-posta adresini doğrulaman gerekiyor. Gelen kutundaki doğrulama bağlantısını kullan.',
  confirmation_pending:'Kaydın oluşturuldu. Devam etmek için e-posta adresine gönderdiğimiz doğrulama bağlantısını onayla.',
  state_changed:'Oturum değişti. Devam etmek için sayfayı yeniden aç.',
  session_cleanup_failed:'Oturum güvenli şekilde kapatılamadı. Giriş yapmadan önce çıkış işlemini yeniden dene.',
  sign_up_failed:'Kayıt işlemi tamamlanamadı. Biraz sonra tekrar dene.',
  terms_required:'Kayıt olmak için Kullanım Koşulları’nı kabul etmelisin.',
  confirmation_invalid:'Doğrulama bağlantısı geçersiz. E-postandaki bağlantıyı yeniden aç.',
  confirmation_failed:'Doğrulama tamamlanamadı. Bağlantı kullanılmış veya süresi dolmuş olabilir.',
  existing_session:'Bu tarayıcıda zaten bir oturum açık. Doğrulama için mevcut oturumdan çıkıp e-posta bağlantısını yeniden aç veya gizli pencere kullan.',
  captcha_required:'Devam etmek için güvenlik doğrulamasını tamamla.',
  captcha_failed:'Güvenlik doğrulaması yüklenemedi. Sayfayı yenileyip tekrar dene.',
  oauth_cancelled:'Google ile giriş iptal edildi. İstersen tekrar deneyebilirsin.',
  oauth_failed:'Google ile giriş tamamlanamadı. Giriş sayfasından tekrar dene.',
  oauth_unavailable:'Google ile giriş şu anda kullanılamıyor. E-posta ve şifrenle devam edebilirsin.',
  account_changed:'Farklı bir Google hesabıyla doğrulandın. Güvenliğin için oturum kapatıldı; doğru hesapla yeniden giriş yap.',
  callback_origin_not_allowed:'Bu adreste kayıt desteklenmiyor. taktikstudyo.com veya localhost:4173 kullan.',
  auth_unavailable:'Giriş ve kayıt şu anda kullanılamıyor.',
};
const profileMessages = {
  ready:'Profilin hazır.',
  profile_incomplete:'Oturumun açık; kullanıcı adı daha sonra tamamlanmalı.',
  username_conflict:'Oturumun açık; seçilen kullanıcı adı kullanılamıyor. Profil daha sonra tamamlanmalı.',
  profile_error:'Oturumun açık; profil şu anda hazırlanamadı. Daha sonra tekrar denenebilir.',
};

// Kept inside the bundle: no raw client, session or token is attached to window.
// storage: sessionStorage for the post-Google destination. captchaSiteKey: Auth Turnstile key (optional).
export function mountAuthPage({document, location, history, eventTarget, api, page, storage = null, captchaSiteKey = ''}) {
  const callback = page === 'callback';
  // Must happen synchronously, before the first await or Auth initialization.
  let tokenHash = null, validLink = false, oauth = null;
  if (callback && isOAuthReturn(location.search)) oauth = consumeOAuthReturn(location, history);
  else if (callback) {
    const link = consumeEmailLink(location, history);
    validLink = link.ok;
    if (link.ok) tokenHash = link.tokenHash;
  }
  const form = document.getElementById('authForm');
  const button = document.getElementById('authSubmit');
  const message = document.getElementById('authMessage');
  const profileMessage = document.getElementById('profileMessage');
  const googleBox = document.getElementById('oauthActions'), google = document.getElementById('googleAuth');
  let busy = false, initialized = false, finished = false, disposed = false;
  const field = id => document.getElementById(id);
  // SEC2.2: Supabase captchaToken flow. Sent only when the Auth key is configured; hosted CAPTCHA is enabled separately.
  let captcha = null;
  if (!callback && captchaSiteKey) {
    const host = document.createElement('div'); host.className = 'auth-captcha'; button.before(host);
    captcha = mountTurnstile({host, siteKey:captchaSiteKey, action:page === 'register' ? 'signup' : 'login',
      onChange:(token, failed) => {if (failed) error('captcha_failed');}});
  }
  const error = code => {message.textContent = messages[code] || 'İşlem tamamlanamadı. Biraz sonra tekrar dene.';};
  const clearPasswords = () => {
    for (const id of ['password','passwordConfirmation']) {const el = field(id); if (el) el.value = '';}
  };
  const existingSession = () => {
    const state = api.getState();
    return !!state.user || ['signed_in','password_recovery'].includes(state.status);
  };
  function blockExisting() {
    tokenHash = null; finished = true; button.disabled = true;
    if (callback) error('existing_session');
    else message.textContent = 'Bu tarayıcıda zaten bir oturum açık. Yeni bir giriş veya kayıt yapılmadı.';
  }
  button.disabled = true;
  async function submit(event) {
    event.preventDefault();
    if (disposed || busy || !initialized || finished) return;
    if (existingSession()) {blockExisting(); clearPasswords(); return;}
    if (!callback) {
      if (!emailValid(field('email').value.trim()) || !field('password').value) {error('invalid_form'); return;}
      if (page === 'register') {
        if (!usernameValid(field('username').value)) {error('invalid_username'); return;}
        if (field('password').value.length < 12) {error('short_password'); return;}
        if (field('password').value !== field('passwordConfirmation').value) {error('password_mismatch'); return;}
        // LEGAL1: separate, unchecked Terms control (contract acceptance, not personal-data consent).
        // SEC2.3: only the accepted Terms version is recorded; see auth-page-api signUp.
        if (field('termsAccepted')?.checked !== true) {error('terms_required'); return;}
      }
    }
    // Checked before the request so a missing captcha never clears what the user typed.
    if (captcha && !captcha.token()) {error('captcha_required'); return;}
    busy = true; button.disabled = true; form?.setAttribute('aria-busy','true');
    message.textContent = callback ? 'E-posta doğrulanıyor…' : 'İşlem sürüyor…';
    profileMessage.textContent = '';
    try {
      let result;
      if (callback) {
        const token = tokenHash; tokenHash = null; finished = true;
        result = await api.verifyEmail(token);
      } else {
        const credentials = {email:field('email').value.trim(),password:field('password').value,...(captcha?.token() ? {captchaToken:captcha.token()} : {})};
        if (page === 'register') Object.assign(credentials, {username:field('username').value, termsAccepted:true});
        result = await (page === 'register' ? api.signUp(credentials) : api.signIn(credentials));
      }
      if (disposed) return;
      if (!result.ok) {
        if (result.error?.code === 'existing_session') blockExisting();
        else error(result.error?.code);
        return;
      }
      if (!api.isCurrentResult(result)) {error('state_changed'); return;}
      if (callback || page === 'login') {
        const state = api.getState();
        if (!result.userId || state.status !== 'signed_in' || state.user?.id !== result.userId) {error('state_changed'); return;}
      }
      if (page === 'register' && result.status !== 'confirmation_pending') {error('sign_up_failed'); return;}
      finished = true;
      message.textContent = callback
        ? 'E-posta adresin doğrulandı. Bu cihazda oturumun açıldı. Diğer cihazlarda e-posta ve şifrenle giriş yapabilirsin.'
        : page === 'register'
          ? 'Kayıt işlemi uygunsa doğrulama bağlantısı e-posta adresine gönderildi. E-postandaki bağlantıyı açıp doğrulama düğmesine bas.'
          : 'Giriş başarılı. Bu tarayıcıda oturumun açık.';
      if (result.profile) profileMessage.textContent = profileMessages[result.profile.status] || profileMessages.profile_error;
      if (!api.isCurrentResult(result)) {error('state_changed'); profileMessage.textContent = ''; return;}
      if (page === 'login') location.assign(loginDestination(location.search));
      else if (page === 'register') location.replace('/giris.html?reason=confirmation_pending');
      else if (callback) location.replace('/studyo.html');
    } catch { if (!disposed) error(callback ? 'confirmation_failed' : page === 'register' ? 'sign_up_failed' : 'sign_in_failed'); }
    finally {
      busy = false; clearPasswords(); captcha?.reset();
      if (!disposed) {button.disabled = finished; form?.setAttribute('aria-busy','false');}
    }
  }
  async function startGoogle() {
    if (disposed || busy || !initialized || finished) return;
    if (existingSession()) {blockExisting(); return;}
    busy = true; button.disabled = google.disabled = true; message.textContent = 'Google’a yönlendiriliyorsun…';
    rememberOAuthNext(storage, page === 'login' ? loginDestination(location.search) : '/studyo.html');
    let result; try {result = await api.startGoogle();} catch {result = {ok:false, error:{code:'oauth_unavailable'}};}
    if (disposed || result.ok) return; // on success the browser is already leaving for Google
    busy = false; button.disabled = google.disabled = false; error(result.error?.code);
  }
  // Callback page, Google return: no button press is needed (the PKCE code only works in this browser).
  async function finishOAuth() {
    const heading = document.querySelector?.('h1'), intro = document.querySelector?.('.intro');
    if (heading) heading.textContent = 'Google ile giriş';
    if (intro) intro.textContent = 'Hesabın hazırlanıyor.';
    button.hidden = true; finished = true;
    if (!oauth.ok) {takeOAuthNext(storage); error(oauth.error.code); return;}
    message.textContent = 'Google ile giriş tamamlanıyor…';
    let result; try {result = await api.completeOAuth(oauth.code);} catch {result = {ok:false, error:{code:'oauth_failed'}};}
    if (disposed) return;
    const next = takeOAuthNext(storage);
    if (!result.ok) {error(result.error?.code === 'existing_session' ? 'existing_session' : result.error?.code || 'oauth_failed'); return;}
    if (!api.isCurrentResult(result)) {error('state_changed'); return;}
    message.textContent = 'Giriş başarılı. Yönlendiriliyorsun…';
    location.replace(next);
  }
  const target = callback ? button : form;
  const eventName = callback ? 'click' : 'submit';
  target.addEventListener(eventName,submit);
  google?.addEventListener('click',startGoogle);
  function dispose() {
    disposed = true; tokenHash = null; clearPasswords(); button.disabled = true; captcha?.dispose();
    target.removeEventListener(eventName,submit); google?.removeEventListener('click',startGoogle);
    eventTarget.removeEventListener('pagehide',dispose);
  }
  eventTarget.addEventListener('pagehide',dispose);
  const ready = (async () => {
    if (oauth) return finishOAuth();
    if (callback && !validLink) {finished = true; error('confirmation_invalid'); return;}
    try {
      const result = await api.initialize();
      if (disposed) return;
      if (!result.ok) {tokenHash = null; error(result.error?.code); return;}
      if (existingSession()) {blockExisting(); return;}
      initialized = true; button.disabled = false;
      // Shown only when the Auth server reports the Google provider as enabled.
      if (googleBox && google && !callback) void api.googleAvailable?.().then(on => {if (on && !disposed && !finished) {googleBox.hidden = false; google.disabled = false;}});
      message.textContent = callback ? 'Doğrulama yalnızca aşağıdaki düğmeye bastığında tamamlanır.' : '';
      if (page === 'login') {
        const reasons = new URLSearchParams(location.search).getAll('reason');
        if (reasons.length === 1 && ['email_not_confirmed','confirmation_pending'].includes(reasons[0])) error(reasons[0]);
      }
    } catch {tokenHash = null; if (!disposed) error('auth_unavailable');}
  })();
  return Object.freeze({ready,dispose});
}
