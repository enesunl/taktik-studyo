import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const siteKey=process.env.TURNSTILE_SITE_KEY||'';
const authSiteKey=process.env.AUTH_TURNSTILE_SITE_KEY||'';
if(authSiteKey && !/^[A-Za-z0-9_-]{10,100}$/.test(authSiteKey))throw new Error('Invalid public Auth Turnstile site key.');
if(siteKey && !/^[A-Za-z0-9_-]{10,100}$/.test(siteKey))throw new Error('Invalid public Turnstile site key.');
if(!!url!==!!key)throw new Error('Both public Supabase configuration values are required.');
if(url&&!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url))throw new Error('Expected hosted Supabase HTTPS URL.');
if(key&&!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw new Error('Only a modern publishable key may enter the browser bundle.');
// The pinned SDK contains a generic server-key recognition branch. This browser
// build supports publishable keys only; remove that unused branch, not its spelling.
const browserOnlyKeys={name:'publishable-only-browser-client',setup(builder){builder.onLoad({filter:/@supabase\/supabase-js\/dist\/index\.mjs$/},args=>{
  const source=readFileSync(args.path,'utf8');
  const generic='key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")';
  if(source.split(generic).length!==2)throw new Error('Review SDK key recognition before upgrading.');
  return {contents:source.replace(generic,'key.startsWith("sb_publishable_")'),loader:'js'};
});}};
// Escape SDK multiline strings through the compiler so generated output has no trailing whitespace.
await build({entryPoints:['src/backend-entry.js'],bundle:true,minify:true,format:'iife',target:'es2022',supported:{'template-literal':false},outfile:'dist/backend.js',plugins:[browserOnlyKeys],define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_PUBLISHABLE_KEY__:JSON.stringify(key),__TURNSTILE_SITE_KEY__:JSON.stringify(siteKey),__AUTH_TURNSTILE_SITE_KEY__:JSON.stringify(authSiteKey)},legalComments:'eof'});
console.log('Backend adapter built: '+(url?'configured':'offline catalogue; Supabase target not selected'));
