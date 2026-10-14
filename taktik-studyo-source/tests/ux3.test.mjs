import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolvePage} from '../src/lib/page-routes.js';
import {safeInternalRedirect} from '../src/lib/auth-redirects.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {createCatalogueSource} from '../src/lib/catalogue-source.js';
import {createWeeklyStore,emptyWeeklyXI,changeWeeklyFormation,pickWeeklyPlayer,moveWeeklySlot} from '../src/lib/weekly-xi.js';
import {mountWeeklyXI} from '../src/lib/weekly-xi-ui.js';
import {mountProfile} from '../src/lib/profile-ui.js';
import {A,B,ProfileNode,profileDocument,deferred,tick} from './helpers/profile-fixture.mjs';
import {matchBoardDocument,BoardNode,fire} from './helpers/match-board-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';

const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const navOrder=['/mac-studyosu','/studyo.html','/haftanin-ilk-11i','/maclar.html','/profil.html'];
test('all product navbars share stable DOM order; only active highlighting varies, no Comparison surface remains',()=>{
 for(const file of ['index','studyo','haftanin-ilk-11i','profil','maclar','mac','mac-studyosu','calismalarim']){
  const html=read('dist/'+file+'.html'),nav=html.match(/<nav\b[\s\S]*?<\/nav>/)[0];
  const links=[...nav.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(m=>m[1]).filter(h=>!['/giris.html','/kayit.html'].includes(h));
  assert.deepEqual(links,navOrder,file);
  assert(!/karsilastirma|comparisonLink|Karşılaştırma/.test(html),file);
  assert.equal((nav.match(/aria-current="page"/g)||[]).length,['index','calismalarim'].includes(file)?0:1,file);
 }
 for(const file of readdirSync(new URL('../dist/',import.meta.url)).filter(f=>f.endsWith('.html')))
  assert.doesNotMatch(read('dist/'+file),/href="[^"\n]*karsilastirma/);
 assert(!existsSync(new URL('../dist/comparison.js',import.meta.url)));
 assert(!existsSync(new URL('../dist/comparison.css',import.meta.url)));
});
test('retired routes redirect to a protected active page without mounting boards or touching old drafts',()=>{
 for(const path of ['/karsilastirma','/karsilastirma.html']){
  assert.deepEqual(resolvePage({pathname:path}),{kind:'retired',destination:'/studyo.html'});
  const calls=[];startPage({window:{location:{pathname:path,search:'?sol=x',replace:url=>calls.push(url)},get localStorage(){throw Error('No storage access');}},auth:new Proxy({}, {get(){throw Error('No Auth calls on redirect');}})});
  assert.deepEqual(calls,['/studyo.html']);assert.equal(resolvePage({pathname:calls[0]}).kind,'protected');
 }
 assert.equal(safeInternalRedirect('/karsilastirma.html'),'/studyo.html');
 assert.equal(safeInternalRedirect('/karsilastirma.html?next=https://evil.test'),null);
 assert.match(read('dist/karsilastirma.html'),/http-equiv="refresh" content="0;url=\/studyo.html"/);
 assert.doesNotMatch(read('dist/karsilastirma.html'),/script|iframe/);
});

