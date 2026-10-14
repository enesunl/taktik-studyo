import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mountOnboarding} from '../src/lib/onboarding-ui.js';
import {createCanonicalCatalogue,normalizeCanonicalTeams} from '../src/lib/catalogue-canonical.js';
import {ProfileNode,deferred,tick} from './helpers/profile-fixture.mjs';
import {showcaseTeams,studioShowcase,boardShowcase,matchesShowcase,weeklyShowcase} from '../src/lib/onboarding-showcase.js';

const incomplete={onboarding_completed_at:null,onboarding_version:0};
const complete={onboarding_completed_at:'2026-10-05T00:00:00Z',onboarding_version:1};
const clubs=[{id:'home-club',name:'Ev sahibi',color:'#123456',color2:'#abcdef'},{id:'away-club',name:'Deplasman',color:'#abcdef',color2:'#123456'}];
function fixture({search='',load=async()=>({ok:true,profile:incomplete}),save=async()=>({ok:true,profile:complete}),teams=async()=>clubs}={}){
  let active=true;
  const root=new ProfileNode('main'),navigation=[],writes=[],reads=[];
  const document={getElementById:id=>id==='protectedContent'?root:null,createElement(tag){const node=new ProfileNode(tag);node.style={setProperty(key,value){node.attrs[key]=value;}};node.focus=()=>{document.activeElement=node;};return node;}};
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
  const key=async(key,target={tagName:'BUTTON'})=>{let prevented=false;await root.listeners.get('keydown')({key,target,preventDefault(){prevented=true;}});await tick();return prevented;};
  return {page,root,document,window,navigation,writes,reads,find,walk,byClass,click,choose,key,invalidate(){active=false;},async final(){await page.ready;await click('Başla →');for(let i=0;i<4;i++)await click('Devam →');}};
}
const headings=["Taktik Stüdyo'ya hoş geldin",'Futbol fikirlerini sahaya taşı','Takımını seç, taktiğini oluştur','Maçları incele, analizini hazırla','Haftanın kadrosunu sen belirle','Hangi takımı destekliyorsun?'];
const h1=f=>f.walk().find(n=>n.tagName==='h1')?.textContent;

test('six in-memory steps, textual progress and stepper, one focused h1, next/back and no URL or storage changes',async()=>{
  const f=fixture();await f.page.ready;
  for(let i=0;i<6;i++){
    assert.equal(f.byClass('onboarding-progress').textContent,`${i+1} / 6`);
    assert.equal(f.walk().filter(n=>n.tagName==='h1').length,1);assert.equal(f.document.activeElement.textContent,headings[i]);
    const items=f.byClass('onboarding-stepper').children;assert.equal(items.length,6);
    assert.equal(items.filter(n=>n.className==='is-complete').length,i);
    assert.deepEqual(items.map(n=>n.attrs['aria-current']??null),items.map((_,j)=>j===i?'step':null));
    if(i<5)await f.click(i===0?'Başla →':'Devam →');
  }
  assert.deepEqual(f.reads,['teams']);assert.equal(f.writes.length,0);assert.deepEqual(f.navigation,[]);assert.equal(f.window.location.pathname,'/hos-geldin');
  await f.click('← Geri');assert.equal(f.byClass('onboarding-progress').textContent,'5 / 6');assert.equal(h1(f),headings[4]);
  await f.click('← Geri');assert.equal(h1(f),headings[3]);await f.click('Devam →');assert.equal(h1(f),headings[4]);f.page.dispose();
});

test('every feature step has 2-3 hints and its own non-interactive illustration; final step shows the picker',async()=>{
  const f=fixture();await f.page.ready;const seen=new Set();
  for(let i=0;i<5;i++){
    const hints=f.byClass('onboarding-hints').children;assert(hints.length>=2&&hints.length<=3,`hints on ${i}`);
    const art=f.walk().find(n=>String(n.className).startsWith('onboarding-art '));assert(art);assert.equal(art.attrs['aria-hidden'],'true');
    seen.add(art.className);
    const inner=(n=art)=>[n,...n.children.flatMap(inner)];
    assert(!inner().some(n=>['button','input','select','a','textarea'].includes(n.tagName)),'illustrations contain no controls');
    assert(!f.walk().some(n=>n.className==='onboarding-teams'));
    await f.click(i===0?'Başla →':'Devam →');
  }
  assert.equal(seen.size,5);
  assert.deepEqual([...seen],['welcome','studio','board','matches','weekly'].map(k=>'onboarding-art onboarding-art-'+k));
  assert(f.walk().some(n=>n.className==='onboarding-teams'));assert(!f.walk().some(n=>String(n.className).startsWith('onboarding-art ')));
  f.page.dispose();
});

