import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEEKLY_FORMATIONS,emptyWeeklyXI,weeklySlots,weeklySnapshot,changeWeeklyFormation,pickWeeklyPlayer,moveWeeklySlot,createWeeklyStore,weeklyCatalogue} from '../src/lib/weekly-xi.js';
import {mountWeeklyXI} from '../src/lib/weekly-xi-ui.js';
import {latestPlayedWeek,weeklyMosaic} from '../src/lib/weekly-xi-panel.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {loginDestination,loginUrl,safeInternalRedirect} from '../src/lib/auth-redirects.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {matchBoardDocument,BoardNode,fire} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf,tick,deferred} from './helpers/matches-fixture.mjs';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const model={teams:[{id:'galatasaray',name:'Galatasaray',color:'#a51935',color2:'#efb62a',catalogueActive:true},{id:'fenerbahce',name:'Fenerbahçe',color:'#19294d',color2:'#f3d233',catalogueActive:true}],players:[
 {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',teamId:'galatasaray',name:'Victor Osimhen',number:45,positionGroup:'F',specificPosition:'ST',catalogueActive:true},
 {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',teamId:'fenerbahce',name:'İsmail Yüksek',number:5,positionGroup:'M',specificPosition:'CM',catalogueActive:true},
 {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',teamId:'galatasaray',name:'Inactive',number:null,positionGroup:'M',specificPosition:'CM',catalogueActive:false},
]};
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
function fixture({storage=memory(),source='canonical',userId=A,current=()=>true,playerOverrides}={}){
 const f=matchBoardDocument('/haftanin-ilk-11i');f.nodes.weeklyXIContent=new BoardNode();
 const window=Object.create(f.window);Object.defineProperty(window,'localStorage',{value:storage});
 let clock=0,timerId=0;const timers=new Map();window.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,time:clock+ms});return timerId;};window.clearTimeout=id=>timers.delete(id);
 const advance=ms=>{clock+=ms;for(const [id,timer] of timers)if(timer.time<=clock){timers.delete(id);timer.fn();}};
 const options={document:f.document,window,userId,current,catalogue:{source,model},playerOverrides};
 return {...f,window,storage,options,root:f.nodes.weeklyXIContent,timers,advance};
}
const nodes=(f,cls)=>allNodes(f.root).filter(n=>n.className===cls||n.attrs.class===cls),one=(f,cls)=>nodes(f,cls)[0];

test('weekly XI formation geometry, all selections retained, duplicate and corrupt snapshots rejected',()=>{
 let state=emptyWeeklyXI();const players=Array.from({length:11},(_,i)=>({...weeklyCatalogue(model)[0],id:'player-'+i}));
 players.forEach((p,i)=>{state=pickWeeklyPlayer(state,i,p);});
 assert.equal(pickWeeklyPlayer(state,1,players[0]),null);
 for(const shape of Object.keys(WEEKLY_FORMATIONS)){
  state=changeWeeklyFormation(state,shape);assert.equal(state.slots.length,11);assert.equal(state.slots[0].role,'GK');
  assert.deepEqual(state.slots.map(s=>s.player.id),players.map(p=>p.id));assert(weeklySnapshot(state));
  assert.equal(new Set(state.slots.map(s=>s.x+':'+s.y)).size,11);
 }
 const corrupt=structuredClone(state);corrupt.slots[1].player=corrupt.slots[0].player;assert.equal(weeklySnapshot(corrupt),null);
 corrupt.slots[1].player=null;corrupt.slots[1].x=Infinity;assert.equal(weeklySnapshot(corrupt),null);
 assert.equal(weeklySnapshot({...state,version:3}),null);assert.equal(weeklySlots('toString'),null);
 assert.equal(weeklyCatalogue(model).length,2);
});

