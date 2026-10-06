import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mountOnboarding} from '../src/lib/onboarding-ui.js';
import {createCanonicalCatalogue} from '../src/lib/catalogue-canonical.js';
import {ProfileNode,deferred,tick} from './helpers/profile-fixture.mjs';

const incomplete={onboarding_completed_at:null,onboarding_version:0};
const complete={onboarding_completed_at:'2026-10-05T00:00:00Z',onboarding_version:1};
const clubs=[{id:'home-club',name:'Ev sahibi',color:'#123456',color2:'#abcdef'},{id:'away-club',name:'Deplasman',color:'#abcdef',color2:'#123456'}];
function fixture({search='',load=async()=>({ok:true,profile:incomplete}),save=async()=>({ok:true,profile:complete}),teams=async()=>clubs}={}){
  let active=true;
  const root=new ProfileNode('main'),navigation=[],writes=[],reads=[];
  const document={getElementById:id=>id==='protectedContent'?root:null,createElement(tag){const node=new ProfileNode(tag);node.style={setProperty(){}};node.focus=()=>{document.activeElement=node;};return node;}};
  const window={location:{pathname:'/hos-geldin',search,replace:url=>navigation.push(url)},history:{pushState(){throw Error('No per-step history');},replaceState(){throw Error('No per-step history');}}};
  for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw Error('No partial storage');}});
  const api={loadPreferences:load,completeOnboarding:async arg=>{writes.push(arg);return save(arg);}};
  const options={document,window,api,current:()=>active,catalogue:{loadTeams:async()=>{reads.push('teams');return teams();}}};
  const page=mountOnboarding(options);
  const walk=(node=root)=>[node,...node.children.flatMap(walk)];
  const find=(tag,text)=>walk().find(n=>n.tagName===tag&&n.textContent===text);
  const byClass=className=>walk().find(n=>n.className===className);
  const click=async text=>{const button=find('button',text);assert(button,`Missing ${text}`);assert(!button.hidden&&!button.disabled,`Unavailable ${text}`);await button.emit('click');await tick();};
  const choose=async slug=>{const radio=walk().find(n=>n.tagName==='input'&&n.value===(slug??''));assert(radio);await radio.emit('change');};
  return {page,root,document,window,navigation,writes,reads,find,walk,byClass,click,choose,invalidate(){active=false;},async final(){await page.ready;await click('Başla →');for(let i=0;i<3;i++)await click('Devam →');}};
}

test('five in-memory steps, textual progress, one focused h1, next/back and no URL or storage changes',async()=>{
  const f=fixture();await f.page.ready;
  const headings=["TAKTİK STÜDYO'YA\nHOŞ GELDİN.",'TAKTİĞİNİ\nSAHADA GÖSTER.','MAÇI SADECE\nİZLEME.\nANALİZ ET.','ÇALIŞMANI\nKAYDET.\nGERİ DÖN.','SON BİR ŞEY.'];
  for(let i=0;i<5;i++){
    assert.equal(f.byClass('onboarding-progress').textContent,`${i+1} / 5`);
    assert.equal(f.walk().filter(n=>n.tagName==='h1').length,1);assert.equal(f.document.activeElement.textContent,headings[i]);
    assert.equal(f.byClass('onboarding-dots').children.filter(n=>n.className==='is-complete').length,i+1);
    if(i<4)await f.click(i===0?'Başla →':'Devam →');
  }
  assert.deepEqual(f.reads,['teams']);assert.equal(f.writes.length,0);assert.deepEqual(f.navigation,[]);assert.equal(f.window.location.pathname,'/hos-geldin');
  await f.click('← Geri');assert.equal(f.byClass('onboarding-progress').textContent,'4 / 5');f.page.dispose();
});

