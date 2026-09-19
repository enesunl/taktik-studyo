import {resolvePage} from './page-routes.js';
import {createProtectedPage} from './protected-page.js';
import {chooseLegacyDrafts} from './legacy-import-ui.js';
import {mountLanding} from './landing-ui.js';

export function startPage({auth,document,window,backend}) {
  const route = resolvePage(window.location);
  if (route.kind === 'shared' || route.kind === 'share_error') {
    // No Auth initialization, validation, profile bootstrap or user draft scope.
    return window.TAKTIK_APP.mountShared(route);
  }
  if (route.kind === 'landing') {
    document.getElementById('landing').hidden = false;
    return mountLanding({auth,document,eventTarget:window});
  }
  if (route.kind !== 'protected') return;
  const content = document.getElementById('protectedContent');
  const status = document.getElementById('guardStatus'), message = document.getElementById('guardMessage');
  const retry = document.getElementById('guardRetry'), login = document.getElementById('guardLogin');
  const logout = document.getElementById('signOut');
  let storage;
  try {storage = window.localStorage;} catch {storage = {getItem(){return null;},setItem(){throw Error('Storage unavailable');}};}
  const guard = createProtectedPage({auth,storage,path:route.path,navigate:url => window.location.replace(url),
    show(state) {
      const ready = state === 'ready';
      content.hidden = !ready; content.inert = !ready; status.hidden = ready;
      retry.hidden = login.hidden = state === 'pending';
      message.textContent = state === 'pending' ? 'Oturum doğrulanıyor…'
        : state === 'logout_error' ? 'Çıkış yapılamadı. Tekrar deneyebilir veya giriş sayfasına gidebilirsin.'
        : 'Oturum şu anda doğrulanamadı. Biraz sonra tekrar dene.';
    },
    async mount(scope,current) {
      if (route.page === 'profile') return () => {};
      await chooseLegacyDrafts({scope,slots:route.page === 'studio' ? ['main'] : ['left','right'],
        document,container:document.getElementById('legacyImport')});
      if (!current()) return;
      await backend.loadCatalogue();
      if (!current()) return;
      return route.page === 'studio'
        ? window.TAKTIK_APP.mountStudio(document.getElementById('studioRoot'),scope)
        : window.TAKTIK_COMPARISON.mount(scope);
    },
  });
  const signOut = () => {void guard.signOut();}, tryAgain = () => {void guard.retry();};
  logout.addEventListener('click',signOut); retry.addEventListener('click',tryAgain);
  function dispose() {
    guard.dispose(); logout.removeEventListener('click',signOut); retry.removeEventListener('click',tryAgain);
    window.removeEventListener('pagehide',dispose);
  }
  window.addEventListener('pagehide',dispose);
  return {ready:guard.start(),dispose};
}