test('weekly supports every classic studio formation, with compact two-player lines and eleven roles',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const shapes=JSON.parse(app.match(/const shapes=(\[[^;]+\]);/)[1].replaceAll("'",'"'));
 assert.deepEqual(Object.keys(WEEKLY_FORMATIONS),shapes);assert.equal(shapes.length,24);
 for(const shape of shapes){
  const slots=weeklySlots(shape);assert.equal(slots.length,11);
  assert.deepEqual(WEEKLY_FORMATIONS[shape].map(r=>r.length),shape.split('-').map(Number));
  for(const y of new Set(slots.map(s=>s.y))){const row=slots.filter(s=>s.y===y);if(row.length===2)assert.deepEqual(row.map(s=>s.x),[36,64]);}
 }
});

test('weekly v1 saves migrate players to compact layout; v2 custom coordinates restore and invalid coordinates fail',()=>{
 let state=changeWeeklyFormation(emptyWeeklyXI(),'4-4-2');state=pickWeeklyPlayer(state,9,weeklyCatalogue(model)[0]);
 const old=structuredClone(state);old.version=1;old.slots[9].x=14;old.slots[10].x=86;
 const migrated=weeklySnapshot(old);assert.equal(migrated.version,2);assert.equal(migrated.slots[9].x,36);assert.equal(migrated.slots[9].player.id,model.players[0].id);
 const moved=moveWeeklySlot(migrated,9,53.5,24.25);assert.deepEqual(weeklySnapshot(moved),moved);
 assert.equal(moveWeeklySlot(moved,0,50,50),moved);assert.equal(moveWeeklySlot(moved,9,NaN,50),moved);
 assert.equal(moveWeeklySlot(moved,9,-5,120).slots[9].x,9);assert.equal(moveWeeklySlot(moved,9,-5,120).slots[9].y,92);
 for(const x of [null,'50',NaN,Infinity,8,92]){const bad=structuredClone(moved);bad.slots[9].x=x;assert.equal(weeklySnapshot(bad),null);}
 const storage=memory(),store=createWeeklyStore({userId:A,source:'canonical',storage,current:()=>true});assert(store.write(moved));assert.deepEqual(store.read().state,moved);
 assert.equal(changeWeeklyFormation(moved,'5-2-3').slots[9].player.id,model.players[0].id);
});

function pickFirst(f,index=0){fire(nodes(f,'weekly-slot')[index],'click');fire(one(f,'weekly-result'),'click');return nodes(f,'weekly-slot')[index];}
test('weekly mouse/touch drag commits once, suppresses picker click, saves and reopens exact coordinates',()=>{
 for(const pointerType of ['mouse','touch']){
  const f=fixture(),page=mountWeeklyXI(f.options),b=pickFirst(f);
  fire(b,'pointerdown',{clientX:100,clientY:100,pointerType});fire(b,'pointermove',{clientX:200,clientY:50,pointerType});
  fire(b,'pointerup',{clientX:200,clientY:50,pointerType});assert.equal(b.style.left,'60%');assert.equal(b.style.top,'81%');
  fire(b,'click',{detail:1});assert.equal(one(f,'weekly-picker').open,false);
  assert.equal(b.listeners.get('pointermove').size,0);assert.equal(f.window.listeners.get('blur').size,0);assert.equal(b.capture,null);
  fire(one(f,'weekly-save'),'click');page.dispose();const again=mountWeeklyXI(f.options),restored=nodes(f,'weekly-slot')[0];
  assert.equal(restored.style.left,'60%');assert.equal(restored.style.top,'81%');
  fire(restored,'pointerdown',{clientX:100,clientY:100});fire(restored,'pointerup',{clientX:102,clientY:101});fire(restored,'click',{detail:1});
  assert.equal(one(f,'weekly-picker').open,true);again.dispose();
 }
});

test('weekly keyboard movement preserves focus, clamps bounds and allows Enter-style picker activation',()=>{
 const f=fixture(),page=mountWeeklyXI(f.options),b=pickFirst(f);
 fire(b,'keydown',{key:'ArrowRight'});assert.equal(b.style.left,'51%');
 fire(b,'keydown',{key:'ArrowUp',shiftKey:true});assert.equal(b.style.top,'86%');assert.equal(b.focused,true);
 for(let i=0;i<100;i++)fire(b,'keydown',{key:'ArrowRight'});assert.equal(b.style.left,'91%');
 fire(b,'click',{detail:0});assert.equal(one(f,'weekly-picker').open,true);page.dispose();
});

