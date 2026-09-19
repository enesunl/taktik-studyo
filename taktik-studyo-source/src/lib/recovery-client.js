import {createClient} from '@supabase/supabase-js';
import {createRecoveryTransport} from './recovery-transport.js';

let sequence = 0;
// Fresh per operation. The SDK owns its memory-only storage; no storage adapter,
// shared client session, cookie or application token persistence is supplied.
export function createRecoveryClient({url,key}, fetcher = (input, options = {}) =>
  fetch(input,{...options,signal:options.signal || AbortSignal.timeout(8000)})) {
  if (!url || !key) return null;
  const transport = createRecoveryTransport(url,fetcher);
  const client = createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,debug:false,
      // Separate SDK instance/lock namespace, not a persisted application key.
      storageKey:'taktik:recovery:'+new URL(url).hostname+':v1:'+ ++sequence},
    global:{fetch:transport.fetch},
  });
  return {client,transport};
}
