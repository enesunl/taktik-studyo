import { createClient } from '@supabase/supabase-js';
// These two constants are injected from a strict allowlist by the build script.
export const publicConfig = Object.freeze({url:__SUPABASE_URL__,key:__SUPABASE_PUBLISHABLE_KEY__});
export const authStorageKey = 'taktik:auth:' + (publicConfig.url ? new URL(publicConfig.url).hostname : 'unconfigured') + ':v1';
export const supabase = publicConfig.url && publicConfig.key ? createClient(publicConfig.url,publicConfig.key,{
  // SEC2.2: PKCE so Google OAuth returns a one-time code (never tokens) in the URL. Email templates use
  // token_hash + verifyOtp, which does not depend on the flow type.
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce',storageKey:authStorageKey,debug:false},
  global:{fetch:(url, options={})=>fetch(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}
}) : null;
