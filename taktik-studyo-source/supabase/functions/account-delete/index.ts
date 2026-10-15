import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createAccountDeleteHandler,accountDeleteOrigins,OWNED_TABLES} from './handler.js';

// Edge runtime only. Secret/admin keys come from the function environment and are never sent to browsers.
const url = Deno.env.get('SUPABASE_URL')!;
const secretKey = Deno.env.get('ACCOUNT_DELETE_SECRET_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const publicKey = Deno.env.get('ACCOUNT_DELETE_PUBLISHABLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default
  || Deno.env.get('SUPABASE_ANON_KEY');
if (!url || !secretKey || !publicKey) throw new Error('Account deletion is not configured');
const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input: RequestInfo | URL, init: RequestInit = {}) => fetch(input,{...init,signal:init.signal || AbortSignal.timeout(8000)})}};
const admin = createClient(url, secretKey, options);

Deno.serve(createAccountDeleteHandler({
  origins: accountDeleteOrigins(Deno.env.get('ACCOUNT_DELETE_ALLOWED_ORIGINS')),
  async authenticate(jwt: string) {
    const {data,error} = await admin.auth.getUser(jwt);
    return error ? null : data.user;
  },
  // Recent identity verification: re-check the password with a fresh, non-persisting public client,
  // then revoke that verification session immediately.
  // SEC2.2: with hosted CAPTCHA enabled, the browser's Turnstile token is forwarded (the public-key call needs it).
  async verifyPassword({email,password,userId,captchaToken}: {email: string, password: string, userId: string, captchaToken?: string}) {
    const verifier = createClient(url, publicKey, options);
    const {data,error} = await verifier.auth.signInWithPassword({email,password,...(captchaToken ? {options:{captchaToken}} : {})});
    if (error) {
      if (error.status === 429) throw {code:'rate_limited'};
      if (error.code === 'captcha_failed') throw {code:'captcha_failed'};
      return false;
    }
    const ok = data.user?.id === userId;
    if (data.session?.access_token) await admin.auth.admin.signOut(data.session.access_token,'local').catch(() => {});
    return ok;
  },
  async countOwned(userId: string) {
    const counts: Record<string, number> = {};
    for (const [table,column] of OWNED_TABLES) {
      const {count,error} = await admin.from(table).select(column,{count:'exact',head:true}).eq(column,userId);
      if (error || typeof count !== 'number') throw new Error('Owned data check unavailable');
      counts[table] = count;
    }
    return counts;
  },
  async deleteUser(userId: string) {
    const {error} = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('Delete failed');
  },
}));
