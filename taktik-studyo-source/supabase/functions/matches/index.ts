import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createMatchesHandler,matchesOrigins} from './handler.js';
import {createCanonicalMatches,readCatalogueState} from './canonical.js';
import {fetchSeason,fetchDetail,pacedFetch} from './provider.js';

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
const serverClient = serverKey ? createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(url,options = {}) => fetch(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}}) : null;
const catalogueClient = Deno.env.get('MATCHES_CATALOGUE') !== 'legacy' ? serverClient : null;
// Every BSD request of this isolate shares one pacer (provider burst limit per client address).
const bsdFetch = pacedFetch();
Deno.serve(createMatchesHandler({
  load:options => fetchSeason({...options,fetchImpl:bsdFetch}),
  loadDetail:options => fetchDetail({...options,fetchImpl:bsdFetch}),
  canonical:catalogueClient ? loaders => createCanonicalMatches({loadState:() => readCatalogueState(catalogueClient),...loaders}) : undefined,
  // PROD5.3: per-account detail limits (migration 20261016150000). No server key or RPC error -> 503.
  async allowDetail(account) {
    if (!serverClient) throw Error('limiter unavailable');
    const {data,error} = await serverClient.rpc('matches_detail_allowed',{account});
    if (error) throw error;
    return data;
  },
  token:Deno.env.get('BSD_API_TOKEN'),
  origins:matchesOrigins(Deno.env.get('MATCHES_ALLOWED_ORIGINS')),
  async authenticate(jwt) {
    const {data,error} = await authClient.auth.getUser(jwt);
    return error ? null : data.user;
  },
}));