test('weekly gestures cancel on Escape, pointer cancellation, capture loss, blur, resize, stale account and disposal',()=>{
 for(const reason of ['Escape','pointercancel','lostpointercapture','blur','resize','stale','dispose']){
  let current=true;const f=fixture({current:()=>current}),page=mountWeeklyXI(f.options),b=pickFirst(f);
  fire(b,'pointerdown',{button:2});assert.equal(b.capture,undefined);
  fire(b,'pointerdown');fire(b,'pointermove',{pointerId:2,clientX:300});assert.equal(b.style.left,'50%');
  fire(b,'pointermove',{clientX:200,clientY:50});assert.equal(b.style.left,'60%');
  if(reason==='Escape')fire(b,'keydown',{key:'Escape'});
  else if(reason==='blur'||reason==='resize')fire(f.window,reason);
  else if(reason==='stale'){current=false;fire(b,'pointermove');}
  else if(reason==='dispose')page.dispose();
  else fire(b,reason);
  assert.equal(b.style.left,'50%');assert.equal(b.style.top,'89%');assert.equal(b.capture,null);
  for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])assert.equal(b.listeners.get(type).size,0);
  for(const type of ['blur','resize'])assert.equal(f.window.listeners.get(type).size,0);
  assert.equal(f.storage.data.size,0);page.dispose();
 }
});

for(const source of ['legacy','canonical'])test('weekly XI '+source+' UI: empty pitch, dialog/search/pick/duplicate/remove, formation and save/reopen',()=>{
 const f=fixture({source}),page=mountWeeklyXI(f.options);
 assert.equal(nodes(f,'weekly-slot').length,11);assert.equal(nodes(f,'weekly-plus').length,11);
 fire(nodes(f,'weekly-slot')[0],'click');assert.equal(one(f,'weekly-picker').open,true);
 const search=allNodes(f.root).find(n=>n.type==='search');assert(search.focused);
 search.value='ismail';fire(search,'input');assert.equal(nodes(f,'weekly-result').length,1);assert(textOf(one(f,'weekly-result')).includes('Fenerbahçe'));
 fire(one(f,'weekly-result'),'click');assert.equal(one(f,'weekly-picker').open,false);assert.equal(nodes(f,'weekly-plus').length,10);assert.equal(nodes(f,'weekly-player-name')[0].textContent,'İsmail Yüksek');
 fire(nodes(f,'weekly-slot')[1],'click');const duplicate=nodes(f,'weekly-result').find(n=>n.dataset.playerId===model.players[1].id);assert.equal(duplicate.disabled,true);fire(duplicate,'click');assert.equal(nodes(f,'weekly-plus').length,10);
 search.value='galata';fire(search,'input');fire(one(f,'weekly-result'),'click');assert.equal(nodes(f,'weekly-plus').length,9);
 const formation=allNodes(f.root).find(n=>n.tagName==='select');formation.value='3-4-3';fire(formation,'change');assert.equal(nodes(f,'weekly-player-name').length,2);
 fire(one(f,'weekly-save'),'click');assert.equal(f.storage.data.size,1);assert.match(one(f,'weekly-status').textContent,/kaydedildi/);page.dispose();assert.equal(f.root.children.length,0);
 const reopened=mountWeeklyXI(f.options);assert.equal(nodes(f,'weekly-player-name').length,2);assert.equal(allNodes(f.root).find(n=>n.tagName==='select').value,'3-4-3');
 fire(nodes(f,'weekly-slot')[0],'click');fire(one(f,'weekly-remove'),'click');assert.equal(nodes(f,'weekly-player-name').length,1);
 fire(nodes(f,'weekly-slot')[0],'click');fire(one(f,'weekly-picker'),'cancel');assert.equal(one(f,'weekly-picker').open,false);assert(nodes(f,'weekly-slot')[0].focused);reopened.dispose();
});

