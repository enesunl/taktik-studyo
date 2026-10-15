import {shortPlayerLabel} from './player-label.js';
import {mountBoardTacticalTools,drawingStrokes} from './board-tactical-tools.js';
import {loadFavoriteTeam} from './favorite-team.js';
import {mountOnboarding} from './onboarding-ui.js';
import {createCanonicalCatalogue} from './catalogue-canonical.js';
import {createOnboardingGate} from './onboarding.js';
import {mountWeeklyXI} from './weekly-xi-ui.js';
import {createWeeklyStore} from './weekly-xi.js';
import {createWeeklyLineups} from './weekly-lineups.js';
import {mountWeeklyCollection} from './weekly-lineups-ui.js';
import {createStudioProjects} from './studio-projects.js';
import {mountStudioProjects} from './studio-projects-ui.js';
import {resolvePage} from './page-routes.js';
import {createProtectedPage} from './protected-page.js';
import {mountLanding} from './landing-ui.js';
import {createProfileApi} from './profile-api.js';
import {mountProfile} from './profile-ui.js';
import {createMatchesApi} from './matches.js';
import {mountMatches} from './matches-ui.js';
import {createMatchDetailApi} from './match-detail.js';
import {mountMatchDetail} from './match-detail-ui.js';
import {mountMatchStudio} from './match-studio-ui.js';
import {createPlayerOverrides} from './player-overrides.js';
import {clearUserData} from './account-delete.js';

