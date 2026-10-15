import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStatistics,normalizeLineups,normalizeIncidents,normalizeDetail} from '../supabase/functions/matches/detail.js';
import {fetchDetail} from '../supabase/functions/matches/provider.js';
import {createMatchesHandler,detailTTL} from '../supabase/functions/matches/handler.js';
import {event,match,deferred,seasonOf} from './helpers/matches-fixture.mjs';
import {resources,detail} from './helpers/match-detail-fixture.mjs';

test('M2 stats normalize all nine metrics; expected_goals 2.13 wins over xg.actual 2.15',()=>{
  const stats=normalizeStatistics(resources().stats.value,match());
  assert.equal(Object.keys(stats).length,9);
  for(const [key,values] of Object.entries({possession:[31,69],shots:[10,21],shotsOnTarget:[8,8],corners:[1,10],fouls:[25,7],offsides:[0,2],yellowCards:[9,5],redCards:[1,0],xg:[1.47,2.13]})) assert.deepEqual([stats[key].home,stats[key].away],values);
  const raw=resources().stats.value;delete raw.stats.away.expected_goals;assert.equal(normalizeStatistics(raw,match()).xg.away,2.15);
  raw.stats.away.expected_goals=0;assert.equal(normalizeStatistics(raw,match()).xg.away,0);
  raw.stats.away.expected_goals='bad';assert.equal(normalizeStatistics(raw,match()).xg.away,null);
  raw.stats.away.expected_goals=null;delete raw.stats.away.xg;assert.equal(normalizeStatistics(raw,match()).xg.away,null);
  raw.stats.home.xg.estimated=true;assert.equal(normalizeStatistics(raw,match()).xg.estimated,true);
});
test('lineups keep designated XI/bench, identities, numbers, formations and broad positions only',()=>{
  const raw=resources().lineups.value,l=normalizeLineups(raw,match());
  assert.equal(l.status,'confirmed');assert.equal(l.home.formation,'4-2-3-1');assert.equal(l.away.formation,'4-1-4-1');
  for(const side of ['home','away']){assert.equal(l[side].starters.length,11);assert.equal(l[side].substitutes.length,10);}
  assert.equal(l.home.starters[0].id,'100');assert.equal(l.home.starters[0].number,1);assert.equal(l.home.starters[0].position,'goalkeeper');
  assert.equal(l.home.substitutes[0].id,'111');assert.doesNotMatch(JSON.stringify(l),/photo|https:|\bLB\b|\bCB\b/);
  raw.lineups.home.formation=null;raw.lineups.home.players[0].position='LB';assert.equal(normalizeLineups(raw,match()).home.formation,null);assert.equal(normalizeLineups(raw,match()).home.starters[0].position,'unknown');
  raw.lineups.home.team_id=999;assert.equal(normalizeLineups(raw,match()).home,null);
});
test('incidents sort by minute, added time and original sequence; yellowRed remains distinct',()=>{
  const rows=normalizeIncidents(resources().incidents.value,match());
  assert.deepEqual(rows.map(r=>[r.minute,r.added]),[[13,0],[14,0],[45,2],[45,2],[63,0],[90,3]]);
  assert.deepEqual(rows.map(r=>r.type),['goal','unknown','red','yellow','substitution','yellowRed']);
  assert.equal(rows.at(-1).side,'home');assert.deepEqual(rows[4].incoming,{id:'211',name:'Yedek 1'});assert.deepEqual(rows[4].outgoing,{id:'201',name:'Oyuncu 2'});
  const full=detail();assert.equal(full.substitutions.length,1);assert.equal(full.statistics.yellowCards.home,9);assert.equal(full.statistics.redCards.home,1);
  assert.doesNotMatch(JSON.stringify(full),/media\.invalid|photo|video|<script>/);
});
test('missing, malformed and mismatched optional resources become clean section states',()=>{
  for(const value of [null,{},'bad',{event_id:999,stats:{home:{total_shots:4}},lineups:{},incidents:[]}]){
    const full=normalizeDetail(match(),event(),{stats:{value},lineups:{value},incidents:{value}});
    assert.equal(full.statistics,null);assert.equal(full.lineups,null);assert.deepEqual(full.incidents,[]);
  }
  const full=normalizeDetail(match({status:'notstarted'}),event(),{stats:{value:null},lineups:{value:null},incidents:{value:null}});
  assert.deepEqual(full.score,{home:null,away:null});assert.equal(full.venue,null);assert.equal(full.availability.stats,'unavailable');
  const r=resources();r.incidents.value.incidents.push({type:'constructor',minute:1},{type:'card',card_type:'__proto__',minute:2},{type:'goal',minute:-4});
  const list=normalizeIncidents(r.incidents.value,match());assert.equal(list.length,8);assert.equal(list[0].type,'unknown');assert.equal(list[1].type,'unknown');
});
const json=value=>Response.json(value);
function provider(options={}){
  const calls=[];const r=resources();
  const fetchImpl=async(url,init)=>{
    calls.push(url);assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Token test-only');
    const path=new URL(url).pathname,kind=path.split('/').filter(Boolean).at(-1);
    if(kind==='215997')return json(options.event||event());
    if(options.fail===kind)return new Response('private',{status:429});
    return json(r[kind].value);
  };
  return {calls,fetchImpl};
}
test('detail confirms competition before fetching three independent resources concurrently',async()=>{
  const calls=[],wait=deferred(),r=resources();
  const pending=fetchDetail({id:'215997',token:'test-only',fetchImpl:async(url)=>{
    const kind=new URL(url).pathname.split('/').filter(Boolean).at(-1);calls.push(kind);
    if(kind==='215997')return json(event());await wait.promise;return json(r[kind].value);
  }});
  await new Promise(r=>setTimeout(r,0));assert.deepEqual(calls,['215997','lineups','incidents','stats']);wait.resolve();
  const full=await pending;assert.equal(full.id,'215997');assert.equal(full.statistics.xg.away,2.13);
});
test('wrong league, season and mismatched event ID never fetch optional endpoints',async()=>{
  for(const override of [{league_id:99},{season_id:99},{id:8}]){
    const f=provider({event:event(override)});await assert.rejects(fetchDetail({id:'215997',token:'test-only',fetchImpl:f.fetchImpl}),/MATCH_NOT_FOUND/);assert.equal(f.calls.length,1);
  }
  await assert.rejects(fetchDetail({id:'https://evil.test',token:'test-only',fetchImpl(){throw Error('No request');}}),/INVALID_MATCH_ID/);
});
test('optional rate limit is partial; critical failures are controlled; timeout bounded',async()=>{
  const f=provider({fail:'stats'});const full=await fetchDetail({id:'215997',token:'test-only',fetchImpl:f.fetchImpl});
  assert.equal(full.availability.stats,'error');assert.equal(full.statistics,null);assert.equal(full.lineups.home.starters.length,11);
  for(const [response,code] of [[new Response('no',{status:404}),'MATCH_NOT_FOUND'],[new Response('secret',{status:500}),'PROVIDER_UNAVAILABLE'],[new Response('invalid json'),'PROVIDER_UNAVAILABLE']]) await assert.rejects(fetchDetail({id:'215997',token:'test-only',fetchImpl:async()=>response}),new RegExp(code));
  await assert.rejects(fetchDetail({id:'215997',token:'test-only',timeoutMs:5,fetchImpl:(_u,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(Error('private'))))}),/PROVIDER_UNAVAILABLE/);
});
const request=(query,authorized=true)=>new Request('https://example.test/matches'+query,{headers:authorized?{Authorization:'Bearer test-only'}:{}});
test('detail handler has narrow ID contract and authenticated per-ID cache with status TTLs',async()=>{
  let calls=0,auth=0,time=0;const full=detail();
  const handler=createMatchesHandler({token:'test-only',now:()=>time,load:seasonOf('215997','215998'),authenticate:async()=>{auth++;return{id:'u',email_confirmed_at:'yes'};},loadDetail:async({id})=>{calls++;return{...full,id};}});
  for(const query of ['?id=','?id=0','?id=-1','?id=abc','?id=1&id=2','?id=9007199254740992','?id=01']) {const res=await handler(request(query));assert.equal(res.status,400);assert.equal((await res.json()).error.code,'INVALID_MATCH_ID');}
  for(const query of ['?url=https://evil.test','?id=215997&season_id=99','?id=215997&endpoint=stats'])assert.equal((await handler(request(query))).status,400);
  assert.equal((await handler(request('?id=215997',false))).status,401);assert.equal(calls,0);
  const responses=await Promise.all([handler(request('?id=215997')),handler(request('?id=215997'))]);assert.equal(calls,1);assert.equal(auth,2);
  // PROD1.2: a complete finished match is stable for 6 h (was 1 h); browser max-age follows the remaining TTL.
  assert.equal(responses[0].headers.get('cache-control'),'private, max-age=21600');
  time=30000;assert.equal((await handler(request('?id=215997'))).headers.get('cache-control'),'private, max-age=21570');assert.equal(calls,1);
  await handler(request('?id=215998'));assert.equal(calls,2);time=21600001;await handler(request('?id=215997'));assert.equal(calls,3);
  const kickoff=Date.parse(full.kickoff);
  assert.equal(detailTTL({...full,status:'live'}),45);assert.equal(detailTTL({...full,availability:{stats:'error'}}),60);
  for(const [hoursAhead,ttl] of [[1,300],[2,300],[3,1800],[24,1800],[25,3600]])assert.equal(detailTTL({...full,status:'upcoming',lineups:null,availability:{stats:'unavailable'}},kickoff-hoursAhead*3600e3),ttl,'upcoming '+hoursAhead+'h');
  assert.equal(detailTTL({...full,status:'upcoming',availability:{stats:'unavailable'}},kickoff-48*3600e3),300,'upcoming with predicted/confirmed lineups keeps 5 min');
  assert.equal(detailTTL({...full,availability:{stats:'unavailable'}},kickoff+3*3600e3),60,'recently finished, still filling');
  assert.equal(detailTTL({...full,availability:{stats:'unavailable'}},kickoff+5*3600e3),3600,'older finished gap');
  assert.equal(detailTTL({...full,status:'postponed',availability:{}}),600);
});
test('detail handler never exposes provider errors; failures are retried only after a short cool-down',async()=>{
  // PROD1.2: unknown ids are remembered for 10 min, other provider errors for 15 s (no retry storm).
  for(const [code,retryAfterMs] of [['MATCH_NOT_FOUND',600000],['secret credential',15000]]){
    let calls=0,time=0;const handler=createMatchesHandler({now:()=>time,load:seasonOf('215997'),authenticate:async()=>({id:'u',email_confirmed_at:'yes'}),loadDetail:async()=>{calls++;throw Error(code);}});
    for(let i=0;i<2;i++){const res=await handler(request('?id=215997'));assert.equal(res.status,code==='MATCH_NOT_FOUND'?404:503);assert.deepEqual(await res.json(),{error:{code:code==='MATCH_NOT_FOUND'?code:'PROVIDER_UNAVAILABLE'}});assert.equal(res.headers.get('cache-control'),'no-store');}
    assert.equal(calls,1);
    time=retryAfterMs+1;await handler(request('?id=215997'));assert.equal(calls,2);
  }
});
