import {safeInternalRedirect} from './auth-redirects.js';

export const CURRENT_ONBOARDING_VERSION = 1;
export function needsOnboarding(profile) {
  return !profile || profile.onboarding_completed_at === null
    || profile.onboarding_version < CURRENT_ONBOARDING_VERSION;
}
export function onboardingDestination(search = '') {
  const params = new URLSearchParams(search);
  const path = params.getAll('next').length === 1 ? safeInternalRedirect(params.get('next')) : null;
  return path && path !== '/hos-geldin.html' ? path : '/studyo.html';
}
export function onboardingRedirect(path, profile) {
  if (path === '/hos-geldin' || path === '/hos-geldin.html' || !safeInternalRedirect(path) || !needsOnboarding(profile)) return null;
  return '/hos-geldin?next=' + encodeURIComponent(path);
}

// UX only, not an authorization boundary. No writes or catalogue requests.
// An unavailable O1 schema/service must not break the existing P1 application.
export function createOnboardingGate({createApi,path}) {
  return async ({validatedUser,current}) => {
    if (path === '/hos-geldin.html') return null;
    const result = await createApi(validatedUser,current).loadPreferences();
    if (!current() || !result.ok) return null;
    return onboardingRedirect(path,result.profile);
  };
}
