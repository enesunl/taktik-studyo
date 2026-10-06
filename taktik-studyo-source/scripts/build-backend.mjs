import {existsSync} from 'node:fs';
import {buildBrowserBackend} from './backend-build.mjs';
// Production build input remains unchanged. Local dev never loads this file.
if(existsSync('.env'))process.loadEnvFile('.env');
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
await buildBrowserBackend({url,key,siteKey:process.env.TURNSTILE_SITE_KEY||'',authSiteKey:process.env.AUTH_TURNSTILE_SITE_KEY||'',outfile:'dist/backend.js'});
console.log('Backend adapter built: '+(url?'configured':'offline catalogue; Supabase target not selected'));
