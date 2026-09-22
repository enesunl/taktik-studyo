import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatchLayout} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {matchGoals} from '../src/lib/match-goals.js';
import {normalizeIncidents} from '../supabase/functions/matches/detail.js';
import {detailValid} from '../src/lib/match-detail.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {detail} from './helpers/match-detail-fixture.mjs';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf} from './helpers/matches-fixture.mjs';

function withGoals(){
  const f=detail();f.incidents=normalizeIncidents({event_id:215997,incidents:[
    {type:'goal',minute:64,player_id:105,player:'Golcü',is_home:true,goal_type:'regular'},
    {type:'goal',minute:18,player_id:105,player:'Golcü',is_home:true,goal_type:'penalty'},
    {type:'goal',minute:45,added_time:2,player_id:201,player:'Kendi Kalesine',is_home:true,goal_type:'ownGoal'},
    {type:'goal',minute:80,player_id:105,player:'Golcü',is_home:true,rescinded:true},
    {type:'goal',minute:83,player_id:111,player:'Yedek Golcü',is_home:true},
    {type:'goal',minute:90,added_time:8,player_id:202,player:'Deplasman',is_home:false,goal_type:'penalty'},
    {type:'card',minute:70,player_id:106,player:'Kart',is_home:true,card_type:'yellow'},
  ]},f);return f;
}
function board(full=withGoals()){
  const f=matchBoardDocument(),model=createMatchLayout(full),root=f.nodes.matchStudioContent;let active=true;
  const api=createMatchBoard({root,document:f.document,model,utils:f.utils,current:()=>active});
  const nodes=()=>allNodes(root),markers=nodes().filter(n=>n.className==='match-player');
  return {...f,model,root,api,markers,nodes,stop(){active=false;}};
}
const point=p=>({clientX:30+p.x*10,clientY:100+p.y*6.25});
test('goal facts group minutes, retain penalties, credit own goals correctly and ignore rescinded/non-goals',()=>{
  const f=withGoals(),g=matchGoals(f);assert.equal(detailValid(f,f.id),true);
  assert.deepEqual(g.rows.home[0],{name:'Golcü',minutes:['18′ (P)','64′'],own:false});
  assert.equal(g.rows.home[1].minutes[0],'45+2′ (KK)');assert.equal(g.count('home','105'),2);assert.equal(g.count('away','201'),0);assert.equal(g.count('home','111'),1);assert.equal(g.count('away','202'),1);assert.equal(g.count('home','106'),0);
  f.incidents[2].side='away';assert.equal(matchGoals(f).rows.home.find(r=>r.own).name,'Kendi Kalesine');
  assert.deepEqual(matchGoals({...f,incidents:[]}).rows,{home:[],away:[]});
  const raw=normalizeIncidents({event_id:215997,incidents:[{type:'goal',minute:1,goal_type:'constructor'}]},f);assert.equal(raw[0].goalKind,'unknown');
});
test('both scoreboards share safely rendered scorers and absent data has no empty list',async()=>{
  for(const mount of [mountMatchDetail,mountMatchStudio]){
    const f=matchBoardDocument(),full=withGoals();full.incidents[0].player.name='<img src=x onerror=bad()>';
    const page=mount({document:f.document,window:f.window,current:()=>true,api:{load:async()=>({ok:true,match:full})}});await page.ready;
    const root=mount===mountMatchDetail?f.nodes.matchDetailContent:f.nodes.matchStudioContent;
    const lists=allNodes(root).filter(n=>n.className==='match-scorers');assert.equal(lists.length,2);assert.match(textOf(lists[0]),/18′ \(P\), 64′/);assert.match(textOf(lists[1]),/90\+8′/);assert.ok(!allNodes(root).some(n=>n.tagName==='img'));page.dispose();
  }
  const f=matchBoardDocument(),full=withGoals();full.incidents=[];const p=mountMatchDetail({document:f.document,window:f.window,current:()=>true,api:{load:async()=>({ok:true,match:full})}});await p.ready;assert.equal(allNodes(f.nodes.matchDetailContent).filter(n=>n.className==='match-scorers').length,0);p.dispose();
});
test('paired formation lines are centered and closer; shared selection has no dashed box; pitch ratio preserved',()=>{
  const model=createMatchLayout(detail()),pair=model.home.players.filter(p=>p.initialX===27);
  assert.equal(pair.length,2);assert.deepEqual(pair.map(p=>p.initialY),[33,67]);assert.equal(pair[0].initialY+pair[1].initialY,100);
  const shared=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8'),css=readFileSync(new URL('../dist/match-studio.css',import.meta.url),'utf8');
  assert.match(shared,/\.player.selected \.player-jersey,\.match-player.selected \.player-jersey\{/);assert.doesNotMatch(css,/\.match-player.selected\{[^}]*(?:border|background)/);
  assert.match(css,/width:calc\(100% - 60px\);min-width:800px/);assert.match(css,/aspect-ratio:1\.6/);
});
test('field drop swaps only positions; keyboard swap works and source data stays unchanged',()=>{
  const f=board(),before=f.api.getState(),source=JSON.stringify(f.model),a=before.players[1],b=before.players[2];
  fire(f.markers[1],'pointerdown',point(a));fire(f.markers[1],'pointerup',point(b));const swapped=f.api.getState();
  assert.equal(swapped.players[1].x,b.x);assert.equal(swapped.players[1].y,b.y);assert.equal(swapped.players[2].y,a.y);assert.equal(swapped.players[1].playerId,a.playerId);
  fire(f.markers[1],'click'); // browser's post-drag click is suppressed
  fire(f.markers[2],'keydown',{key:'Enter',shiftKey:true});assert.deepEqual(f.api.getState().players,before.players);
  assert.equal(JSON.stringify(f.model),source);f.api.dispose();
});
test('contextual bench click replaces selected player, outgoing returns, colors/goals follow identity and reset restores XI',()=>{
  const f=board(),before=f.api.getState(),bench=f.nodes().find(n=>n.className==='match-bench');assert.equal(bench.hidden,true);
  const scorer=f.markers[5];assert.equal(allNodes(scorer).find(n=>n.className==='match-player-goals').children.length,2);
  fire(scorer,'click');assert.equal(bench.hidden,false);assert.match(textOf(bench),/Oyuncu 6 yerine/);
  let reserves=f.nodes().filter(n=>n.className==='match-reserve');assert.equal(reserves.length,10);const incoming=reserves.find(n=>n.dataset.playerKey.endsWith(':111'));fire(incoming,'click');
  assert.equal(f.api.getState().players[5].playerId,'111');assert.equal(scorer.attrs['--team'],f.model.home.color);
  assert.equal(allNodes(scorer).find(n=>n.className==='match-player-goals').children.length,1);assert.equal(scorer.focused,true);
  reserves=f.nodes().filter(n=>n.className==='match-reserve');assert.equal(reserves.length,10);assert.ok(reserves.some(n=>n.dataset.playerKey.endsWith(':105')));
  assert.equal(new Set(f.api.getState().players.map(p=>p.key)).size,22);f.api.reset();assert.deepEqual(f.api.getState(),before);assert.equal(bench.hidden,true);f.api.dispose();
});
test('bench pointer drop supports same-team replacement and rejects opponent/outside/canceled drops',()=>{
  const f=board(),initial=f.api.getState();fire(f.markers[0],'click');
  const reserve=()=>f.nodes().find(n=>n.className==='match-reserve');
  for(const [destination,type]of [[point(initial.players[11]),'pointerup'],[{clientX:-100,clientY:-100},'pointerup'],[point(initial.players[1]),'pointercancel']]){
    const b=reserve();fire(b,'pointerdown',{clientX:50,clientY:900});fire(b,'pointermove',destination);fire(b,type,destination);assert.deepEqual(f.api.getState().players,initial.players);
  }
  const b=reserve(),id=b.dataset.playerKey.split(':').at(-1);fire(b,'pointerdown',{clientX:50,clientY:900});fire(b,'pointerup',point(initial.players[1]));assert.equal(f.api.getState().players[1].playerId,id);assert.equal(f.api.getState().players[1].x,initial.players[1].x);
  f.api.dispose();
});
test('bench cancellation during account disposal clears gesture/listeners and cannot mutate another account',()=>{
  const f=board();fire(f.markers[0],'click');const b=f.nodes().find(n=>n.className==='match-reserve');fire(b,'pointerdown');fire(b,'pointermove',{clientX:600,clientY:300});f.stop();f.api.dispose();
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click'])assert.equal(b.listeners.get(type)?.size||0,0);
  assert.equal(f.root.children.length,0);assert.equal(b.capture,null);
});