test('arrow keys move between steps, ignore form fields and never complete onboarding',async()=>{
  const f=fixture();await f.page.ready;
  assert.equal(await f.key('ArrowLeft'),false);assert.equal(h1(f),headings[0]);
  for(let i=1;i<6;i++){assert.equal(await f.key('ArrowRight'),true);assert.equal(h1(f),headings[i]);}
  assert.equal(await f.key('ArrowRight'),false);assert.equal(h1(f),headings[5]);
  assert.equal(await f.key('ArrowLeft',{tagName:'INPUT'}),false);assert.equal(h1(f),headings[5]);
  assert.equal(await f.key('ArrowLeft'),true);assert.equal(h1(f),headings[4]);
  assert.equal(f.writes.length,0);assert.deepEqual(f.navigation,[]);f.page.dispose();
});

test('canonical team radio selection survives back/forward and completes once with its slug at safe destination',async()=>{
  const f=fixture({search:'?next=%2Fmaclar.html'});await f.final();
  assert(f.find('button',"Taktik Stüdyo'ya Başla →").disabled);
  await f.choose('home-club');await f.click('← Geri');await f.click('Devam →');
  assert(f.walk().find(n=>n.tagName==='input'&&n.value==='home-club').checked);
  assert(f.find('span','✓ Seçildi'));assert.equal(f.reads.length,1);
  await f.click("Taktik Stüdyo'ya Başla →");assert.deepEqual(f.writes,[{favoriteTeamSlug:'home-club'}]);assert.deepEqual(f.navigation,['/maclar.html']);f.page.dispose();
});

