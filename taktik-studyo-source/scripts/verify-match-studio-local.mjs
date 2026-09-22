// Opt-in live BSD GET smoke. Mock Auth and DOM; not real browser/gateway QA.
// Credentials are only read from the process; never serialized or written.
import assert from 'node:assert/strict';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';
import {fetchDetail} from '../supabase/functions/matches/provider.js';
import {createMatchLayout} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {matchBoardDocument,fire} from '../tests/helpers/match-board-fixture.mjs';
import {allNodes} from '../tests/helpers/matches-fixture.mjs';

if(!process.env.BSD_API_TOKEN){console.error('BSD_API_TOKEN is required in the process environment.');process.exitCode=1;}
else try {
  let upstreamRequests=0;
  const handler=createMatchesHandler({token:process.env.BSD_API_TOKEN,
    authenticate:async()=>({id:'local-test-user',email_confirmed_at:'2026-09-22'}),
    loadDetail:options=>fetchDetail({...options,fetchImpl:(url,init)=>{upstreamRequests++;return fetch(url,init);}})});
  const load=async id=>{const res=await handler(new Request('http://localhost/matches?id='+id,{headers:{Authorization:'Bearer local-test-only'}}));assert.equal(res.status,200);return res.json();};
  const completed=await load('215997'),model=createMatchLayout(completed);assert.ok(model);
  assert.equal(model.home.formation,'4-2-3-1');assert.equal(model.away.formation,'4-1-4-1');
  await load('215997');assert.equal(upstreamRequests,4);
  const f=matchBoardDocument(),root=f.nodes.matchStudioContent,board=createMatchBoard({root,document:f.document,model,utils:f.utils});
  const all=allNodes(root),markers=all.filter(n=>n.className==='match-player');assert.equal(markers.length,22);
  assert.equal(new Set(board.getState().players.map(p=>p.key)).size,22);assert.equal(all.filter(n=>n.className==='match-pitch').length,1);
  const initial=board.getState();fire(markers[0],'pointerdown');fire(markers[0],'pointerup',{clientX:800,clientY:250});assert.notDeepEqual(board.getState(),initial);
  board.reset();assert.deepEqual(board.getState(),initial);assert.equal(upstreamRequests,4);board.dispose();
  const future=await load('216231');assert.equal(createMatchLayout(future),null);await load('216231');assert.equal(upstreamRequests,8);
  console.log(JSON.stringify({runtime:'Node handler + DOM fixture; mocked Auth; live BSD GET only',completed:{id:'215997',players:22,pitches:1,homeFormation:model.home.formation,awayFormation:model.away.formation,dragReset:true},future:{id:'216231',studioAvailable:false},upstreamRequests,cacheHits:2,interactionProviderRequests:0}));
} catch {console.error('Match Studio smoke failed; credentials and raw responses were not logged.');process.exitCode=1;}
