import {resolvePage} from './page-routes.js';
import {createProtectedPage} from './protected-page.js';
import {mountLanding} from './landing-ui.js';
import {createProfileApi} from './profile-api.js';
import {mountProfile} from './profile-ui.js';
import {createMatchesApi} from './matches.js';
import {mountMatches} from './matches-ui.js';
import {createMatchDetailApi} from './match-detail.js';
import {mountMatchDetail} from './match-detail-ui.js';

export function startPage({auth,document,window,backend,client}) {
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
  const drafts = route.page === 'studio' || route.page === 'comparison';
  if (drafts) {
    try {storage = window.localStorage;} catch {storage = {getItem(){return null;},setItem(){throw Error('Storage unavailable');}};}
  }
  const guard = createProtectedPage({auth,storage,drafts,path:route.path,navigate:url => window.location.replace(url),
    show(state) {
      const ready = state === 'ready';
      content.hidden = !ready; content.inert = !ready; status.hidden = ready;
      retry.hidden = login.hidden = state === 'pending';
      message.textContent = state === 'pending' ? 'Oturum doğrulanıyor…'
        : state === 'logout_error' ? 'Çıkış yapılamadı. Tekrar deneyebilir veya giriş sayfasına gidebilirsin.'
        : 'Oturum şu anda doğrulanamadı. Biraz sonra tekrar dene.';
    },
    async mount(scope,current,validatedUser) {
      if (route.page === 'match') {
        return mountMatchDetail({document,window,current,api:createMatchDetailApi({client,current,location:window.location})}).dispose;
      }
      if (route.page === 'matches') {
        return mountMatches({document,window,current,api:createMatchesApi({client,current,location:window.location})}).dispose;
      }
      if (route.page === 'profile') {
        const api = createProfileApi({client,validatedUser,current});
        return mountProfile({document,api,validatedUser,current}).dispose;
      }
      // Open the user's own draft directly. Device-wide legacy drafts are
      // neither imported nor deleted as a side effect of opening a board.
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