test('weekly saved state is account/source isolated; stale or unavailable storage cannot write',()=>{
 const storage=memory();let current=true;const options={userId:A,source:'canonical',storage,current:()=>current};
 const store=createWeeklyStore(options),state=pickWeeklyPlayer(emptyWeeklyXI(),0,weeklyCatalogue(model)[0]);assert(store.write(state));
 assert.equal(createWeeklyStore({...options,userId:B}).read().state,null);assert.equal(createWeeklyStore({...options,source:'legacy'}).read().state,null);
 current=false;assert.equal(store.write(emptyWeeklyXI()),false);assert.equal(store.read().ok,false);
 const key=[...storage.data.keys()][0];storage.setItem(key,'bad JSON');current=true;assert.equal(store.read().ok,false);
 const broken=createWeeklyStore({...options,storage:{getItem(){throw Error();},setItem(){throw Error();}}});assert.equal(broken.read().ok,false);assert.equal(broken.write(state),false);
});

test('weekly override is presentation-only; safe text render, empty search, stale callbacks and cleanup',()=>{
 let current=true,off=0;
 const f=fixture({current:()=>current,playerOverrides:{key:id=>'internal:'+id,effective:(_key,p)=>({...p,name:'<img onerror=bad> Custom',number:9}),subscribe:()=>()=>{off++;}}}),page=mountWeeklyXI(f.options);
 fire(nodes(f,'weekly-slot')[0],'click');const search=allNodes(f.root).find(n=>n.type==='search');search.value='missing';fire(search,'input');assert.equal(nodes(f,'weekly-result').length,0);
 search.value='custom';fire(search,'input');fire(one(f,'weekly-result'),'click');assert.equal(nodes(f,'weekly-player-name')[0].textContent,'<img onerror=bad> Custom');
 fire(one(f,'weekly-save'),'click');const stored=JSON.parse([...f.storage.data.values()][0]);assert.equal(stored.slots[0].player.name,'Victor Osimhen');
 const previous=[...f.storage.data.values()][0];current=false;fire(one(f,'weekly-save'),'click');assert.equal([...f.storage.data.values()][0],previous);page.dispose();assert.equal(off,1);
});

for(const path of ['/haftanin-ilk-11i','/haftanin-ilk-11i.html'])test(path+' route/guard: validates first, catalogue mounts; anonymous and recovery blocked',async()=>{
 assert.deepEqual(resolvePage(new URL(path,'https://example.test')),{kind:'protected',page:'weekly-xi',path:'/haftanin-ilk-11i.html'});
 assert.equal(safeInternalRedirect('/haftanin-ilk-11i.html'),'/haftanin-ilk-11i.html');assert.equal(loginDestination('?next=/haftanin-ilk-11i.html'),'/haftanin-ilk-11i.html');
 const f=fixture(),wait=deferred();f.window.location=new URL(path,'http://localhost:4173');let loads=0;
 const auth={getState:()=>({status:'signed_in',user:{id:A}}),initialize:async()=>({ok:true}),subscribe:()=>()=>{},validateUser:()=>wait.promise};
 const page=startPage({auth,document:f.document,window:f.window,backend:{catalogue:f.options.catalogue,loadCatalogue:async()=>{loads++;}},client:null});
 await tick();assert.equal(loads,0);wait.resolve({ok:true,user:{id:A}});await page.ready;assert.equal(loads,1);assert.equal(nodes(f,'weekly-slot').length,11);page.dispose();assert.equal(f.root.children.length,0);
 for(const status of ['signed_out','password_recovery']){
  const g=fixture();const nav=[];g.window.location={pathname:path,search:'',replace:url=>nav.push(url)};
  const guarded=startPage({auth:{...auth,getState:()=>({status,user:status==='signed_out'?null:{id:A}}),validateUser(){throw Error('must not validate');}},document:g.document,window:g.window,backend:{loadCatalogue(){throw Error('must not load');}}});
  await guarded.ready;assert.equal(g.root.children.length,0);assert.deepEqual(nav,[loginUrl('/haftanin-ilk-11i.html')]);guarded.dispose();
 }
});

