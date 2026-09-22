// Imported only by serve-local.cjs. Never included in the browser/Edge bundle.
import {createClient} from '@supabase/supabase-js';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';

export function createLocalMatches({url,key,token,port,fetchImpl = fetch,load}) {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url || '')
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key || '') || !token) throw Error('Local matches configuration missing');
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(url,options = {}) => fetchImpl(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}});
  return createMatchesHandler({token,load,
    origins:['http://localhost:'+port,'http://127.0.0.1:'+port],
    async authenticate(jwt) {
      const {data,error} = await client.auth.getUser(jwt);
      return error ? null : data.user;
    },
  });
}
