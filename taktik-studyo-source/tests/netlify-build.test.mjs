import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// PROD1.6: a Netlify build of any deploy context must stop, not publish an unconfigured bundle.
// Runs in an empty temporary directory (no .env); the guard exits before any file is written.
const script=fileURLToPath(new URL('../scripts/build-backend.mjs',import.meta.url));
const bundle=new URL('../dist/backend.js',import.meta.url);
const run=env=>spawnSync(process.execPath,[script],{cwd:mkdtempSync(join(tmpdir(),'taktik-netlify-')),encoding:'utf8',
  env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,NETLIFY:'true',CONTEXT:'deploy-preview',...env}});

test('Netlify build fails fast and names (never prints) the missing public build variables',()=>{
  const before=readFileSync(bundle);
  const none=run({});
  assert.equal(none.status,1);
  assert.match(none.stderr,/Netlify build stopped: missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TURNSTILE_SITE_KEY for context deploy-preview/);
  const partial=run({SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example_only'});
  assert.equal(partial.status,1);assert.match(partial.stderr,/missing TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(partial.stderr+partial.stdout,/abcdefghijklmnopqrst|sb_publishable_example_only/,'values are never echoed');
  assert.deepEqual(readFileSync(bundle),before,'committed bundle untouched');
});

test('the committed bundle targets the hosted project with public values only',()=>{
  const js=readFileSync(bundle,'utf8'),project=JSON.parse(readFileSync(new URL('../supabase/project.json',import.meta.url),'utf8'));
  assert.ok(js.includes(project.url));
  assert.doesNotMatch(js,/sb_secret_[A-Za-z0-9]|service_role|SUPABASE_SECRET|BSD_API_TOKEN|TURNSTILE_SECRET|127\.0\.0\.1:54321/);
  assert.ok(!js.includes('startsWith("sb_secret_")'),'browser-only key safeguard applied to the committed bundle');
});
