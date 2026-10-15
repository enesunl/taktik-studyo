import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createMatchesHandler,matchesOrigins} from './handler.js';
import {createCanonicalMatches,readCatalogueState} from './canonical.js';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('MATCHES_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default;
if (!url || !key?.startsWith('sb_publishable_')) throw Error('Matches public Auth configuration missing');
const authClient = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(url,options = {}) => fetch(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}});
// PROD1.5: BSD canonical catalogue identities for the BSD-only frontend. The server key stays in
// this function (catalogue/mapping reads only); MATCHES_CATALOGUE=legacy disables it for rollback.
const serverKey = Deno.env.get('MATCHES_SECRET_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default
  || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const catalogueClient = serverKey && Deno.env.get('MATCHES_CATALOGUE') !== 'legacy' ? createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(url,options = {}) => fetch(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}}) : null;
Deno.serve(createMatchesHandler({
  canonical:catalogueClient ? loaders => createCanonicalMatches({loadState:() => readCatalogueState(catalogueClient),...loaders}) : undefined,
  token:Deno.env.get('BSD_API_TOKEN'),
  origins:matchesOrigins(Deno.env.get('MATCHES_ALLOWED_ORIGINS')),
  async authenticate(jwt) {
    const {data,error} = await authClient.auth.getUser(jwt);
    return error ? null : data.user;
  },
}));
