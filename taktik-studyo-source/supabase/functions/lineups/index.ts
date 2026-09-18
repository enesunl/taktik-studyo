import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createHandler } from './handler.js';
import { createBotVerifier } from './turnstile.js';
const url=Deno.env.get('SUPABASE_URL')!;
// Only in the Edge runtime; never used by scripts/build-backend.mjs.
const serverKey=Deno.env.get('LINEUPS_SECRET_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
const publicKey=Deno.env.get('LINEUPS_PUBLISHABLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default;
if(!serverKey?.startsWith('sb_secret_') || !publicKey?.startsWith('sb_publishable_'))throw new Error('Modern API keys are not configured');
const client=createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const liveOrigin='https://taktik-studyo.unql9enes.chatgpt.site';
const origins=(Deno.env.get('ALLOWED_ORIGINS')||liveOrigin).split(',').map(v=>v.trim()).filter(v=>v===liveOrigin);
const botSecret=Deno.env.get('TURNSTILE_SECRET_KEY');
const handler=createHandler({client,origins,publicKey,rateSalt:Deno.env.get('LINEUPS_RATE_SALT')||serverKey,
  sharingReady:!!botSecret,
  verifyBot:createBotVerifier({secret:botSecret,origins})
});
Deno.serve(handler);
