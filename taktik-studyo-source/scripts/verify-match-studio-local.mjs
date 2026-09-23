// Opt-in live BSD GET smoke. Mock Auth and DOM; not real browser/gateway QA.
// Credentials are only read from the process; never serialized or written.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';
import {fetchDetail,fetchSeason} from '../supabase/functions/matches/provider.js';
import {createMatchLayout,createLocalCatalogue,resolveStudioLineups} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {matchBoardDocument,fire} from '../tests/helpers/match-board-fixture.mjs';
import {allNodes} from '../tests/helpers/matches-fixture.mjs';

if(!process.env.BSD_API_TOKEN){console.error('BSD_API_TOKEN is required in the process environment.');process.exitCode=1;}
else try {
  let upstreamRequests=0;
  const providerFetch=(url,init)=>{assert.equal(init.method||'GET','GET');upstreamRequests++;return fetch(url,init);};
  const handler=createMatchesHandler({token:process.env.BSD_API_TOKEN,
    authenticate:async()=>({id:'local-test-user',email_confirmed_at:'2026-09-22'}),
    load:options=>fetchSeason({...options,fetchImpl:providerFetch}),
    loadDetail:options=>fetchDetail({...options,fetchImpl:providerFetch})});
  const load=async id=>{const res=await handler(new Request('http://localhost/matches?id='+id,{headers:{Authorization:'Bearer local-test-only'}}));assert.equal(res.status,200);return res.json();};
  const completed=await load('215997'),model=createMatchLayout(completed);assert.ok(model);
  assert.equal(model.home.formation,'4-2-3-1');assert.equal(model.away.formation,'4-1-4-1');
  await load('215997');assert.equal(upstreamRequests,4);
  const f=matchBoardDocument(),root=f.nodes.matchStudioContent,board=createMatchBoard({root,document:f.document,model,utils:f.utils});
  const all=allNodes(root),markers=all.filter(n=>n.className==='match-player');assert.equal(markers.length,22);
  assert.equal(new Set(board.getState().players.map(p=>p.key)).size,22);assert.equal(all.filter(n=>n.className==='match-pitch').length,1);
  const initial=board.getState();fire(markers[0],'pointerdown');fire(markers[0],'pointerup',{clientX:800,clientY:250});assert.notDeepEqual(board.getState(),initial);
  board.reset();assert.deepEqual(board.getState(),initial);assert.equal(upstreamRequests,4);
  const input=all.find(n=>n.className==='match-drawing-input'),choose=(kind,value)=>fire(all.find(n=>n.dataset[kind]===value),'click');
  const goalsBefore=allNodes(root).filter(n=>n.className==='match-player-goals').map(n=>n.children.length);
  for(const tool of ['movement-arrow','pass-arrow','line','freehand','zone','circle']){
    choose('tool',tool);fire(input,'pointerdown',{clientX:230,clientY:225});fire(input,'pointermove',{clientX:430,clientY:350});fire(input,'pointerup',{clientX:630,clientY:475});
  }
  assert.equal(board.getDrawings().objects.length,6);
  choose('tool','eraser');fire(input,'pointerdown',{clientX:430,clientY:350});fire(input,'pointerup',{clientX:430,clientY:350});assert.equal(board.getDrawings().objects.length,5);
  choose('action','undo');assert.equal(board.getDrawings().objects.length,6);choose('action','redo');assert.equal(board.getDrawings().objects.length,5);
  const drawings=board.getDrawings().objects;choose('tool','select');fire(markers[1],'keydown',{key:'ArrowRight'});
  board.reset();assert.deepEqual(board.getState(),initial);assert.deepEqual(board.getDrawings().objects,drawings);
  choose('action','clear');assert.equal(board.getDrawings().objects.length,0);assert.deepEqual(board.getState(),initial);
  assert.deepEqual(allNodes(root).filter(n=>n.className==='match-player-goals').map(n=>n.children.length),goalsBefore);
  assert.equal(upstreamRequests,4);board.dispose();
  vm.runInNewContext(readFileSync(new URL('../dist/rosters.js',import.meta.url),'utf8'),{window:f.window});
  const local=createLocalCatalogue(f.window),future=await load('216231'),futureModel=createMatchLayout(future,local),lineups=resolveStudioLineups(future,local);assert.ok(futureModel);
  const coldRequests=upstreamRequests;await load('216231');assert.equal(upstreamRequests,coldRequests);assert.ok(coldRequests<=28);
  console.log(JSON.stringify({runtime:'Node handler + DOM fixture; mocked Auth; live BSD GET only',completed:{id:'215997',players:22,pitches:1,homeFormation:model.home.formation,awayFormation:model.away.formation,dragReset:true,drawingTools:6,eraseUndoRedoClear:true,resetPreservesDrawings:true,goalsPreserved:true},future:{id:'216231',studioAvailable:true,homeSource:lineups.home.lineupKind,awaySource:lineups.away.lineupKind,sourceMatchIds:[lineups.home.sourceMatchId,lineups.away.sourceMatchId].filter(Boolean)},upstreamRequests,cacheHits:2,interactionProviderRequests:0}));
} catch {console.error('Match Studio smoke failed; credentials and raw responses were not logged.');process.exitCode=1;}