export function startPage({auth,document,window,backend,client,accountDeletion}) {
  const route = resolvePage(window.location);
  if(route.kind === 'retired') {window.location.replace(route.destination);return;}
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
  const drafts = route.page === 'studio';
  if (drafts) {
    try {storage = window.localStorage;} catch {storage = {getItem(){return null;},setItem(){throw Error('Storage unavailable');}};}
  }
  const guard = createProtectedPage({auth,storage,drafts,path:route.path,navigate:url => window.location.replace(url),
    beforeMount:client?createOnboardingGate({path:route.path,createApi:(validatedUser,current)=>createProfileApi({client,validatedUser,current})}):undefined,
    show(state) {
      const ready = state === 'ready';
      status.setAttribute('data-state',state);status.setAttribute('aria-busy',String(state==='pending'));
      content.hidden = !ready; content.inert = !ready; status.hidden = ready;
      retry.hidden = login.hidden = state === 'pending';
      message.textContent = state === 'pending' ? 'Sayfa hazırlanıyor…'
        : state === 'page_error' ? 'Sayfa verileri şu anda yüklenemedi. Tekrar dene.'
        : state === 'logout_error' ? 'Çıkış yapılamadı. Tekrar deneyebilir veya giriş sayfasına gidebilirsin.'
        : 'Oturum şu anda doğrulanamadı. Biraz sonra tekrar dene.';
    },
    async mount(scope,current,validatedUser) {
      const catalogue=backend.catalogue,canonical=catalogue?.canonical;
      const dataClient=canonical?catalogue.dataClient:client;
      // Account projects use the Auth database; only sports data/overrides use the catalogue transport.
      if (route.page === 'onboarding') {
        // Read the active catalogue through its existing runtime transport,
        // while preference persistence stays on the Auth/Profile client.
        const teamCatalogue=createCanonicalCatalogue(dataClient);
        return mountOnboarding({document,window,current,catalogue:teamCatalogue,
          api:createProfileApi({client,validatedUser,current,teamCatalogue})}).dispose;
      }
      let playerOverrides=null;
      if(['studio','match-studio','match','weekly-xi'].includes(route.page)){
        playerOverrides=createPlayerOverrides({client:dataClient,validatedUser,current,internalOnly:!!canonical});
        // Both depend on the validated identity, not on each other's results.
        // Join before mount so the first XI already includes personal overrides.
        // Every roster page loads the active catalogue; there is no static roster fallback (SEC1.1).
        try {await Promise.all([backend.loadCatalogue(),playerOverrides.load()]);}
        catch(error){playerOverrides.dispose();throw error;}
        if(!current()){playerOverrides.dispose();return;}
      }
      const owned=dispose=>()=>{dispose?.();playerOverrides?.dispose();};
      const weeklyRecords=createWeeklyLineups({client,validatedUser,current});
      if (route.page === 'weekly-collection') return mountWeeklyCollection({document,current,api:weeklyRecords}).dispose;
      if (route.page === 'weekly-xi') return owned(mountWeeklyXI({document,window,current,userId:validatedUser.id,catalogue,playerOverrides,records:weeklyRecords,matchesApi:createMatchesApi({client,current,location:window.location})}).dispose);
      if (route.page === 'projects') return mountStudioProjects({document,window,current,api:createStudioProjects({client,validatedUser,current})}).dispose;
      if (route.page === 'match-studio') {
        return owned(mountMatchStudio({document,window,current,playerOverrides,userId:validatedUser.id,projects:createStudioProjects({client,validatedUser,current}),api:createMatchDetailApi({client,current,location:window.location,identity:canonical?catalogue:null})}).dispose);
      }
      if (route.page === 'match') {
        return owned(mountMatchDetail({document,window,current,playerOverrides,api:createMatchDetailApi({client,current,location:window.location,identity:canonical?catalogue:null})}).dispose);
      }
      if (route.page === 'matches') {
        const teamCatalogue=createCanonicalCatalogue(dataClient);
        const preferences=createProfileApi({client,validatedUser,current,teamCatalogue});
        return mountMatches({document,window,current,loadFavorite:()=>loadFavoriteTeam({api:preferences,catalogue:teamCatalogue}),api:createMatchesApi({client,current,location:window.location})}).dispose;
      }
      if (route.page === 'profile') {
        const teamCatalogue=createCanonicalCatalogue(dataClient);
        const api = createProfileApi({client,validatedUser,current,teamCatalogue});
        let weeklyStorage;try{weeklyStorage=window.localStorage;}catch{}
        const weeklyStores=['canonical','legacy'].map(source=>createWeeklyStore({userId:validatedUser.id,source,storage:weeklyStorage,current}));
        // ACCOUNT1: runs only after the server confirmed the verified deletion. Stop the guard first so it
        // cannot redirect to login, end the local session, clear this user's keys, then go Home.
        const onDeleted=async()=>{
          const userId=validatedUser.id;guard.dispose();
          try{await auth.signOut();}catch{}
          let local,session;try{local=window.localStorage;session=window.sessionStorage;}catch{}
          clearUserData({storage:local,sessionStorage:session,userId});
          window.location.replace('/');
        };
        return mountProfile({document,api,validatedUser,current,weeklyRecords,weeklyStores,eventTarget:window,catalogue:teamCatalogue,projects:createStudioProjects({client,validatedUser,current}),onSignOut:()=>guard.signOut(),
          accountDeletion:accountDeletion?{deleteAccount:accountDeletion.deleteAccount,onDeleted}:undefined}).dispose;
      }
      // Open the user's own draft directly. Device-wide legacy drafts are
      // neither imported nor deleted as a side effect of opening a board.
      if (!current()) {playerOverrides?.dispose();return;}
      return owned(window.TAKTIK_APP.mountStudio(document.getElementById('studioRoot'),scope,playerOverrides,{mount:mountBoardTacticalTools,strokes:drawingStrokes},shortPlayerLabel));
    },
  });
  const signOut = () => {void guard.signOut();}, tryAgain = () => {void guard.retry();};
  logout?.addEventListener('click',signOut); retry.addEventListener('click',tryAgain);
  function dispose() {
    guard.dispose(); logout?.removeEventListener('click',signOut); retry.removeEventListener('click',tryAgain);
    window.removeEventListener('pagehide',dispose);
  }
  window.addEventListener('pagehide',dispose);
  return {ready:guard.start(),dispose};
}