test('no-team is explicit null; tour skip on every introductory step only opens the final step; final skip persists null',async()=>{
  const final=fixture();await final.final();await final.choose(null);await final.click("Taktik Stüdyo'ya Başla →");assert.deepEqual(final.writes,[{favoriteTeamSlug:null}]);final.page.dispose();
  for(let step=0;step<5;step++){
    const wait=deferred(),f=fixture({search:'?next=https://attacker.test',save:()=>wait.promise});await f.page.ready;
    for(let i=0;i<step;i++)await f.click(i===0?'Başla →':'Devam →');
    assert(!f.find('button','Şimdilik atla'));
    await f.click('Turu geç');assert.equal(h1(f),headings[5]);assert.equal(f.byClass('onboarding-progress').textContent,'6 / 6');
    assert.equal(f.writes.length,0);assert.equal(f.navigation.length,0);assert.deepEqual(f.reads,['teams']);assert(!f.find('button','Turu geç'));
    await f.choose('home-club');await f.click('Şimdilik atla');assert.deepEqual(f.writes,[{favoriteTeamSlug:null}]);assert.equal(f.navigation.length,0);
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
  const thrown=fixture({save:()=>{throw Error('private');}});await thrown.page.ready;await thrown.click('Turu geç');await thrown.click('Şimdilik atla');assert.equal(thrown.navigation.length,0);
  assert.equal(thrown.byClass('onboarding-message').textContent,'Tercihin kaydedilemedi. Tekrar dene.');assert(!thrown.walk().some(n=>n.textContent.includes('private')));thrown.page.dispose();
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
  let attempt=0;const f=fixture({load:async()=>++attempt===1?{ok:false,error:{code:'onboarding_unavailable'}}:{ok:true,profile:incomplete}});await f.page.ready;assert.equal(f.writes.length,0);assert.equal(f.navigation.length,0);await f.click('Tekrar dene');assert(f.find('h1',headings[0]));f.page.dispose();
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

test('O3 shared picker keeps all 18 canonical teams and explicit no-team option in O2',async()=>{
  const registrations=JSON.parse(await readFile(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
  const teams=normalizeCanonicalTeams(registrations.map(t=>({...t,catalogue_active:true})));
  const f=fixture({teams:async()=>teams});await f.final();
  const radios=f.walk().filter(n=>n.tagName==='input');assert.equal(radios.length,19);
  assert.deepEqual(radios.map(n=>n.value),[...teams.map(t=>t.id),'']);
  await f.choose('galatasaray');await f.click("Taktik Stüdyo'ya Başla →");
  assert.deepEqual(f.writes,[{favoriteTeamSlug:'galatasaray'}]);assert.deepEqual(f.navigation,['/studyo.html']);f.page.dispose();
});

test('OB3.1 showcase teams mirror canonical names/colors and every player exists in the bundled roster snapshot',async()=>{
  const registry=JSON.parse(await readFile(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
  const window={};new Function('window',await readFile(new URL('../dist/rosters.js',import.meta.url),'utf8'))(window);
  for(const [id,team] of Object.entries(showcaseTeams)){
    const canonical=registry.find(t=>t.id===id);assert(canonical,id);
    assert.deepEqual([team.name,team.short,team.primary,team.secondary],[canonical.display_name,canonical.short_name,canonical.color_primary,canonical.color_secondary]);
  }
  const roster=key=>window.TAKTIK_ROSTERS.teams[showcaseTeams[key].name].players;
  const has=(key,full,number)=>{const p=roster(key).find(p=>p.name===full);assert(p,`${full} not in ${key}`);if(number!==undefined)assert.equal(p.number,number,full);};
  for(const p of boardShowcase.players)has(boardShowcase.team,p.full,p.number);
  for(const p of [boardShowcase.substitution.out,boardShowcase.substitution.in,...boardShowcase.bench])assert(roster(boardShowcase.team).some(r=>r.number===p.number&&r.name.includes(p.name)),p.name);
  for(const side of ['home','away'])for(const [n,,full] of matchesShowcase.detail[side+'Lineup'])has(matchesShowcase.detail[side],full,n);
  for(const p of weeklyShowcase.players)has(p.team,p.full);
  for(const p of weeklyShowcase.picker)has(p.team,p.name);
  for(const [key,list] of [[studioShowcase.home,studioShowcase.homePlayers],[studioShowcase.away,studioShowcase.awayPlayers]])for(const [,,label] of list)if(label)assert(roster(key).some(p=>p.name.endsWith(label)),label);
});

test('OB3.1 illustrations show team names, colored kits and player names without media or controls',async()=>{
  const f=fixture();await f.page.ready;
  const expectations={
    studio:['Galatasaray','Fenerbahçe','Osimhen','Škriniar'],
    board:['Trabzonspor','Onana','Salah','Franculino','Paul Onuachu','Ozan Tufan'],
    matches:['Beşiktaş','Trabzonspor','Samsunspor','Başakşehir','Kökcü','Malinovsky','Stüdyoda Aç →'],
    weekly:['Ederson','Osimhen','Kanté','Victor Osimhen','Galatasaray','PNG İndir ↓'],
  };
  await f.click('Başla →');
  for(const [key,texts] of Object.entries(expectations)){
    const art=f.walk().find(n=>n.className==='onboarding-art onboarding-art-'+key);assert(art,key);
    const nodes=(n=art)=>[n,...n.children.flatMap(nodes)];
    const text=new Set(nodes().map(n=>n.textContent));
    for(const t of texts)assert(text.has(t),`${key}: ${t}`);
    const colors=new Set(nodes().map(n=>n.attrs['--tp']).filter(Boolean));
    assert(colors.size>=(key==='board'?1:2),`${key} colors`);
    for(const c of colors)assert(Object.values(showcaseTeams).some(t=>t.primary===c),c);
    assert(!nodes().some(n=>['img','svg','picture','video','button','input','a'].includes(n.tagName)),`${key} media/controls`);
    await f.click('Devam →');
  }
  const option=f.walk().find(n=>n.tagName==='label'&&n.children.some(c=>c.value==='home-club'));
  assert.equal(option.attrs['--club-primary'],'#123456');
  const none=f.walk().find(n=>n.tagName==='label'&&n.children.some(c=>c.tagName==='input'&&c.value===''));
  assert.equal(none.attrs['--club-primary'],undefined);
  assert.equal(f.writes.length,0);f.page.dispose();
});