test('weekly static shell is protected, has both route mappings and primary navigation entry',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('dist/haftanin-ilk-11i.html'),/id="protectedContent"[^>]*hidden inert/);
 assert.match(read('dist/haftanin-ilk-11i.html'),/weekly-xi.css/);assert.doesNotMatch(read('dist/haftanin-ilk-11i.html'),/rosters.js/);
 assert.match(read('dist/_redirects'),/\/haftanin-ilk-11i \/haftanin-ilk-11i.html 200/);
 for(const file of ['index','studyo','karsilastirma','profil','maclar','mac','mac-studyosu','calismalarim'])assert.match(read('dist/'+file+'.html'),/href="\/haftanin-ilk-11i"/);
});

test('weekly editorial controls replace/remove safely, preserve canonical identity and return focus',()=>{
 const f=fixture(),page=mountWeeklyXI(f.options);
 assert.equal(nodes(f,'weekly-slot')[1].attrs['aria-label'],'Sol bek için oyuncu seç');
 const b=pickFirst(f,1);assert.equal(b.tagName,'button');assert.match(b.attrs['aria-label'],/Victor Osimhen, sol bek slotu/);
 assert.equal(nodes(f,'weekly-role')[1].textContent,'LB');assert.match(b.title,/Victor Osimhen/);
 assert.equal(allNodes(b).filter(n=>n.tagName==='button').length,1,'action buttons must not nest inside player button');
 fire(one(f,'weekly-replace'),'click');assert.equal(one(f,'weekly-picker').open,true);
 assert.equal(allNodes(f.root).find(n=>n.id==='weeklyPickerTitle').textContent,'LB için oyuncu seç');
 const search=allNodes(f.root).find(n=>n.type==='search');assert.equal(search.placeholder,'Oyuncu ara…');assert(search.focused);
 search.value='ismail';fire(search,'input');assert.match(textOf(one(f,'weekly-result')),/Fenerbahçe · 5 · CM/);fire(one(f,'weekly-result'),'click');
 assert.equal(nodes(f,'weekly-player-name')[0].textContent,'İsmail Yüksek');assert.equal(nodes(f,'weekly-role')[1].textContent,'LB');assert(nodes(f,'weekly-slot')[1].focused);
 fire(one(f,'weekly-save'),'click');const saved=JSON.parse([...f.storage.data.values()][0]);
 assert.equal(saved.slots[1].player.id,model.players[1].id);assert.equal(saved.slots[1].player.specificPosition,'CM');assert.equal(saved.slots[1].role,'LB');assert.equal(saved.version,2);
 assert.doesNotMatch(JSON.stringify(saved),/fotmob|athleteId|providerId/i);
 fire(one(f,'weekly-drop'),'click');assert.equal(nodes(f,'weekly-plus').length,11);assert(nodes(f,'weekly-slot')[1].focused);
 // Touch continues to use the ordinary slot tap and modal removal, without hover.
 const touch=pickFirst(f,9);fire(touch,'click',{detail:1,pointerType:'touch'});assert.equal(one(f,'weekly-remove').hidden,false);
 fire(one(f,'weekly-remove'),'click');assert.equal(nodes(f,'weekly-plus').length,11);assert.equal(one(f,'weekly-picker').open,false);page.dispose();
});

