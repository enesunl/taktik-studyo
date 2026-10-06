// Imported only by serve-local.cjs. Never included in the browser/Edge bundle.
import {assertLocalUrl,assertLocalPublicKey} from './local-supabase.mjs';
import {createClient} from '@supabase/supabase-js';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';

export function createLocalMatches({url,key,token,port,fetchImpl = fetch,load,loadDetail}) {
  assertLocalUrl(url);assertLocalPublicKey(key);
  if(!token)throw Error('Local matches configuration missing');
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(url,options = {}) => fetchImpl(url,{...options,signal:options.signal || AbortSignal.timeout(8000)})}});
  return createMatchesHandler({token,load,loadDetail,
    origins:['http://localhost:'+port,'http://127.0.0.1:'+port],
    async authenticate(jwt) {
      const {data,error} = await client.auth.getUser(jwt);
      return error ? null : data.user;
    },
  });
}