test('canonical team radio selection survives back/forward and completes once with its slug at safe destination',async()=>{
  const f=fixture({search:'?next=%2Fmaclar.html'});await f.final();
  assert(f.find('button',"Taktik Stüdyo'ya Başla →").disabled);
  await f.choose('home-club');await f.click('← Geri');await f.click('Devam →');
  assert(f.walk().find(n=>n.tagName==='input'&&n.value==='home-club').checked);
  assert(f.find('span','✓ Seçildi'));assert.equal(f.reads.length,1);
  await f.click("Taktik Stüdyo'ya Başla →");assert.deepEqual(f.writes,[{favoriteTeamSlug:'home-club'}]);assert.deepEqual(f.navigation,['/maclar.html']);f.page.dispose();
});

test('no-team is explicit null; skip on every introductory step persists null before safe navigation',async()=>{
  const final=fixture();await final.final();await final.choose(null);await final.click("Taktik Stüdyo'ya Başla →");assert.deepEqual(final.writes,[{favoriteTeamSlug:null}]);final.page.dispose();
  for(let step=0;step<4;step++){
    const wait=deferred(),f=fixture({search:'?next=https://attacker.test',save:()=>wait.promise});await f.page.ready;
    for(let i=0;i<step;i++)await f.click(i===0?'Başla →':'Devam →');
    await f.click('Atla');assert.deepEqual(f.writes,[{favoriteTeamSlug:null}]);assert.equal(f.navigation.length,0);
    wait.resolve({ok:true,profile:complete});await tick();assert.deepEqual(f.navigation,['/studyo.html']);f.page.dispose();
  }
});

test('failure and thrown SDK details stay generic, preserve selection, allow retry and block double submit',async()=>{
  const pending=deferred();let attempts=0;
  const f=fixture({save:()=>++attempts===1?pending.promise:Promise.resolve({ok:true,profile:complete})});await f.final();await f.choose('away-club');
  const submit=f.find('button',"Taktik Stüdyo'ya Başla →");await submit.emit('click');await submit.emit('click');
  assert.equal(f.writes.length,1);assert(submit.disabled);assert.equal(f.navigation.length,0);
  pending.resolve({ok:false,error:{message:'raw SDK message'}});await tick();
  assert.equal(f.byClass('onboarding-message').textContent,'Tercihin kaydedilemedi. Tekrar dene.');assert(!submit.disabled);
  assert(f.walk().find(n=>n.tagName==='input'&&n.value==='away-club').checked);
  await f.click("Taktik Stüdyo'ya Başla →");assert.equal(f.writes.length,2);assert.deepEqual(f.navigation,['/studyo.html']);f.page.dispose();
  const thrown=fixture({save:()=>{throw Error('private');}});await thrown.page.ready;await thrown.click('Atla');assert.equal(thrown.navigation.length,0);assert(!thrown.walk().some(n=>n.textContent.includes('private')));thrown.page.dispose();
});

test('team-only load failure permits retry and null completion; loading never blocks no-team option',async()=>{
  let attempt=0;
  const f=fixture({teams:async()=>{if(++attempt===1)throw Error('raw');return clubs;}});await f.final();
  assert(f.find('button','Takımları tekrar yükle'));assert(f.walk().some(n=>n.tagName==='input'&&n.value===''));
  await f.click('Takımları tekrar yükle');assert.equal(f.reads.length,2);assert(f.walk().some(n=>n.value==='home-club'));f.page.dispose();
  for(const teams of [async()=>{throw Error();},()=>new Promise(()=>{})]){
    const g=fixture({teams});await g.final();await g.choose(null);await g.click("Taktik Stüdyo'ya Başla →");assert.deepEqual(g.navigation,['/studyo.html']);assert.deepEqual(g.writes,[{favoriteTeamSlug:null}]);g.page.dispose();
  }
});

