import {consumeRecoveryLink, emailValid} from './auth-validation.js';

const messages = {
  invalid_form:'Geçerli bir e-posta adresi gir.',
  short_password:'Yeni şifren en az 12 karakter olmalı.',
  password_mismatch:'Şifreler eşleşmiyor.',
  existing_session:'Bu tarayıcıda zaten bir oturum açık. Mevcut oturumdan çıkıp bağlantıyı yeniden aç veya gizli pencere kullan.',
  captcha_required:'Auth güvenlik doğrulaması bu sürümde henüz bağlanmadı. İşlem şu anda tamamlanamıyor.',
  recovery_invalid:'Sıfırlama bağlantısı veya bu adres geçersiz. Yeni bir sıfırlama bağlantısı iste.',
  recovery_failed:'Sıfırlama bağlantısı doğrulanamadı. Yeni bir sıfırlama bağlantısı iste.',
  password_update_failed:'Şifre güncellenemedi. Yeni bir sıfırlama bağlantısı iste.',
  recovery_cleanup_failed:'Oturum güvenli şekilde kapatılamadı. Bu sekmeyi kapat; yeniden denemek için gizli pencere kullan.',
  state_changed:'İşlem sırasında oturum değişti. İşlem güvenle tamamlanamadı. Yeni bir sıfırlama bağlantısı iste.',
};

export function mountRecoveryPage({document,location,history,eventTarget,api,page}) {
  const reset = page === 'reset';
  let tokenHash = null, validLink = false;
  if (reset) {
    const link = consumeRecoveryLink(location,history);
    validLink = link.ok; if (link.ok) tokenHash = link.tokenHash;
  }
  const field = id => document.getElementById(id);
  const form = field('authForm'), button = field('authSubmit'), message = field('authMessage');
  let busy = false, initialized = false, finished = false, disposed = false;
  const error = code => {message.textContent = messages[code] || 'İstek şu anda tamamlanamadı. Biraz sonra tekrar dene.';};
  const hasSession = () => !!api.getState().user || ['signed_in','password_recovery'].includes(api.getState().status);
  const clearPasswords = () => {for (const id of ['password','passwordConfirmation']) if (field(id)) field(id).value = '';};
  const block = () => {tokenHash = null; finished = true; button.disabled = true; error('existing_session');};
  button.disabled = true;
  async function submit(event) {
    event.preventDefault();
    if (disposed || busy || !initialized || finished) return;
    if (hasSession()) {block(); clearPasswords(); return;}
    if (reset) {
      if (field('password').value.length < 12) {error('short_password'); return;}
      if (field('password').value !== field('passwordConfirmation').value) {error('password_mismatch'); return;}
    } else if (!emailValid(field('email').value.trim())) {error('invalid_form'); return;}
    busy = true; button.disabled = true; form.setAttribute('aria-busy','true');
    message.textContent = reset ? 'Şifre güncelleniyor… Bu sayfayı kapatma.' : 'İstek gönderiliyor…';
    // Avoid offering in-page navigation between verify, update and cleanup.
    const navigation = field('recoveryLinks'); if (navigation) navigation.hidden = true;
    try {
      let result;
      if (reset) {
        const token = tokenHash; tokenHash = null; finished = true;
        result = await api.completePasswordRecovery({tokenHash:token,password:field('password').value});
      } else result = await api.requestPasswordReset({email:field('email').value.trim()});
      if (disposed) return;
      if (!result.ok) {
        if (result.error?.code === 'existing_session') block();
        else if (result.error?.code === 'recovery_cleanup_failed' && result.passwordUpdated)
          message.textContent = 'Şifren güncellendi ancak oturum güvenli şekilde kapatılamadı. Bu sekmeyi kapat; giriş için gizli pencere kullan.';
        else error(result.error?.code);
        return;
      }
      finished = true;
      message.textContent = reset ? 'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.'
        : 'Eğer bu e-posta ile bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.';
    } catch {if (!disposed) error(reset ? 'password_update_failed' : 'recovery_request_failed');}
    finally {
      busy = false; clearPasswords();
      if (!disposed) {
        button.disabled = finished; form.setAttribute('aria-busy','false');
        if (navigation) navigation.hidden = false;
      }
    }
  }
  form.addEventListener('submit',submit);
  function dispose() {
    disposed = true; tokenHash = null; clearPasswords(); button.disabled = true;
    form.removeEventListener('submit',submit); eventTarget.removeEventListener('pagehide',dispose);
  }
  eventTarget.addEventListener('pagehide',dispose);
  const ready = (async () => {
    if (reset && !validLink) {finished = true; error('recovery_invalid'); return;}
    try {
      const result = await api.initialize();
      if (disposed) return;
      if (!result.ok) {tokenHash = null; error(result.error?.code); return;}
      if (hasSession()) {block(); return;}
      initialized = true; button.disabled = false;
      message.textContent = reset ? 'Yeni şifreni girip formu gönderdiğinde sıfırlama işlemi tamamlanır.' : '';
    } catch {tokenHash = null; if (!disposed) error('auth_unavailable');}
  })();
  return Object.freeze({ready,dispose});
}
