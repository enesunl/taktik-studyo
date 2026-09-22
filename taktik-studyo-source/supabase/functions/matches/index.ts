import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createMatchesHandler,matchesOrigins} from './handler.js';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('MATCHES_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
if (!url || !key?.startsWith('sb_publishable_')) throw Error('Matches public Auth configuration missing');
const authClient = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(url,options = {}) => fetch(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}});
Deno.serve(createMatchesHandler({
  token:Deno.env.get('BSD_API_TOKEN'),
  origins:matchesOrigins(Deno.env.get('MATCHES_ALLOWED_ORIGINS')),
  async authenticate(jwt) {
    const {data,error} = await authClient.auth.getUser(jwt);
    return error ? null : data.user;
  },
}));
