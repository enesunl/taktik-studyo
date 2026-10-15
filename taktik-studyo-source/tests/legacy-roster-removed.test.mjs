import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {buildBrowserBackend} from '../scripts/backend-build.mjs';

// SEC1.1: the legacy FotMob-sourced roster snapshot is not part of the published application.
const dist=new URL('../dist/',import.meta.url);
const published=readdirSync(dist,{recursive:true}).map(String).map(p=>p.replace(/\\/g,'/')).filter(p=>statSync(new URL(p,dist)).isFile());
const textual=published.filter(p=>/\.(html|js|css|json|svg|txt|webmanifest|xml)$|^_redirects$|^_headers$/.test(p));
// The legacy dataset itself is only in the local seed fixture (never published) and Git history.
const seed=readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8');
const legacy=[...seed.matchAll(/insert into public\.players\(id,team_id,name,[^)]*\) values \('([^']+)','[^']+','((?:''|[^'])*)'/g)].map(m=>({id:m[1],name:m[2].replaceAll("''","'")}));
const bsdNames=new Set(JSON.parse(readFileSync(new URL('./fixtures/bsd-catalogue-clean.json',import.meta.url),'utf8')).players.map(p=>p.display_name));

test('dist has no roster snapshot file and no page loads one or shows TFF/FotMob roster credits',()=>{
  assert.equal(legacy.length,539,'seed fixture parsed');
  assert.equal(published.some(p=>/(^|\/)rosters\.js$/.test(p)),false);
  for(const page of published.filter(p=>p.endsWith('.html'))){
    const html=readFileSync(new URL(page,dist),'utf8');
    assert.doesNotMatch(html,/rosters\.js|tff\.org|Kadro verisi|Gerçek kadrolar/,page);
  }
  assert.match(readFileSync(new URL('studyo.html',dist),'utf8'),/<div class="source-note">Takım kataloğu · Taktik Stüdyo<\/div>/);
});

test('no published static asset exposes the old 539-player snapshot',()=>{
  // Names that also exist in BSD (same real players) are allowed; FotMob-only names, legacy IDs,
  // squad URLs, portrait paths and the snapshot header must not appear anywhere in dist/.
  const whole=name=>new RegExp('(?<![\\p{L}])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])','u');
  const bsdText=[...bsdNames].join('\n');
  // Legacy-only = not a BSD name and not a whole-word part of one (e.g. "Franculino" in "Franculino Djú").
  const legacyOnly=legacy.filter(p=>p.name.length>=8&&!whole(p.name).test(bsdText));
  assert.ok(legacyOnly.length>50,'enough distinctive legacy-only names to detect a leak');
  for(const file of textual){
    const text=readFileSync(new URL(file,dist),'utf8');
    assert.doesNotMatch(text,/fotmob\.com\/teams\/|images\.fotmob\.com|faces\/\d+\.png|"asOf":"2026-09-12"|TAKTIK_ROSTERS\s*=\s*\{/,file);
    const ids=legacy.filter(p=>text.includes('"'+p.id+'"')||text.includes("'"+p.id+"'"));
    assert.deepEqual(ids.map(p=>p.id),[],file+' contains legacy player IDs');
    // Whole names only: BSD spellings such as "Ruslan Malinovskyi" must not count as "Ruslan Malinovsky".
    const names=legacyOnly.filter(p=>whole(p.name).test(text));
    assert.deepEqual(names.map(p=>p.name),[],file+' contains FotMob-only player names');
  }
});

test('builds select the BSD catalogue by default; legacy only on explicit request; nothing else accepted',async()=>{
  const selected=async options=>{
    const code=Buffer.from(await buildBrowserBackend({url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_publishable_test_only',...options})).toString();
    const m=code.match(/var (\w+)="(\w+)",\w+=\w+\(\{config:window\.TAKTIK_CATALOGUE_CONFIG\?\?\{source:\1\}/);assert.ok(m,'catalogue selection present');return m[2];
  };
  assert.equal(await selected({}),'canonical');
  assert.equal(await selected({catalogueSource:'legacy'}),'legacy');
  await assert.rejects(buildBrowserBackend({catalogueSource:'fotmob'}),/Invalid catalogue source/);
  // The committed production bundle was built with the default.
  assert.match(readFileSync(new URL('backend.js',dist),'utf8'),/var (\w+)="canonical",\w+=\w+\(\{config:window\.TAKTIK_CATALOGUE_CONFIG\?\?\{source:\1\}/);
});
