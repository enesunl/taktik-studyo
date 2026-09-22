import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFormation,createMatchLayout,matchStudioAvailable,matchPageUrl} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {normalizeDetail} from '../supabase/functions/matches/detail.js';
import {detail,resources} from './helpers/match-detail-fixture.mjs';
import {match,event,allNodes,textOf,deferred,tick} from './helpers/matches-fixture.mjs';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';

for(const formation of ['4-3-3','4-4-2','4-2-3-1','4-1-4-1','3-4-3','3-5-2','3-4-2-1','5-3-2','5-4-1'])test('formation '+formation,()=>{
  assert.deepEqual(parseFormation(formation),formation.split('-').map(Number));
});
test('invalid formations never masquerade as a named valid formation',()=>{
  for(const value of ['',null,'abc','4-4','4-4-3','0-5-5','4--5-1',' 4-4-2','4-04-2','4-4-2<script>'])assert.equal(parseFormation(value),null);
});
test('22 stable identities, mirroring, broad positions, source immutability and minimal input model',()=>{
  const full=detail(),before=JSON.stringify(full),model=createMatchLayout(full);
  assert.ok(Object.isFrozen(model));assert.ok(Object.isFrozen(model.home.players[0]));
  assert.equal(model.home.players.length,11);assert.equal(model.away.players.length,11);
  assert.equal(new Set([...model.home.players,...model.away.players].map(p=>p.key)).size,22);
  assert.equal(model.home.players[0].initialX,7);assert.equal(model.away.players[0].initialX,93);
  assert.equal(model.home.players.at(-1).initialX,45);assert.equal(model.away.players.at(-1).initialX,55);
  assert.equal(model.home.players[0].initialY,model.away.players[0].initialY);
  const same=detail();same.lineups.away.formation=same.lineups.home.formation;const mirrored=createMatchLayout(same);
  mirrored.home.players.forEach((p,i)=>{assert.equal(p.initialX+mirrored.away.players[i].initialX,100);assert.equal(p.initialY,mirrored.away.players[i].initialY);});
  assert.deepEqual(model.home.players.map(p=>p.playerId),full.lineups.home.starters.map(p=>p.id));
  assert.equal(JSON.stringify(full),before);assert.doesNotMatch(JSON.stringify(model),/substitutes|statistics|incidents|photo|video|expected_goals/);
});
test('fallback uses actual broad groups, never a fabricated formation or goalkeeper',()=>{
  const full=detail();full.lineups.home.formation=null;full.lineups.away.formation='4-4';
  const model=createMatchLayout(full);assert.equal(model.home.formation,null);assert.equal(model.away.formation,null);
  assert.equal(model.home.players.length,11);assert.equal(new Set(model.home.players.filter(p=>p.position==='defender').map(p=>p.initialX)).size,1);
  full.lineups.home.starters[0].position='unknown';assert.equal(createMatchLayout(full),null);
});
test('invalid, predicted, missing, duplicate, 10/12-player and normalized duplicate XI fail closed',()=>{
  for(const change of [f=>f.lineups=null,f=>f.lineups.status='predicted',f=>f.lineups.home.starters.pop(),f=>f.lineups.home.starters.push({...f.lineups.home.starters[0],id:'999'}),f=>f.lineups.home.starters[1].id=f.lineups.home.starters[0].id,f=>f.lineups.home.starters[0].id='',f=>delete f.lineups.home.startersValid]){
    const full=detail();change(full);assert.equal(matchStudioAvailable(full),false);assert.equal(createMatchLayout(full),null);
  }
  for(const change of [r=>r.lineups.value.lineups.home.players.push({...r.lineups.value.lineups.home.players[0]}),r=>r.lineups.value.lineups.home.players[0].id=null]){
    const r=resources();change(r);const full=normalizeDetail(match(),event(),r);assert.equal(full.lineups.home.startersValid,false);assert.equal(createMatchLayout(full),null);
  }
});
test('duplicate names and same player number across teams retain separate identities',()=>{
  const f=detail();f.lineups.away.starters[0].name=f.lineups.home.starters[0].name;f.lineups.away.starters[0].id=f.lineups.home.starters[0].id;
  const model=createMatchLayout(f);assert.notEqual(model.home.players[0].key,model.away.players[0].key);
});
function board(){const f=matchBoardDocument(),full=detail(),model=createMatchLayout(full);let current=true;
  const root=f.nodes.matchStudioContent,api=createMatchBoard({root,document:f.document,model,utils:f.utils,current:()=>current});
  const markers=allNodes(root).filter(n=>n.className==='match-player');return {...f,root,full,model,api,markers,stop:()=>{current=false;}};
}
test('one horizontal pitch, 22 shared jerseys, independent colors, safe labels and visible selection',()=>{
  const f=board();assert.equal(allNodes(f.root).filter(n=>n.className==='match-pitch').length,1);assert.equal(f.markers.length,22);
  f.markers.forEach((b,i)=>{const team=i<11?f.model.home:f.model.away;assert.equal(b.attrs['--team'],team.color);assert.equal(b.attrs['--team2'],team.color2);assert.equal(b.attrs['--jersey-number'],f.utils.jerseyNumberColor(team.color));assert.match(b.children[0].innerHTML,/aria-hidden="true"/);assert.ok(b.attrs['aria-label'].includes(team.name));});
  fire(f.markers[0],'click');assert.equal(f.markers[0].attrs['aria-pressed'],'true');fire(f.markers[11],'click');assert.equal(f.markers[0].attrs['aria-pressed'],'false');assert.match(f.markers[11].className,/selected/);
  assert.ok(!allNodes(f.root).some(n=>['img','video','canvas'].includes(n.tagName)));f.api.dispose();
});
test('both teams drag across halfway, bounds clamp, cancellation restores, source stays immutable',()=>{
  const f=board(),initial=f.api.getState(),source=JSON.stringify(f.full),layout=JSON.stringify(f.model);
  for(const i of [0,11]){const b=f.markers[i],x=i===0?1000:-1000;
    fire(b,'pointerdown');fire(b,'pointermove',{clientX:x,clientY:300});fire(b,'pointerup',{clientX:x,clientY:300});
    assert.notEqual(f.api.getState().players[i].x,initial.players[i].x);
  }
  assert.ok(f.api.getState().players[0].x>50);assert.ok(f.api.getState().players[11].x<50);
  assert.deepEqual(f.api.getState().players[1],initial.players[1]);
  const b=f.markers[1];fire(b,'pointerdown');fire(b,'pointermove',{clientX:1e6,clientY:-1e6});
  const p=f.api.getState().players[1];assert.ok(p.x<=96&&p.y>=7);fire(b,'pointercancel');assert.deepEqual(f.api.getState().players[1],initial.players[1]);
  assert.equal(JSON.stringify(f.full),source);assert.equal(JSON.stringify(f.model),layout);f.api.reset();assert.deepEqual(f.api.getState(),initial);f.api.dispose();
});
test('keyboard movement, unrelated pointer rejection and disposal remove listeners without owning root',()=>{
  const f=board(),b=f.markers[0],before=f.api.getState();fire(b,'keydown',{key:'ArrowRight'});assert.equal(f.api.getState().players[0].x,before.players[0].x+1);
  fire(b,'pointerdown');fire(b,'pointermove',{pointerId:2,clientX:500});assert.equal(f.api.getState().players[0].x,before.players[0].x+1);
  fire(b,'pointerup',{pointerId:2});assert.equal(b.listeners.get('pointermove').size,1);
  f.stop();f.api.dispose();assert.equal(f.root.children.length,0);assert.equal(b.listeners.get('pointermove').size,0);assert.equal(b.listeners.get('keydown').size,0);assert.equal(b.listeners.get('pointerdown').size,0);assert.equal(b.capture,null);
});
test('Match Center enables only complete confirmed XI and retains safe match/week links',async()=>{
  for(const ready of [true,false]){
    const f=matchBoardDocument('/mac?id=215997&hafta=6'),full=detail();if(!ready)full.lineups=null;
    const page=mountMatchDetail({document:f.document,window:f.window,current:()=>true,api:{load:async()=>({ok:true,match:full})}});await page.ready;
    const entry=allNodes(f.nodes.matchDetailContent).find(n=>n.textContent==='Maçı Stüdyoda Aç');
    assert.equal(entry.tagName,ready?'a':'button');if(ready)assert.equal(entry.href,'/mac-studyosu?id=215997&hafta=6');else assert.equal(entry.disabled,true);page.dispose();
  }
  assert.equal(matchPageUrl('/mac','?id=215997&hafta=6'),'/mac?id=215997&hafta=6');assert.equal(matchPageUrl('/mac','?id=abc'),'/maclar');assert.equal(matchPageUrl('/mac','?id=215997&hafta=999'),'/mac?id=215997');
});
test('studio loads once, reset makes no request, no storage, untrusted names stay text',async()=>{
  const f=matchBoardDocument(),full=detail();full.lineups.home.starters[0].name='<img src=x onerror=bad()>';let calls=0;
  const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load:async()=>{calls++;return{ok:true,match:full};}}});await page.ready;
  const nodes=allNodes(f.nodes.matchStudioContent);assert.equal(nodes.filter(n=>n.className==='match-player').length,22);assert.match(textOf(f.nodes.matchStudioContent),/<img src=x/);
  fire(nodes.find(n=>n.className==='match-player'),'keydown',{key:'ArrowRight'});fire(nodes.find(n=>n.textContent==='Gerçek Dizilişe Dön'),'click');assert.equal(calls,1);
  assert.equal(f.nodes.matchStudioContent.children[0].href,'/mac?id=215997&hafta=6');page.dispose();assert.equal(f.nodes.matchStudioContent.children.length,0);
});
test('invalid IDs, future XI absence, failure/retry and stale async response never initialize board',async()=>{
  for(const path of ['/mac-studyosu','/mac-studyosu?id=-1','/mac-studyosu?id=1&id=2']){const f=matchBoardDocument(path);let calls=0;const p=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load(){calls++;}}});await p.ready;assert.equal(calls,0);assert.match(textOf(f.nodes.matchStudioContent),/Maç bulunamadı/);p.dispose();}
  const f=matchBoardDocument(),future=detail();future.lineups=null;const p=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load:async()=>({ok:true,match:future})}});await p.ready;assert.match(textOf(f.nodes.matchStudioContent),/başlangıç kadroları mevcut değil/);assert.equal(allNodes(f.nodes.matchStudioContent).filter(n=>n.className==='match-player').length,0);p.dispose();
  const g=matchBoardDocument(),wait=deferred();let active=true,calls=0;const late=mountMatchStudio({document:g.document,window:g.window,current:()=>active,api:{load(){calls++;return wait.promise;}}});fire(g.nodes.matchStudioContent.children[2],'click');assert.equal(calls,1);active=false;late.dispose();wait.resolve({ok:true,match:detail()});await late.ready;assert.equal(g.nodes.matchStudioContent.children.length,0);
  const h=matchBoardDocument();let tries=0;const retry=mountMatchStudio({document:h.document,window:h.window,current:()=>true,api:{load:async()=>++tries===1?{ok:false,error:{message:'secret'}}:{ok:true,match:detail()}}});await retry.ready;assert.doesNotMatch(textOf(h.nodes.matchStudioContent),/secret/);fire(h.nodes.matchStudioContent.children[2],'click');await tick();assert.equal(tries,2);retry.dispose();
});
for(const path of ['/mac-studyosu','/mac-studyosu.html'])test(path+' shares protected guard, no draft/catalogue and blocks recovery',async()=>{
  assert.deepEqual(resolvePage(new URL(path,'https://taktikstudyo.com')),{kind:'protected',page:'match-studio',path:'/mac-studyosu.html'});
  for(const status of ['signed_in','signed_out','password_recovery']){
    const f=matchBoardDocument(path+'?id=215997&hafta=6'),state={status,user:{id:'u'}};let loads=0;
    f.window.location=new URL('https://taktikstudyo.com'+path+'?id=215997&hafta=6');f.window.location.replace=url=>f.navigations.push(url);
    const auth={initialize:async()=>({ok:true}),getState:()=>state,subscribe:()=>()=>{},validateUser:async()=>({ok:true,user:{id:'u'}})};
    const page=startPage({auth,document:f.document,window:f.window,client:{functions:{invoke:async()=>{loads++;return{data:detail()};}}},backend:{loadCatalogue(){throw Error('No catalogue');}}});await page.ready;await tick();assert.equal(loads,status==='signed_in'?1:0);assert.equal(f.nodes.protectedContent.hidden,status!=='signed_in');page.dispose();
  }
});
test('static M3 uses common app utilities, dedicated horizontal viewport and no M4 controls',()=>{
  const html=readFileSync(new URL('../dist/mac-studyosu.html',import.meta.url),'utf8'),css=readFileSync(new URL('../dist/match-studio.css',import.meta.url),'utf8');
  assert.match(html,/app.js/);assert.match(html,/backend.js/);assert.doesNotMatch(html,/comparison.js|rosters.js|drawingCanvas|teamSearch|squadPanel/);
  assert.match(css,/min-width:800px/);assert.match(css,/overflow-x:auto/);assert.match(css,/aspect-ratio:1\.6/);assert.match(css,/touch-action:none/);
});
