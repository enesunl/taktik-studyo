import {consumeEmailLink, emailValid, usernameValid} from './auth-validation.js';
import {loginDestination} from './auth-redirects.js';

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
  confirmation_invalid:'Doğrulama bağlantısı geçersiz. E-postandaki bağlantıyı yeniden aç.',
  confirmation_failed:'Doğrulama tamamlanamadı. Bağlantı kullanılmış veya süresi dolmuş olabilir.',
  existing_session:'Bu tarayıcıda zaten bir oturum açık. Doğrulama için mevcut oturumdan çıkıp e-posta bağlantısını yeniden aç veya gizli pencere kullan.',
  captcha_required:'Auth güvenlik doğrulaması bu sürümde henüz bağlanmadı. İşlem şu anda tamamlanamıyor.',
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
export function mountAuthPage({document, location, history, eventTarget, api, page}) {
  const callback = page === 'callback';
  // Must happen synchronously, before the first await or Auth initialization.
  let tokenHash = null, validLink = false;
  if (callback) {
    const link = consumeEmailLink(location, history);
    validLink = link.ok;
    if (link.ok) tokenHash = link.tokenHash;
  }
  const form = document.getElementById('authForm');
  const button = document.getElementById('authSubmit');
  const message = document.getElementById('authMessage');
  const profileMessage = document.getElementById('profileMessage');
  let busy = false, initialized = false, finished = false, disposed = false;
  const field = id => document.getElementById(id);
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
      }
    }
    busy = true; button.disabled = true; form?.setAttribute('aria-busy','true');
    message.textContent = callback ? 'E-posta doğrulanıyor…' : 'İşlem sürüyor…';
    profileMessage.textContent = '';
    try {
      let result;
      if (callback) {
        const token = tokenHash; tokenHash = null; finished = true;
        result = await api.verifyEmail(token);
      } else {
        const credentials = {email:field('email').value.trim(),password:field('password').value};
        if (page === 'register') credentials.username = field('username').value;
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
      busy = false; clearPasswords();
      if (!disposed) {button.disabled = finished; form?.setAttribute('aria-busy','false');}
    }
  }
  const target = callback ? button : form;
  const eventName = callback ? 'click' : 'submit';
  target.addEventListener(eventName,submit);
  function dispose() {
    disposed = true; tokenHash = null; clearPasswords(); button.disabled = true;
    target.removeEventListener(eventName,submit);
    eventTarget.removeEventListener('pagehide',dispose);
  }
  eventTarget.addEventListener('pagehide',dispose);
  const ready = (async () => {
    if (callback && !validLink) {finished = true; error('confirmation_invalid'); return;}
    try {
      const result = await api.initialize();
      if (disposed) return;
      if (!result.ok) {tokenHash = null; error(result.error?.code); return;}
      if (existingSession()) {blockExisting(); return;}
      initialized = true; button.disabled = false;
      message.textContent = callback ? 'Doğrulama yalnızca aşağıdaki düğmeye bastığında tamamlanır.' : '';
      if (page === 'login') {
        const reasons = new URLSearchParams(location.search).getAll('reason');
        if (reasons.length === 1 && ['email_not_confirmed','confirmation_pending'].includes(reasons[0])) error(reasons[0]);
      }
    } catch {tokenHash = null; if (!disposed) error('auth_unavailable');}
  })();
  return Object.freeze({ready,dispose});
}