const player={id:A,teamId:'galatasaray',name:'Saved player',teamName:'Galatasaray',number:9,positionGroup:'F',specificPosition:'ST',color:'#a61931',color2:'#f5bd28'};
function profile(storage,userId=A,current=()=>true){
 const f=profileDocument(),events=new ProfileNode(),stores=['canonical','legacy'].map(source=>createWeeklyStore({userId,source,storage,current}));
 const page=mountProfile({document:f.document,validatedUser:{id:userId},current,eventTarget:events,weeklyStores:stores,api:{load:async()=>({ok:true,profile:null})},projects:{getWorkspaceSummary:async()=>({ok:true,counts:{total:0,free:0,match:0},projects:[]})}});
 return {...f,events,page,fields:f.mounts[0].fields};
}
test('Weekly save → Profile → reopen restores exact players, formation and positions; updates reuse identity and date',async()=>{
 const storage=memory();let now=Date.parse('2026-10-13T10:00:00Z');
 const store=createWeeklyStore({userId:A,source:'canonical',storage,current:()=>true,now:()=>now});
 const state=moveWeeklySlot(pickWeeklyPlayer(changeWeeklyFormation(emptyWeeklyXI(),'4-4-2'),9,player),9,44,22);
 assert(store.write(state));const p=profile(storage);await p.page.ready;
 let cards=p.fields['#profileWeeklySaved'].children;assert.equal(cards.length,1);
 assert.equal(cards[0].href,'/haftanin-ilk-11i?saved=canonical');assert.equal(cards[0].children[0].children[1].textContent,'4-4-2 · 1/11 oyuncu');
 assert.equal(cards[0].children[1].attrs.datetime,'2026-10-13T10:00:00.000Z');
 const f=matchBoardDocument(cards[0].href),window=Object.create(f.window);Object.defineProperty(window,'localStorage',{value:storage});f.nodes.weeklyXIContent=new BoardNode();
 // An explicit profile link selects its saved namespace even if runtime source changed.
 const options={document:f.document,window,userId:A,current:()=>true,catalogue:{source:'legacy',model:{teams:[],players:[]}},now:()=>now};
 const editor=mountWeeklyXI(options),nodes=()=>allNodes(f.nodes.weeklyXIContent);
 const slot=nodes().filter(n=>n.className==='weekly-slot')[9];assert.equal(slot.style.left,'44%');assert.equal(slot.style.top,'22%');
 assert(nodes().some(n=>n.className==='weekly-player-name'&&n.textContent===player.name.split(' ').at(-1)));assert(slot.title.includes(player.name));assert.equal(store.read().state.slots[9].player.name,player.name);const select=nodes().find(n=>n.tagName==='select');assert.equal(select.value,'4-4-2');
 select.value='3-5-2';fire(select,'change');now+=60000;fire(nodes().find(n=>n.className==='weekly-save'),'click');
 await p.events.emit('storage');cards=p.fields['#profileWeeklySaved'].children;
 assert.equal(cards.length,1);assert.equal(cards[0].href,'/haftanin-ilk-11i?saved=canonical');assert.match(cards[0].children[0].children[1].textContent,/3-5-2/);
 assert.equal(cards[0].children[1].attrs.datetime,'2026-10-13T10:01:00.000Z');assert.equal(storage.data.size,1);
 assert.equal(store.read().state.slots[9].player.id,A);editor.dispose();p.page.dispose();
});
test('Weekly profile empty/error/legacy-date states and account/source separation remain truthful',async()=>{
 const storage=memory(),empty=profile(storage);assert.match(empty.fields['#profileWeeklyStatus'].textContent,/Henüz/);empty.page.dispose();
 const store=createWeeklyStore({userId:A,source:'legacy',storage,current:()=>true});store.write(emptyWeeklyXI());
 const key=[...storage.data.keys()][0];storage.setItem(key,JSON.stringify(emptyWeeklyXI()));
 const a=profile(storage);assert.equal(a.fields['#profileWeeklySaved'].children.length,1);assert.equal(a.fields['#profileWeeklySaved'].children[0].children[1].textContent,'Kayıt tarihi mevcut değil');
 const b=profile(storage,B);assert.equal(b.fields['#profileWeeklySaved'].children.length,0);
 storage.data.delete(key);await a.events.emit('storage');assert.equal(a.fields['#profileWeeklySaved'].children.length,0);
 storage.setItem(key,'invalid');await a.events.emit('storage');assert.match(a.fields['#profileWeeklyStatus'].textContent,/okunamadı/);
 a.page.dispose();b.page.dispose();assert.equal(a.root.children.length,0);assert.equal(a.events.listeners.size,0);
 let current=true;const scoped=createWeeklyStore({userId:A,source:'canonical',storage,current:()=>current});current=false;assert.equal(scoped.read().ok,false);assert.equal(scoped.write(emptyWeeklyXI()),false);
});

