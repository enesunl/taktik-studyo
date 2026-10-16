import { build } from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {assertLocalUrl,assertLocalPublicKey} from './local-supabase.mjs';
// The pinned SDK contains a generic server-key recognition branch. This browser
// build supports public keys (local legacy anon JWTs included), never server keys.
const browserOnlyKeys={name:'publishable-only-browser-client',setup(builder){builder.onLoad({filter:/@supabase[\\/]supabase-js[\\/]dist[\\/]index\.mjs$/},args=>{
  const source=readFileSync(args.path,'utf8');
  const generic='key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")';
  if(source.split(generic).length!==2)throw new Error('Review SDK key recognition before upgrading.');
  return {contents:source.replace(generic,'key.startsWith("sb_publishable_")'),loader:'js'};
});}};

export async function buildBrowserBackend({url='',key='',siteKey='',authSiteKey='',local=false,catalogueSource='canonical',outfile}={}){
 // SEC1.1: BSD canonical by default; 'legacy' only for an explicit rollback build. No static roster fallback.
 if(!['canonical','legacy'].includes(catalogueSource))throw Error('Invalid catalogue source.');
 if(local){assertLocalUrl(url);assertLocalPublicKey(key);}
 else{
  if(!!url!==!!key)throw Error('Both public Supabase configuration values are required.');
  if(url&&!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url))throw Error('Expected hosted Supabase HTTPS URL.');
  if(key&&!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw Error('Only a modern publishable key may enter the browser bundle.');
 }
 for(const value of [siteKey,authSiteKey])if(value&&!/^[A-Za-z0-9_-]{10,100}$/.test(value))throw Error('Invalid public Turnstile site key.');
 const result=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['src/backend-entry.js'],bundle:true,minify:true,format:'iife',target:'es2022',supported:{'template-literal':false},
  ...(outfile?{outfile}:{write:false}),plugins:[browserOnlyKeys],define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_PUBLISHABLE_KEY__:JSON.stringify(key),__TURNSTILE_SITE_KEY__:JSON.stringify(siteKey),__AUTH_TURNSTILE_SITE_KEY__:JSON.stringify(authSiteKey),__CATALOGUE_SOURCE__:JSON.stringify(catalogueSource)},legalComments:'eof'});
 return outfile?undefined:result.outputFiles[0].contents;
}
