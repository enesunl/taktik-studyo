import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertLocalUrl,assertLocalPublicKey,localConfigFromStatus,loadLocalSupabase} from '../scripts/local-supabase.mjs';
import {buildBrowserBackend} from '../scripts/backend-build.mjs';

const local={API_URL:'http://127.0.0.1:54321',PUBLISHABLE_KEY:'sb_publishable_testonly'};
const jwt=role=>['e30',Buffer.from(JSON.stringify({role})).toString('base64url'),'testsignature'].join('.');
test('DEV1 local config rejects all hosted/production targets and privileged keys; reads CLI public projection only',async()=>{
 for(const value of ['https://zwhoailuklwtxaaawfaq.supabase.co','https://other.supabase.co','http://localhost.evil.test:54321','http://127.1:54321','http://127.0.0.1:54321/path','http://localhost:54321?url=evil','http://user:pw@localhost:54321','http://localhost:70000','//localhost:54321'])assert.throws(()=>assertLocalUrl(value));
 for(const value of ['sb_secret_fixture',jwt('service_role'),jwt('authenticated'),'anything'])assert.throws(()=>assertLocalPublicKey(value));
 assert.equal(assertLocalPublicKey(jwt('anon')),jwt('anon'));
 assert.deepEqual(localConfigFromStatus({...local,SERVICE_ROLE_KEY:'must-not-escape',DB_URL:'must-not-escape'}),{url:local.API_URL,key:local.PUBLISHABLE_KEY});
 let read=0,network=0;
 await assert.rejects(loadLocalSupabase({env:{SUPABASE_URL:'https://zwhoailuklwtxaaawfaq.supabase.co'},readStatus:async()=>{read++;return local;},fetchImpl:async()=>{network++;return Response.json({version:'test'});}}),/forbidden/);
 assert.equal(read,0);assert.equal(network,0);
});

test('DEV1 local startup requires CLI configuration AND healthy local Auth, no fallback or redirects',async()=>{
 await assert.rejects(loadLocalSupabase({env:{},readStatus:async()=>{throw Error('Local Supabase is not available');}}),/not available/);
 for(const fetchImpl of [async()=>Response.json({}, {status:503}),async()=>{throw Error('offline');},async()=>Response.json({})]){
  await assert.rejects(loadLocalSupabase({env:{},readStatus:async()=>local,fetchImpl}),/Local Supabase Auth is not available/);
 }
 const config=await loadLocalSupabase({env:{},readStatus:async()=>local,fetchImpl:async(url,options)=>{
  assert.equal(url,local.API_URL+'/auth/v1/health');assert.equal(options.redirect,'error');assert.equal(options.headers.apikey,local.PUBLISHABLE_KEY);return Response.json({version:'local-test'});
 }});assert.equal(config.url,local.API_URL);
 await assert.rejects(loadLocalSupabase({env:{SUPABASE_URL:'http://localhost:9999'},readStatus:async()=>local}),/does not match/);
});

test('DEV1 real development entrypoint rejects an accidental production environment before CLI or listening',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/serve-local.cjs',import.meta.url))],{
  env:{...process.env,SUPABASE_URL:'https://zwhoailuklwtxaaawfaq.supabase.co'},encoding:'utf8',timeout:5000,windowsHide:true});
 assert.equal(result.status,1);assert.match(result.stderr,/hosted\/production targets are forbidden/);assert(!result.stdout.includes('Taktik Studyo:'));
});

test('DEV1 local memory bundle uses only local URL/public key while production build retains hosted-only validation',async()=>{
 const before=await readFile(new URL('../dist/backend.js',import.meta.url));
 const localBundle=Buffer.from(await buildBrowserBackend({url:local.API_URL,key:local.PUBLISHABLE_KEY,local:true})).toString();
 assert(localBundle.includes(local.API_URL));assert(!localBundle.includes('zwhoailuklwtxaaawfaq'));
 assert(!localBundle.includes('must-not-escape'));assert.doesNotMatch(localBundle,/sb_secret_[A-Za-z0-9_-]{10,}/); // SDK prefix detection is not a credential.
 assert.deepEqual(await readFile(new URL('../dist/backend.js',import.meta.url)),before);
 await assert.rejects(buildBrowserBackend({url:local.API_URL,key:local.PUBLISHABLE_KEY}),/hosted/);
 await assert.rejects(buildBrowserBackend({url:'https://zwhoailuklwtxaaawfaq.supabase.co',key:local.PUBLISHABLE_KEY,local:true}),/forbidden/);
 const prod=Buffer.from(await buildBrowserBackend({url:'https://zwhoailuklwtxaaawfaq.supabase.co',key:local.PUBLISHABLE_KEY})).toString();
 assert(prod.includes('https://zwhoailuklwtxaaawfaq.supabase.co'));assert(!prod.includes(local.API_URL));
 // FIX1.1: the SDK server-key branch is stripped on every platform (Windows paths use backslashes).
 for(const bundle of [localBundle,prod])assert(!bundle.includes('startsWith("sb_secret_")')&&bundle.includes('startsWith("sb_publishable_")'));
});

test('DEV1 every repository migration initializes from zero in timestamp order with only Supabase Auth prerequisites',async()=>{
 const db=new PGlite();
 try{
  // Supabase supplies these roles/Auth objects. No application tables are patched in.
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  const dir=new URL('../supabase/migrations/',import.meta.url);
  const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();assert.equal(files.length,18);
  for(const name of files)await db.exec(await readFile(new URL(name,dir),'utf8'));
  for(const table of ['profiles','studio_projects','player_overrides','shared_lineups'])assert.equal((await db.query(`select relrowsecurity from pg_class where oid=$1::regclass`,['public.'+table])).rows[0].relrowsecurity,true);
  const columns=(await db.query("select column_name,column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('favorite_team_slug','onboarding_completed_at','onboarding_version') order by column_name")).rows;
  assert.deepEqual(columns,[{column_name:'favorite_team_slug',column_default:null,is_nullable:'YES'},{column_name:'onboarding_completed_at',column_default:null,is_nullable:'YES'},{column_name:'onboarding_version',column_default:'0',is_nullable:'NO'}]);
  assert.deepEqual((await db.query("select confrelid::regclass::text as target from pg_constraint where conrelid='public.profiles'::regclass and contype='f'")).rows,[{target:'auth.users'}]);
  assert.equal((await db.query("select count(*)::int as n from public.profiles")).rows[0].n,0);
 }finally{await db.close();}
});

test('DEV1 local templates match explicit token-hash callback/recovery contract and no external SMTP is configured',async()=>{
 const read=name=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8');
 const config=await read('config.toml');
 assert.match(config,/site_url = "http:\/\/localhost:4173"/);assert.match(config,/enable_confirmations = true/);
 assert.match(config,/\[db.seed\][\s\S]*?enabled = false/);assert(!config.includes('[auth.email.smtp]'));
 for(const [name,type] of [['confirmation','email'],['recovery','recovery']]){
  const html=await read('templates/'+name+'.html');assert(html.includes('{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type='+type));assert(!html.includes('.ConfirmationURL'));
 }
});
