import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {matchBoardDocument,fire,BoardNode} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf} from './helpers/matches-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
import {createMatchBoard} from '../src/lib/match-board.js';
import {createMatchLayout,createLocalCatalogue,createFreeTeam,emptyStudioTeam,resolveStudioLineups,matchStudioAvailable} from '../src/lib/match-layout.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {DEFAULT_SIZE,SIZE_KEY,SIDEBAR_KEY,safeSize,createStudioPreferences} from '../src/lib/studio-preferences.js';
import {resolveProbableXI,HISTORY_LIMIT} from '../supabase/functions/matches/probable.js';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function localFixture(){const f=matchBoardDocument('/mac-studyosu');vm.runInNewContext(read('dist/rosters.js'),{window:f.window});return {...f,local:createLocalCatalogue(f.window)};}
function boardFixture(){const f=localFixture(),model=createMatchLayout(detail()),board=createMatchBoard({root:f.nodes.matchStudioContent,document:f.document,model,utils:f.utils});return {...f,model,board,root:f.nodes.matchStudioContent};}
const node=(root,cls)=>allNodes(root).find(n=>(n.className||'').split(' ').includes(cls));
const markers=root=>allNodes(root).filter(n=>n.dataset.slotKey);
const choose=(root,tool)=>fire(allNodes(root).find(n=>n.dataset.tool===tool),'click');
function draw(root){choose(root,'pass-arrow');const input=node(root,'match-drawing-input');fire(input,'pointerdown',{clientX:230,clientY:200});fire(input,'pointerup',{clientX:600,clientY:450});}
test('size preferences validate, clamp, persist, restore, and tolerate blocked storage',()=>{
  const store=new Map(),getStorage=()=>({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)});
  const p=createStudioPreferences({getStorage});assert.deepEqual(p.getSize(),DEFAULT_SIZE);
  p.setSize({width:5000,height:-4});assert.deepEqual(p.getSize(),{width:1800,height:450});
  assert.deepEqual(createStudioPreferences({getStorage}).getSize(),p.getSize());
  assert.deepEqual(safeSize({width:NaN,height:'650'}),DEFAULT_SIZE);
  assert.deepEqual(safeSize({width:0,height:Infinity}),{width:800,height:650});
  p.toggleSidebar();assert.equal(store.get(SIDEBAR_KEY),'collapsed');p.resetSize();assert.deepEqual(JSON.parse(store.get(SIZE_KEY)),DEFAULT_SIZE);
  store.set(SIZE_KEY,'not json');store.set(SIDEBAR_KEY,'true');let collapsed;
  assert.deepEqual(createStudioPreferences({getStorage,onSidebar:v=>collapsed=v}).getSize(),DEFAULT_SIZE);assert.equal(collapsed,false);
  assert.doesNotThrow(()=>createStudioPreferences({getStorage(){throw Error();}}).resetSize());
});
test('all existing local teams use the shared selection, 11 unique real players and exactly one keeper',()=>{
  const f=localFixture();assert.equal(f.local.teams.length,18);
  for(const team of f.local.teams){const source=f.local.lineup(team);assert.ok(source,team.name);const ids=Array.from(source.starters,p=>p.id);
    assert.equal(new Set(ids).size,11);assert.equal(source.starters.filter(p=>p.position==='goalkeeper').length,1);
    assert.deepEqual(ids,Array.from(f.utils.selectRosterXI(f.window.TAKTIK_ROSTERS.teams[team.name],'4-3-3'),p=>String(p.id)));
    const left=createFreeTeam(team,'home',f.local),right=createFreeTeam(team,'away',f.local);
    left.players.forEach((p,i)=>{assert.equal(p.initialX+right.players[i].initialX,100);assert.equal(p.goals,0);});
  }
});
test('missing, duplicate, no-keeper and short local roster cannot fabricate an XI',()=>{
  const f=localFixture(),team=f.local.teams[0],squad=f.window.TAKTIK_ROSTERS.teams[team.name];
  for(const players of [[],squad.players.slice(0,5),squad.players.filter(p=>p.position!=='G'),Array(11).fill(squad.players[0])]){
    f.window.TAKTIK_ROSTERS.teams[team.name]={players};assert.equal(f.local.lineup(team),null);
  }
});
test('free route mounts empty pitch with tools and zero API calls; team picker search, same-team exclusion and focus return',async()=>{
  const f=localFixture();let requests=0;const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load(){requests++;throw Error();}}});await page.ready;
  const root=f.nodes.matchStudioContent;assert.equal(markers(root).length,0);assert.ok(node(root,'match-pitch'));assert.equal(requests,0);
  const picker=node(root,'studio-team-dialog'),buttons=allNodes(root).filter(n=>n.className==='match-tactical-button');
  const home=buttons.find(n=>n.textContent==='Ev sahibi takımı seç'),away=buttons.find(n=>n.textContent==='Deplasman takımı seç');
  fire(home,'click');assert.equal(picker.open,true);const search=allNodes(picker).find(n=>n.type==='search');assert.equal(search.focused,true);
  search.value='galata';fire(search,'input');const rows=allNodes(picker).filter(n=>n.className==='studio-team-option');assert.equal(rows.filter(n=>!n.hidden).length,1);
  fire(rows[0],'click');assert.equal(picker.open,false);assert.equal(home.focused,true);assert.equal(markers(root).length,11);
  fire(away,'click');assert.equal(rows[0].disabled,true);fire(rows[0],'click');assert.equal(markers(root).length,11);fire(rows[1],'click');assert.equal(markers(root).length,22);
  fire(home,'click');fire(picker,'cancel');assert.equal(picker.open,false);assert.equal(requests,0);page.dispose();
});
test('sidebar collapses without changing active Pass tool; size/color reset preserves player positions and drawing DOM',async()=>{
  const f=localFixture(),page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load(){throw Error();}}});await page.ready;
  const root=f.nodes.matchStudioContent;draw(root);const toggle=node(root,'match-sidebar-toggle'),layer=node(root,'match-drawings'),before=JSON.stringify(layer.children[0].children.map(n=>n.attrs));
  fire(toggle,'click');assert.equal(toggle.attrs['aria-expanded'],'false');assert.equal(node(root,'match-tactical-host').hidden,true);
  assert.equal(allNodes(root).find(n=>n.dataset.tool==='pass-arrow').attrs['aria-pressed'],'true');fire(toggle,'click');assert.equal(toggle.attrs['aria-expanded'],'true');
  for(const slider of allNodes(root).filter(n=>n.type==='range')){slider.value='1400';fire(slider,'input');}
  const pitch=node(root,'match-pitch');assert.equal(pitch.attrs['--match-pitch-width'],'1400px');assert.equal(pitch.attrs['--match-pitch-height'],'900px');
  fire(allNodes(root).find(n=>n.textContent==='Varsayılana Dön'),'click');assert.equal(pitch.attrs['--match-pitch-width'],'1200px');assert.equal(pitch.attrs['--match-pitch-height'],'650px');assert.equal(JSON.stringify(layer.children[0].children.map(n=>n.attrs)),before);page.dispose();
});
test('changing only home preserves away player coordinates, substitutions and drawings',()=>{
  const f=boardFixture(),initial=f.board.getState(),away=markers(f.root)[12];fire(away,'keydown',{key:'ArrowDown'});draw(f.root);
  const before=f.board.getState().players.filter(p=>p.side==='away'),drawings=f.board.getDrawings();
  f.board.setTeam('home',createFreeTeam(f.local.teams[0],'home',f.local));assert.deepEqual(f.board.getState().players.filter(p=>p.side==='away'),before);assert.deepEqual(f.board.getDrawings(),drawings);
  assert.equal(f.board.getState().players.length,22);assert.notDeepEqual(f.board.getState(),initial);assert.equal(f.board.getState().selected,null);f.board.dispose();
});
test('field drag and keyboard never swap opponents; own-team keyboard swap remains',()=>{
  const f=boardFixture(),m=markers(f.root),before=f.board.getState(),a=before.players[1],b=before.players[12];
  fire(m[1],'pointerdown',{clientX:30+a.x*10,clientY:100+a.y*6.25});fire(m[1],'pointerup',{clientX:30+b.x*10,clientY:100+b.y*6.25});
  assert.deepEqual(f.board.getState().players[12],b);assert.equal(f.board.getState().players[1].x,b.x);
  const current=f.board.getState();fire(m[12],'keydown',{key:'Enter',shiftKey:true});assert.deepEqual(f.board.getState(),current);
  fire(m[2],'keydown',{key:'Enter',shiftKey:true});assert.notDeepEqual(f.board.getState().players[2],current.players[2]);f.board.dispose();
});

