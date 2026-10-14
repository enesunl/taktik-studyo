import {ACCOUNT_DELETE_CONFIRMATION} from './account-delete.js';

const messages = {
  reauthentication_failed:'Şifre doğrulanamadı. Hesabın silinmedi.',
  confirmation_mismatch:'Onay metni eşleşmiyor. Hesabın silinmedi.',
  unauthenticated:'Oturumun geçersiz veya süresi dolmuş. Yeniden giriş yapıp tekrar dene. Hesabın silinmedi.',
  rate_limited:'Çok fazla deneme yapıldı. Biraz sonra tekrar dene. Hesabın silinmedi.',
  delete_failed:'Hesap silinemedi. Verilerinde değişiklik yapılmadı; biraz sonra tekrar dene.',
  verification_failed:'Silme işlemi başlatıldı ancak tamamlandığı doğrulanamadı. Lütfen iletisim@taktikstudyo.com adresine yaz.',
  network:'Sunucudan yanıt alınamadı. Hesabının silinip silinmediği doğrulanamadı; sayfayı yenileyip yeniden giriş yapmayı dene.',
  unknown:'Sunucudan beklenmeyen bir yanıt alındı. Hesabının silinip silinmediği doğrulanamadı; sayfayı yenileyip yeniden giriş yapmayı dene.',
};
const unavailable = 'Hesap silme şu anda kullanılamıyor. Hesabın silinmedi.';
// Turkish keyboards may produce "İ" for the capital I in "SIL".
export const confirmationMatches = value => typeof value === 'string' && value.trim().replace(/İ/g,'I') === ACCOUNT_DELETE_CONFIRMATION;

// Profile → Hesap → Tehlikeli Bölge. Nothing is sent until the user re-enters the password, types the
// confirmation and presses the final button; success is shown only after the server confirms.
export function mountAccountDeletion({document, root, deleteAccount, onDeleted, current = () => true}) {
  let disposed = false, busy = false, done = false;
  const off = [], active = () => !disposed && current();
  const el = (tag, cls, text) => {const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n;};
  const listen = (n, event, fn) => {n.addEventListener(event, fn); off.push(() => n.removeEventListener(event, fn));};
  const list = items => {const ul = el('ul'); for (const item of items) ul.append(el('li', null, item)); return ul;};

  const title = el('h3', 'profile-danger-title', 'Tehlikeli Bölge');
  const text = el('p', 'profile-help', 'Hesabını ve hesabına bağlı kayıtları kalıcı olarak silebilirsin. Bu işlem geri alınamaz.');
  const open = el('button', 'profile-danger-button', 'Hesabımı Sil'); open.type = 'button';
  open.setAttribute('aria-haspopup', 'dialog');

  const dialog = el('dialog', 'account-delete-dialog'); dialog.id = 'accountDeleteDialog';
  dialog.setAttribute('aria-labelledby', 'accountDeleteTitle'); dialog.setAttribute('aria-describedby', 'accountDeleteIntro');
  const form = el('form', 'account-delete-form'); form.noValidate = true;
  const heading = el('h2', null, 'Hesabını kalıcı olarak sil'); heading.id = 'accountDeleteTitle';
  const intro = el('p', 'account-delete-intro', 'Bu işlem geri alınamaz. Devam etmeden önce saklamak istediğin çalışmaların görsellerini indir.'); intro.id = 'accountDeleteIntro';
  const deleted = list(['Hesabın ve giriş bilgilerin', 'Profilin: kullanıcı adı, görünen ad ve favori takım', 'Kayıtlı Stüdyo çalışmaların', 'Haftanın İlk 11’i kayıtların', 'Oyuncu düzeltmelerin', 'Oluşturduğun paylaşım bağlantıları (artık açılmaz)']);
  const kept = list(['Bu cihazdaki oturumun ve taslakların temizlenir; başka cihazlardaki tarayıcılarda kalan taslaklar orada silinene kadar durur.', 'Hizmet sağlayıcılarımızın yedeklerinde ve sistem kayıtlarında bulunabilecek kopyalar, sağlayıcıların saklama süreleri sonunda silinir.', 'Daha önce indirdiğin PNG görselleri cihazında kalır.']);
  const passwordLabel = el('label', null, 'Şifren'); passwordLabel.htmlFor = 'accountDeletePassword';
  const password = el('input'); password.id = 'accountDeletePassword'; password.type = 'password'; password.autocomplete = 'current-password'; password.required = true;
  const confirmLabel = el('label', null, `Onaylamak için ${ACCOUNT_DELETE_CONFIRMATION} yaz`); confirmLabel.htmlFor = 'accountDeleteConfirm';
  const confirm = el('input'); confirm.id = 'accountDeleteConfirm'; confirm.type = 'text'; confirm.autocomplete = 'off'; confirm.spellcheck = false; confirm.required = true;
  confirm.setAttribute('autocapitalize', 'characters');
  const status = el('p', 'account-delete-status'); status.setAttribute('role', 'alert'); status.setAttribute('aria-live', 'assertive');
  const actions = el('div', 'account-delete-actions');
  const cancel = el('button', null, 'Vazgeç'); cancel.type = 'button';
  const submit = el('button', 'profile-danger-button', 'Hesabımı kalıcı olarak sil'); submit.type = 'submit';
  actions.append(cancel, submit);
  form.append(heading, intro, el('h3', null, 'Silinecekler'), deleted, el('h3', null, 'Bilmen gerekenler'), kept, passwordLabel, password, confirmLabel, confirm, status, actions);
  dialog.append(form);
  root.replaceChildren(title, text, open, dialog);

  function controls() {
    const ready = !!password.value && confirmationMatches(confirm.value);
    submit.disabled = busy || done || !ready;
    cancel.disabled = password.disabled = confirm.disabled = busy || done;
    open.disabled = busy || done;
    form.setAttribute('aria-busy', String(busy));
  }
  function show() {
    if (!active() || busy || done) return;
    password.value = confirm.value = ''; status.textContent = ''; controls();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    password.focus();
  }
  function hide() {
    if (busy || done) return;
    password.value = confirm.value = ''; status.textContent = '';
    if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    if (active()) open.focus();
  }
  async function submitForm(event) {
    event.preventDefault();
    if (!active() || busy || done || !password.value || !confirmationMatches(confirm.value)) return;
    busy = true; status.textContent = 'Hesabın siliniyor…'; controls();
    let result;
    try {result = await deleteAccount({password:password.value, confirmation:ACCOUNT_DELETE_CONFIRMATION});} catch {result = {ok:false, code:'network'};}
    if (!active()) return;
    busy = false;
    if (!result?.ok) {
      password.value = '';
      status.textContent = messages[result?.code] || unavailable;
      controls(); password.focus();
      return;
    }
    done = true; controls();
    status.textContent = 'Hesabın silindi. Ana sayfaya yönlendiriliyorsun.';
    await onDeleted?.();
  }
  listen(open, 'click', show);
  listen(cancel, 'click', hide);
  listen(password, 'input', controls);
  listen(confirm, 'input', controls);
  listen(form, 'submit', submitForm);
  listen(dialog, 'cancel', event => {event.preventDefault(); hide();});
  controls();
  return {dispose() {
    if (disposed) return; disposed = true;
    for (const remove of off) remove();
    password.value = confirm.value = '';
    try {if (dialog.open && typeof dialog.close === 'function') dialog.close();} catch {}
    root.replaceChildren();
  }};
}