test('completed users bypass all artwork and teams; failed preference load retries without pretending completion',async()=>{
  for(const search of ['?next=%2Fhos-geldin.html','?next=javascript:alert(1)','']){
    const f=fixture({search,load:async()=>({ok:true,profile:complete})});await f.page.ready;assert.deepEqual(f.navigation,['/studyo.html']);assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.walk().filter(n=>n.tagName==='h1').length,0);f.page.dispose();
  }
  let attempt=0;const f=fixture({load:async()=>++attempt===1?{ok:false,error:{code:'onboarding_unavailable'}}:{ok:true,profile:incomplete}});await f.page.ready;assert.equal(f.writes.length,0);assert.equal(f.navigation.length,0);await f.click('Tekrar dene');assert(f.find('h1',"TAKTİK STÜDYO'YA\nHOŞ GELDİN."));f.page.dispose();
});

test('account invalidation before completion prevents write; pending completion cannot navigate or update UI after switch',async()=>{
  const f=fixture();await f.final();await f.choose('home-club');f.invalidate();await f.find('button',"Taktik Stüdyo'ya Başla →").emit('click');assert.equal(f.writes.length,0);f.page.dispose();assert.equal(f.root.children.length,0);
  const wait=deferred(),g=fixture({save:()=>wait.promise});await g.final();await g.choose('away-club');await g.click("Taktik Stüdyo'ya Başla →");g.invalidate();g.page.dispose();wait.resolve({ok:true,profile:complete});await tick();assert.equal(g.navigation.length,0);assert.equal(g.root.children.length,0);
});

test('stale initial preference and catalogue responses cannot rebuild disposed old-user UI',async()=>{
  const wait=deferred(),f=fixture({load:()=>wait.promise});f.invalidate();f.page.dispose();wait.resolve({ok:true,profile:complete});await f.page.ready;assert.equal(f.navigation.length,0);assert.equal(f.root.children.length,0);
  const teams=deferred(),g=fixture({teams:()=>teams.promise});await g.final();g.invalidate();g.page.dispose();teams.resolve(clubs);await tick();assert.equal(g.root.children.length,0);assert.equal(g.navigation.length,0);
});

test('canonical picker loader fetches only active teams with product colors, sorted slugs; no players or media',async()=>{
  const calls=[];
  const rows=clubs.map((t,i)=>({id:t.id,display_name:t.name,short_name:'CLB',color_primary:t.color,color_secondary:t.color2,sort_order:2-i,catalogue_active:true}));
  const client={from(table){assert.equal(table,'catalogue_teams');const call={table};calls.push(call);const q={select(c){call.columns=c;return q;},eq(k,v){call.filter=[k,v];return q;},order(k){call.order=k;return q;},limit(n){call.limit=n;return q;},then(a,b){return Promise.resolve({data:rows}).then(a,b);}};return q;}};
  const result=await createCanonicalCatalogue(client).loadTeams();
  assert.deepEqual(result.map(t=>t.id),['away-club','home-club']);assert.deepEqual(calls,[{table:'catalogue_teams',columns:'id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active',filter:['catalogue_active',true],order:'id',limit:501}]);
  assert.equal(result[0].color,'#abcdef');
  rows[0].color_primary='url(https://attacker.test)';await assert.rejects(createCanonicalCatalogue(client).loadTeams(),{code:'catalogue_malformed'});
});

test('welcome shell reuses theme, guarded content, local CSS; accessible responsive rules remain scoped',async()=>{
  const html=await readFile(new URL('../dist/hos-geldin.html',import.meta.url),'utf8'),css=await readFile(new URL('../dist/onboarding.css',import.meta.url),'utf8');
  assert.match(html,/id="protectedContent"[^>]*hidden inert/);assert.match(html,/onboarding.css/);assert(html.indexOf('theme.js')<html.indexOf('styles.css'));assert.match(html,/data-theme-toggle/);
  assert.match(css,/prefers-reduced-motion:no-preference/);assert.match(css,/@media\(max-width:640px\)/);assert.match(css,/min-height:44px/);assert.match(css,/focus-within/);
});