const future=()=>({...detail(),id:'216231',status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]});
test('confirmed beats explicit predicted; predicted only applies before kickoff',()=>{
  const m=future();m.lineups=detail().lineups;assert.equal(resolveStudioLineups(m).home.lineupKind,'confirmed');m.lineups.status='predicted';assert.equal(resolveStudioLineups(m).home.lineupKind,'probable-provider');assert.equal(matchStudioAvailable(m),true);
  m.status='finished';assert.equal(matchStudioAvailable(m),false);
});
test('upcoming without provider/history uses shared local XI with probable-local provenance; no goals',()=>{
  const f=localFixture(),m=future(),rows=resolveStudioLineups(m,f.local);assert.equal(rows.home.lineupKind,'probable-local');assert.equal(rows.away.lineupKind,'probable-local');
  const layout=createMatchLayout(m,f.local);assert.ok(layout);assert.ok([...layout.home.players,...layout.away.players].every(p=>p.goals===0));
  m.home={...m.home,teamId:null};assert.equal(createMatchLayout(m,f.local),null,'unmapped provider ID must not match a local team by display name');
});
test('most recent valid completed same-season XI before target and now; bounded candidates and deduped cache',async()=>{
  const target=future(),old=detail(),invalid={...detail(),id:'215998',kickoff:'2026-09-22T18:00:00Z',lineups:null};old.kickoff='2026-09-20T18:00:00Z';
  const fixtures=[old,invalid,{...old,id:'215999',season:'2025-2026'},{...old,id:'216000',kickoff:'2026-11-01T00:00:00Z'}];let seasonCalls=0,detailCalls=0;
  const handler=createMatchesHandler({token:'fixture-only',now:()=>Date.parse('2026-09-23T00:00:00Z'),authenticate:async()=>({id:'u',email_confirmed_at:'x'}),load:async()=>{seasonCalls++;return {matches:fixtures};},loadDetail:async({id})=>{detailCalls++;return id===target.id?target:id===invalid.id?invalid:old;}});
  const request=()=>handler(new Request('https://local.invalid/matches?id='+target.id,{headers:{authorization:'Bearer fixture'}}));
  const [a,b]=await Promise.all([request(),request()]);assert.equal(a.status,200);assert.equal(b.status,200);const value=await a.json();
  assert.equal(value.studioLineups.home.lineupKind,'probable-recent-match');assert.equal(value.studioLineups.away.sourceMatchId,old.id);assert.equal(seasonCalls,1);assert.equal(detailCalls,3);await request();assert.equal(detailCalls,3);
});
test('history failure is bounded and leaves local fallback possible; provider XI skips history',async()=>{
  const m=future(),old=detail();old.kickoff='2026-09-01T00:00:00Z';let calls=0;
  const fixtures=Array.from({length:20},(_,i)=>({...old,id:String(100+i)}));
  const result=await resolveProbableXI(m,{season:async()=>({matches:fixtures}),detail:async()=>{calls++;throw Error();},now:()=>Date.parse('2026-09-23')});
  assert.equal(calls,HISTORY_LIMIT*2);assert.equal(result.studioLineups.home,null);assert.ok(createMatchLayout(result,localFixture().local));
  m.lineups=old.lineups;await resolveProbableXI(m,{season(){throw Error('must not fetch');}});
});
test('upcoming center enables Studio and clearly labels probable lineups',async()=>{
  const f=localFixture();f.window.location.search='?id=216231';const page=mountMatchDetail({document:f.document,window:f.window,current:()=>true,api:{load:async()=>({ok:true,match:future()})}});await page.ready;
  const root=f.nodes.matchDetailContent;assert.match(textOf(root),/Muhtemel 11/);assert.match(textOf(root),/yerel tahmini/);const button=allNodes(root).find(n=>n.textContent==='Maçı Stüdyoda Aç');assert.equal(button.href,'/mac-studyosu?id=216231');page.dispose();
});
test('all authenticated navs preserve one logout button and anonymous/share contracts; no duplicated logout implementation',()=>{
  for(const name of ['index','studyo','karsilastirma','profil','maclar','mac','mac-studyosu']){const html=read('dist/'+name+'.html');assert.match(html,/href="\/mac-studyosu"[^>]*>Stüdyo/);assert.match(html,/href="\/studyo.html"[^>]*>Taktik Tahtası/);assert.equal((html.match(/id="signOut"/g)||[]).length,1);assert.match(html,/data-account-panel hidden/);assert.match(html,/navigation.js/);}
  assert.match(read('dist/index.html'),/href="\/mac-studyosu">Başla/);assert.doesNotMatch(read('dist/navigation.js'),/auth\.|signOut\(/);
});
for(const [from,to,swap]of [[1,2,true],[12,13,true],[1,12,false],[12,1,false]])test(`field swap ${from} -> ${to}: ${swap}`,()=>{
  const f=boardFixture(),before=f.board.getState().players,a=before[from],b=before[to],button=markers(f.root)[from],point=p=>({clientX:30+p.x*10,clientY:100+p.y*6.25});
  fire(button,'pointerdown',point(a));fire(button,'pointerup',point(b));const after=f.board.getState().players;
  assert.equal(after[from].playerId,a.playerId);assert.equal(after[to].playerId,b.playerId);assert.equal(after[from].side,a.side);
  assert.deepEqual({x:after[to].x,y:after[to].y},swap?{x:a.x,y:a.y}:{x:b.x,y:b.y});f.board.dispose();
});
test('resize after moving player and drawing arrow, zone, circle preserves normalized state; resets presentation only',()=>{
  const f=boardFixture();fire(markers(f.root)[2],'keydown',{key:'ArrowRight'});
  for(const tool of ['movement-arrow','zone','circle']){choose(f.root,tool);const input=node(f.root,'match-drawing-input');fire(input,'pointerdown',{clientX:200,clientY:220});fire(input,'pointerup',{clientX:650,clientY:470});}
  const players=f.board.getState(),drawings=f.board.getDrawings();
  for(const slider of allNodes(f.root).filter(n=>n.type==='range')){slider.value='850';fire(slider,'input');}
  const picker=node(f.root,'match-pitch-color');picker.value='#eeeeee';fire(picker,'input');
  fire(allNodes(f.root).find(n=>n.textContent==='Varsayılana Dön'),'click');
  assert.deepEqual(f.board.getState(),players);assert.deepEqual(f.board.getDrawings(),drawings);f.board.dispose();
});
test('confirmed source replaces cached probable XI after the upcoming cache TTL',async()=>{
  let clock=Date.parse('2026-09-23'),calls=0,confirmed=false;const upcoming=future();upcoming.lineups=detail().lineups;upcoming.lineups.status='predicted';
  const handler=createMatchesHandler({now:()=>clock,authenticate:async()=>({id:'u',email_confirmed_at:'x'}),loadDetail:async()=>{calls++;return {...upcoming,lineups:{...upcoming.lineups,status:confirmed?'confirmed':'predicted'}};}});
  const load=async()=>{const r=await handler(new Request('https://local.invalid/?id=216231',{headers:{authorization:'Bearer fixture'}}));assert.equal(r.status,200);return r.json();};
  assert.equal(resolveStudioLineups(await load()).home.lineupKind,'probable-provider');confirmed=true;
  assert.equal(resolveStudioLineups(await load()).home.lineupKind,'probable-provider');assert.equal(calls,1);
  clock+=300001;assert.equal(resolveStudioLineups(await load()).home.lineupKind,'confirmed');assert.equal(calls,2);
});
test('account disclosure opens/closes, Escape and outside click restore semantics, sole existing logout action runs once',()=>{
  const root=new BoardNode('span'),trigger=new BoardNode('button'),panel=new BoardNode('span'),logout=new BoardNode('button'),document=new BoardNode(),window=new BoardNode();
  panel.hidden=true;panel.append(logout);root.append(trigger,panel);document.querySelectorAll=()=>[root];root.querySelector=s=>s==='[data-account-trigger]'?trigger:panel;panel.querySelectorAll=()=>[logout];root.contains=n=>allNodes(root).includes(n);logout.closest=()=>logout;
  let signouts=0;logout.addEventListener('click',()=>signouts++);vm.runInNewContext(read('dist/navigation.js'),{document,window});
  fire(trigger,'click');assert.equal(panel.hidden,false);assert.equal(trigger.attrs['aria-expanded'],'true');fire(trigger,'click');assert.equal(panel.hidden,true);
  fire(root,'keydown',{target:trigger,key:'ArrowDown'});assert.equal(logout.focused,true);fire(root,'keydown',{key:'Escape'});assert.equal(panel.hidden,true);assert.equal(trigger.focused,true);
  fire(trigger,'click');fire(document,'pointerdown',{target:new BoardNode()});assert.equal(panel.hidden,true);
  fire(trigger,'click');fire(logout,'click');fire(panel,'click',{target:logout});assert.equal(signouts,1);assert.equal(panel.hidden,true);
  fire(trigger,'click');fire(document,'focusin',{target:new BoardNode()});assert.equal(panel.hidden,true);
  fire(window,'pagehide');assert.equal(trigger.listeners.get('click').size,0);assert.equal(document.listeners.get('pointerdown').size,0);
});
