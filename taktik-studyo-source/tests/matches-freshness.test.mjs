import test from 'node:test';
import assert from 'node:assert/strict';
import {readFreshness,staleNotice,createMatchesApi} from '../src/lib/matches.js';
import {createMatchDetailApi} from '../src/lib/match-detail.js';
import {mountMatches} from '../src/lib/matches-ui.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {detail} from './helpers/match-detail-fixture.mjs';
import {MatchNode,matchesDocument,matchesWindow,allNodes,match} from './helpers/matches-fixture.mjs';

const fetchedAt='2026-10-17T12:00:00.000Z';
const fakeClient=data=>({functions:{invoke:async()=>({data,error:null})},auth:{getSession:async()=>({data:{session:null}})}});
const location={origin:'https://taktikstudyo.com'};

test('freshness parsing ignores malformed values and the notice names the last update time',()=>{
  assert.deepEqual(readFreshness({stale:true,fetchedAt}),{stale:true,fetchedAt});
  for(const value of [null,undefined,'stale',{stale:'yes',fetchedAt},{stale:true,fetchedAt:'never'},{stale:true}])assert.equal(readFreshness(value),null);
  assert.equal(staleNotice(null),'');assert.equal(staleNotice({stale:false,fetchedAt}),'');
  assert.equal(staleNotice({stale:true,fetchedAt},'Europe/Istanbul'),'Maç verileri şu anda güncellenemiyor. Gösterilen bilgiler 17 Ekim 15:00 itibarıyla alındı.');
});

test('client APIs separate the additive freshness field; data objects are unchanged',async()=>{
  const season={season:'2026-2027',matches:[match()]};
  const list=await createMatchesApi({client:fakeClient({...season,freshness:{stale:true,fetchedAt}}),current:()=>true,location}).load();
  assert.equal(list.ok,true);assert.deepEqual(list.matches,season.matches);assert.deepEqual(list.freshness,{stale:true,fetchedAt});
  const old=await createMatchesApi({client:fakeClient(season),current:()=>true,location}).load();
  assert.equal(old.ok,true);assert.equal(old.freshness,null,'older servers without the field still work');
  let validated=null;const full=detail();
  const one=await createMatchDetailApi({client:fakeClient({...full,freshness:{stale:false,fetchedAt}}),current:()=>true,location,identity:{validateMatch:m=>{validated=m;return true;}}}).load('215997');
  assert.equal(one.ok,true);assert.deepEqual(one.match,full);assert.equal('freshness' in one.match,false);assert.equal('freshness' in validated,false);
  assert.deepEqual(one.freshness,{stale:false,fetchedAt});
});

test('Maçlar shows the stale notice only for retained data',async()=>{
  for(const [freshness,visible] of [[{stale:true,fetchedAt},true],[{stale:false,fetchedAt},false],[null,false]]){
    const dom=matchesDocument(),win=matchesWindow('/maclar');
    const page=mountMatches({...dom,window:win.window,current:()=>true,now:()=>Date.parse('2026-09-22T00:00:00Z'),api:{load:async()=>({ok:true,matches:[match()],freshness})}});
    await page.ready;
    const notice=allNodes(dom.nodes.matchesContent).find(n=>n.className==='matches-stale');
    assert.ok(notice);assert.equal(notice.hidden,!visible);
    if(visible)assert.match(notice.textContent,/şu anda güncellenemiyor/);
    page.dispose();
  }
});

test('match detail shows the stale notice in its status line',async()=>{
  for(const [freshness,expected] of [[{stale:true,fetchedAt},/şu anda güncellenemiyor/],[{stale:false,fetchedAt},/^$/]]){
    const dom=matchesDocument(),win=matchesWindow('/mac?id=215997&hafta=6');dom.nodes.matchDetailContent=new MatchNode();
    const page=mountMatchDetail({document:dom.document,window:win.window,current:()=>true,api:{load:async()=>({ok:true,match:detail(),freshness})}});
    await page.ready;
    const status=allNodes(dom.nodes.matchDetailContent).find(n=>n.attrs?.role==='status');
    assert.match(status.textContent,expected);page.dispose();
  }
});