function startup(){
 const catalogue=deferred(),overrides=deferred(),events=[],nodes=Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut','studioRoot'].map(id=>[id,new ProfileNode()]));let user=A;
 const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},like(){return q;},then(a,b){events.push('overrides');return overrides.promise.then(a,b);}};
 const auth={initialize:async()=>({ok:true}),getState:()=>({status:'signed_in',user:{id:user}}),validateUser:async()=>{events.push('validate');return {ok:true,user:{id:user}};},subscribe:()=>()=>{}};
 const window=Object.assign(new ProfileNode(),{location:{pathname:'/studyo',replace(){throw Error('No redirect');}},localStorage:memory(),TAKTIK_APP:{mountStudio(_root,_scope,edits){events.push('mount');assert(edits.ready());return()=>events.push('dispose');}}});
 const page=startPage({auth,window,document:{getElementById:id=>nodes[id]},backend:{catalogue:{canonical:true,dataClient:{from(){return q;}}},loadCatalogue(){events.push('catalogue');return catalogue.promise;}}});
 return {events,nodes,page,catalogue,overrides,switchUser(){user=B;}};
}
test('Studio loads catalogue and overrides concurrently after validation, mounts once only after both settle',async()=>{
 const f=startup();await tick();assert.deepEqual(f.events,['validate','catalogue','overrides']);
 f.catalogue.resolve();await tick();assert(!f.events.includes('mount'));
 f.overrides.resolve({data:[]});await f.page.ready;assert.deepEqual(f.events,['validate','catalogue','overrides','mount']);f.page.dispose();assert.equal(f.events.at(-1),'dispose');
});
test('parallel Studio startup rejects stale account work and remains fail-closed on catalogue errors',async()=>{
 const stale=startup();await tick();stale.switchUser();stale.catalogue.resolve();stale.overrides.resolve({data:[]});await stale.page.ready;assert(!stale.events.includes('mount'));stale.page.dispose();
 const failed=startup();await tick();failed.catalogue.resolve(Promise.reject(Error('catalogue unavailable')));failed.overrides.resolve({data:[]});await failed.page.ready;
 assert(!failed.events.includes('mount'));assert.equal(failed.nodes.protectedContent.hidden,true);assert.match(failed.nodes.guardMessage.textContent,/Sayfa verileri/);failed.page.dispose();
});

test('canonical catalogue overlaps defaults with roster reads and preserves single-flight installation',async()=>{
 const teams=deferred(),defaults=deferred(),calls=[],window={location:{origin:'http://localhost:4173'}};
 const players=Array.from({length:11},(_,i)=>({id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,team_id:'galatasaray',display_name:'Player '+i,shirt_number:i+1,position_group:'F',specific_position:'ST',catalogue_active:true}));
 const source=createCatalogueSource({config:{source:'canonical'},window,client:{auth:{getSession:async()=>({data:{session:{access_token:'unit-test-only'}}})}},fetchImpl:async(_path,options)=>{
  const body=JSON.parse(options.body),name=body.action==='defaults'?'defaults':body.query.table;calls.push(name);
  const data=name==='defaults'?await defaults.promise:name==='catalogue_teams'?await teams.promise:players;
  return {ok:true,json:async()=>({data})};
 }});
 const first=source.load(),second=source.load();await tick();
 assert.deepEqual([...calls].sort(),['catalogue_teams','defaults']);
 teams.resolve([{id:'galatasaray',display_name:'Galatasaray',short_name:'GS',color_primary:'#a61931',color_secondary:'#f5bd28',sort_order:1,catalogue_active:true}]);await tick();
 assert(calls.includes('catalogue_players'));assert.equal(window.TAKTIK_CATALOGUE_RUNTIME,source);assert.equal(source.model.players.length,11);
 defaults.resolve({});await source.defaultsReady;const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(a.players.length,11);assert.equal(window.TAKTIK_CATALOGUE_RUNTIME,source);
 await source.load();assert.equal(calls.length,3);
});
