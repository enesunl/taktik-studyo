import {existsSync} from 'node:fs';
import {buildBrowserBackend} from './backend-build.mjs';
// Production build input remains unchanged. Local dev never loads this file.
if(existsSync('.env'))process.loadEnvFile('.env');
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const catalogueSource=process.env.CATALOGUE_SOURCE||'canonical';
// PROD1.6: Netlify (NETLIFY=true) must fail instead of publishing an unconfigured bundle when a
// deploy context lacks the public build values. Names only; values are never printed.
if(process.env.NETLIFY==='true'){
  const missing=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','TURNSTILE_SITE_KEY'].filter(name=>!process.env[name]);
  if(missing.length){console.error('Netlify build stopped: missing '+missing.join(', ')+' for context '+(process.env.CONTEXT||'unknown')+'.');process.exit(1);}
}
await buildBrowserBackend({url,key,siteKey:process.env.TURNSTILE_SITE_KEY||'',authSiteKey:process.env.AUTH_TURNSTILE_SITE_KEY||'',catalogueSource,outfile:'dist/backend.js'});
console.log('Backend adapter built: '+(url?'configured':'Supabase target not selected')+'; catalogue '+catalogueSource);
