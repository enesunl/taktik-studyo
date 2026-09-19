const messages = {
  invalid_profile:'Kullanıcı adı 3–24 harf, rakam veya alt çizgi içermeli. Görünen ad en fazla 60 karakter olmalı; kontrol karakterleri kullanma.',
  username_conflict:'Bu kullanıcı adı kullanılıyor. Başka bir kullanıcı adı seç.',
  profile_load_failed:'Profil şu anda yüklenemedi. Biraz sonra tekrar dene.',
  profile_save_failed:'Profil şu anda güncellenemedi. Biraz sonra tekrar dene.',
  state_changed:'Oturum değişti. Devam etmek için sayfayı yeniden aç.',
  unauthenticated:'Devam etmek için giriş yap.',
};

export function mountProfile({document,api,validatedUser,current}) {
  const root = document.getElementById('profileContent');
  root.replaceChildren(document.getElementById('profileTemplate').content.cloneNode(true));
  const form = root.querySelector('form'), username = root.querySelector('#profileUsername');
  const displayName = root.querySelector('#profileDisplayName'), email = root.querySelector('#profileEmail');
  const status = root.querySelector('#profileStatus'), save = root.querySelector('#profileSave');
  const retry = root.querySelector('#profileRetry');
  let disposed = false, busy = false, loaded = false;
  const active = () => !disposed && current();
  email.textContent = validatedUser.email || '—';
  const apply = profile => {username.value = profile?.username || ''; displayName.value = profile?.display_name || '';};
  function loading(value) {
    busy = value; save.disabled = value; retry.disabled = value;
    form.inert = value; form.setAttribute('aria-busy',String(value));
    save.textContent = value ? 'Kaydediliyor…' : 'Değişiklikleri kaydet';
  }
  function error(result, fallback) {status.textContent = messages[result.error?.code] || messages[fallback];}
  async function load() {
    if (!active() || busy) return;
    loaded = false; form.hidden = true; retry.hidden = true; loading(true);
    status.textContent = 'Profil yükleniyor…';
    let result;
    try {result = await api.load();} catch {result = {ok:false};}
    if (!active()) return;
    loading(false);
    if (!result.ok) {error(result,'profile_load_failed'); retry.hidden = false; return;}
    apply(result.profile); loaded = true; form.hidden = false;
    status.textContent = result.profile ? '' : 'Profilini tamamlamak için bir kullanıcı adı seç ve kaydet.';
  }
  async function submit(event) {
    event.preventDefault();
    if (!active() || busy || !loaded) return;
    loading(true); status.textContent = 'Profil kaydediliyor…';
    let result;
    try {result = await api.save({username:username.value,display_name:displayName.value});}
    catch {result = {ok:false};}
    if (!active()) return;
    loading(false);
    if (!result.ok) {error(result,'profile_save_failed'); return;}
    apply(result.profile); status.textContent = 'Profilin güncellendi.';
  }
  function dispose() {
    if (disposed) return;
    disposed = true; form.hidden = true; form.inert = true; apply(null); email.textContent = ''; status.textContent = '';
    form.removeEventListener('submit',submit); retry.removeEventListener('click',load);
    root.replaceChildren();
  }
  form.addEventListener('submit',submit); retry.addEventListener('click',load);
  const ready = load();
  return {ready,dispose};
}
