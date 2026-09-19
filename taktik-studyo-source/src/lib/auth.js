import {supabase, publicConfig} from './supabase.js';
import {createAuthSession} from './auth-session.js';
import {createRecoveryClient} from './recovery-client.js';
export {safeInternalRedirect} from './auth-redirects.js';

// The same singleton client is used by catalogue and, later, profiles.
// Never attach this module's state or SDK client to window.
export const auth = createAuthSession(supabase, () => createRecoveryClient(publicConfig));