test('weekly save/load toasts expire without layout messages, announce politely and cancel on edit/dispose',()=>{
 const f=fixture(),page=mountWeeklyXI(f.options);assert.equal(one(f,'weekly-status').textContent,'');assert.equal(f.timers.size,0);
 pickFirst(f);fire(one(f,'weekly-save'),'click');const toast=one(f,'weekly-status');
 assert.equal(toast.attrs.role,'status');assert.equal(toast.attrs['aria-live'],'polite');assert.equal(toast.attrs['aria-atomic'],'true');
 assert.equal(toast.dataset.visible,'true');assert.equal(toast.textContent,'Kadron kaydedildi.');assert.equal(f.timers.size,1);
 f.advance(3199);assert.equal(toast.dataset.visible,'true');f.advance(1);assert.equal(toast.dataset.visible,'false');assert.equal(toast.textContent,'');
 page.dispose();const again=mountWeeklyXI(f.options);assert.equal(one(f,'weekly-status').textContent,'Kadron yüklendi.');f.advance(3200);assert.equal(one(f,'weekly-status').textContent,'');
 fire(one(f,'weekly-save'),'click');fire(nodes(f,'weekly-slot')[0],'keydown',{key:'ArrowLeft'});
 assert.equal(one(f,'weekly-status').textContent,'');assert.equal(one(f,'weekly-save-state').textContent,'Kaydedilmedi');assert.equal(f.timers.size,0);
 fire(one(f,'weekly-save'),'click');again.dispose();assert.equal(f.timers.size,0);f.advance(10000);assert.equal(f.root.children.length,0);
});

test('weekly storage failure shows transient error, leaves editing available and never reports success',()=>{
 const f=fixture({storage:{getItem(){throw Error('private storage error');},setItem(){throw Error('private storage error');}}}),page=mountWeeklyXI(f.options);
 assert.equal(nodes(f,'weekly-slot').length,11);assert.equal(one(f,'weekly-status').dataset.error,'true');f.advance(6500);assert.equal(one(f,'weekly-status').textContent,'');
 pickFirst(f);fire(one(f,'weekly-save'),'click');assert.match(one(f,'weekly-status').textContent,/Kaydetme başarısız/);assert.doesNotMatch(textOf(f.root),/private storage error/);
 assert.equal(one(f,'weekly-save-state').textContent,'Kaydedilmedi');f.advance(6500);assert.equal(one(f,'weekly-status').textContent,'');page.dispose();
});

test('weekly stale contextual actions cannot change a new account or write storage',()=>{
 let current=true;const f=fixture({current:()=>current}),page=mountWeeklyXI(f.options);pickFirst(f);
 const oldName=one(f,'weekly-player-name').textContent;current=false;
 fire(one(f,'weekly-drop'),'click');fire(one(f,'weekly-replace'),'click');fire(one(f,'weekly-save'),'click');
 assert.equal(one(f,'weekly-player-name').textContent,oldName);assert.equal(one(f,'weekly-picker').open,false);assert.equal(f.storage.data.size,0);assert.equal(f.timers.size,0);page.dispose();
});

test('weekly composition separates artwork from controls; long names stay available and all formations keep eleven slots',()=>{
 const f=fixture(),longName='A very long footballer name for readable title and accessible player labeling';
 f.options.catalogue={...f.options.catalogue,model:{...model,players:model.players.map((p,i)=>i===0?{...p,name:longName}:p)}};
 const page=mountWeeklyXI(f.options),b=pickFirst(f);
 assert(b.title.includes(longName));assert(b.attrs['aria-label'].includes(longName));assert.equal(one(f,'weekly-player-name').textContent,longName);
 const composition=one(f,'weekly-workspace');assert.equal(composition.dataset.composition,'weekly-xi');
 assert.equal(allNodes(composition).some(n=>n.className==='weekly-controls'),false);
 assert.equal(one(f,'weekly-toolbar').dataset.editControl,'true');assert.equal(one(f,'weekly-slot-actions').dataset.editControl,'true');
 assert.equal(textOf(one(f,'weekly-poster-type')),' TEAM OF THE WEEK');
 const formation=allNodes(f.root).find(n=>n.tagName==='select');
 for(const shape of Object.keys(WEEKLY_FORMATIONS)){
  formation.value=shape;fire(formation,'change');assert.equal(nodes(f,'weekly-slot').length,11);assert.equal(nodes(f,'weekly-player-name').length,1);
  assert.deepEqual(nodes(f,'weekly-role').map(n=>n.textContent),weeklySlots(shape).map(s=>s.role));
 }
 assert.equal(f.timers.size,1);page.dispose();assert.equal(f.timers.size,0);
});

test('last played week needs finished historical evidence, not upcoming, live, query or highest round',()=>{
 const now=Date.parse('2026-10-03T00:00:00Z');
 const matches=[{round:8,status:'finished',kickoff:'2026-09-29T18:00:00Z'},
  {round:9,status:'live',kickoff:'2026-10-02T18:00:00Z'},
  {round:10,status:'finished',kickoff:'2026-10-10T18:00:00Z'},
  {round:12,status:'postponed',kickoff:'2026-10-01T18:00:00Z'},
  {round:9,status:'upcoming',kickoff:'2026-10-01T18:00:00Z'}];
 assert.equal(latestPlayedWeek(matches,now),8);assert.equal(latestPlayedWeek([],now),null);
 assert.equal(latestPlayedWeek([{round:8,status:'finished',kickoff:'bad'}],now),null);
 assert.equal(latestPlayedWeek([...matches,{round:7,status:'finished',kickoff:'2026-10-01T18:00:00Z'}],now),7);
});

test('club mosaic is deterministic, weighted, bounded, complete and independent of slot order',()=>{
 const player=weeklyCatalogue(model)[0];
 const slots=Array.from({length:11},(_,i)=>({player:{...player,teamId:i<7?'dominant':'club-'+i,color:i<7?'#a51935':'#19294d'}}));
 const tiles=weeklyMosaic(slots);assert.deepEqual(tiles,weeklyMosaic([...slots].reverse()));assert.equal(tiles.length,8);
 assert(tiles.filter(t=>t.color==='#a51935').length>tiles.filter(t=>t.color==='#19294d').length);
 const cells=new Set();for(const t of tiles)for(let x=t.x;x<t.x+t.w;x++)for(let y=t.y;y<t.y+t.h;y++){assert(!cells.has(x+','+y));cells.add(x+','+y);}
 assert.equal(cells.size,36);assert(weeklyMosaic([]).every(t=>t.color===null));
});

test('right mosaic reacts to select/remove; latest week loads without blocking editor and stale results are ignored',async()=>{
 let current=true;const pending=deferred(),f=fixture({current:()=>current});f.options.matchesApi={load:()=>pending.promise};f.options.now=()=>Date.parse('2026-10-03T00:00:00Z');
 const page=mountWeeklyXI(f.options);assert.equal(nodes(f,'weekly-slot').length,11);assert.equal(one(f,'weekly-week-number').textContent,'—');
 assert.equal(allNodes(one(f,'weekly-controls')).some(n=>n.textContent==='Diziliş'),false);
 assert.equal(allNodes(one(f,'weekly-controls')).find(n=>n.tagName==='select').attrs['aria-label'],'Diziliş');
 const b=pickFirst(f);assert(nodes(f,'weekly-mosaic-cell').some(n=>n.children.some(c=>c.attrs.fill==='#a51935')));
 fire(one(f,'weekly-drop'),'click');assert(nodes(f,'weekly-mosaic-cell').every(n=>n.children.some(c=>c.attrs.fill==='#284c40')&&n.children.some(c=>c.attrs.fill==='#a68b4b')));
 assert.equal(one(f,'weekly-poster-art').attrs.role,'img');assert.equal(one(f,'weekly-poster-art').attrs['aria-label'],'Süper Lig hafta bilgisi');
 current=false;pending.resolve({ok:true,matches:[{round:8,status:'finished',kickoff:'2026-10-01T18:00:00Z'}]});await page.ready;
 assert.equal(one(f,'weekly-week-number').textContent,'—');assert.equal(f.storage.data.size,0);page.dispose();
 const failed=fixture();failed.options.matchesApi={load:async()=>{throw Error('provider detail');}};const next=mountWeeklyXI(failed.options);await next.ready;
 assert.equal(one(failed,'weekly-week-number').textContent,'—');assert.equal(one(failed,'weekly-week-caption'),undefined);assert.equal(nodes(failed,'weekly-slot').length,11);next.dispose();
});
