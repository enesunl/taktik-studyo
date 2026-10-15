import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchesHandler,seasonTTL,CACHE_LIMITS} from '../supabase/functions/matches/handler.js';
import {fetchDetail,fetchSeason,PROVIDER_LIMITED,retryAfterMs} from '../supabase/functions/matches/provider.js';
import {match,event,deferred} from './helpers/matches-fixture.mjs';
import {detail,resources} from './helpers/match-detail-fixture.mjs';

const user={id:'u',email_confirmed_at:'2026-10-01'};
const req=(query='')=>new Request('https://x.test/functions/v1/matches'+query,{headers:{authorization:'Bearer jwt'}});
const MIN=60e3,H=3600e3;
const at=(iso,status)=>({...match(),status,kickoff:new Date(iso).toISOString()});
const limited=(retryAfter=0,message='provider_limited')=>Object.assign(Error(message),{limited:true,retryAfterMs:retryAfter});
const denied=(message='matches_unavailable')=>Object.assign(Error(message),{accessDenied:true});
const withoutFreshness=async response=>{const {freshness,...rest}=await response.json();return {rest,freshness};};

test('season TTL: unchanged 5 min around matches, up to 30 min when idle, refreshed before the next window',()=>{
  const now=Date.parse('2026-10-17T12:00:00Z');
  assert.equal(seasonTTL({matches:[at('2026-10-10T17:00:00Z','live')]},now),300,'live');
  assert.equal(seasonTTL({matches:[at('2026-10-17T12:20:00Z','upcoming')]},now),300,'kickoff in 20 min');
  assert.equal(seasonTTL({matches:[at('2026-10-17T10:00:00Z','finished')]},now),300,'finished 2h ago');
  assert.equal(seasonTTL({matches:[at('2026-10-18T17:00:00Z','upcoming')]},now),1800,'next match tomorrow');
  assert.equal(seasonTTL({matches:[at('2026-10-17T12:45:00Z','upcoming')]},now),900,'window opens in 15 min');
  assert.equal(seasonTTL({matches:[]},now),1800);
});

test('responses keep every existing field and add freshness {stale, fetchedAt}; stale data is marked',async()=>{
  let time=Date.parse('2026-10-17T12:00:00Z'),loads=0,fail=false;const data={season:'2026-2027',matches:[at('2026-10-25T17:00:00Z','upcoming')]};
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,load:async()=>{loads++;if(fail)throw Error('matches_unavailable');return data;}});
  const first=await withoutFreshness(await h(req()));
  assert.deepEqual(first.rest,data,'existing contract unchanged');assert.deepEqual(first.freshness,{stale:false,fetchedAt:'2026-10-17T12:00:00.000Z'});
  time+=seasonTTL(data,time)*1000+1;fail=true;
  const response=await h(req());assert.equal(response.status,200);assert.equal(response.headers.get('x-matches-cache'),'stale');assert.equal(response.headers.get('cache-control'),'private, max-age=30');
  const stale=await withoutFreshness(response);assert.deepEqual(stale.rest,data);assert.deepEqual(stale.freshness,{stale:true,fetchedAt:'2026-10-17T12:00:00.000Z'});
  const calls=loads;await h(req());assert.equal(loads,calls,'15 s cool-down after a temporary failure');
  time+=CACHE_LIMITS.failureCooldownMs+1;fail=false;assert.equal((await withoutFreshness(await h(req()))).freshness.stale,false);assert.equal(loads,calls+1);
  // Stale data is bounded; without data the existing error contract is unchanged.
  time+=CACHE_LIMITS.staleSeasonMs+seasonTTL(data,time)*1000;fail=true;
  const expired=await h(req());assert.equal(expired.status,502);assert.deepEqual(await expired.json(),{error:{code:'matches_unavailable'}});
});

test('429: every limit honours Retry-After as sent; no midnight/quota assumption; exponential back-off without header',async()=>{
  let time=Date.parse('2026-10-17T22:30:00Z'),loads=0,next=()=>({season:'2026-2027',matches:[at('2026-10-25T17:00:00Z','upcoming')]});
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,load:async()=>{loads++;return next();},loadDetail:async()=>{throw Error('unused');}});
  await h(req());time+=CACHE_LIMITS.seasonIdleMaxTtl*1000+1;
  // A 429 with Retry-After 120 s (whatever its code) blocks exactly 120 s, then retries; not until midnight.
  next=()=>{throw limited(120e3);};let before=loads;
  assert.equal((await h(req())).headers.get('x-matches-cache'),'stale');assert.equal(loads,before+1);
  time+=119e3;await h(req());assert.equal(loads,before+1,'inside Retry-After');
  assert.equal((await h(req('?id=215997'))).status,503,'provider-wide: details wait too');
  time+=2e3;next=()=>({season:'2026-2027',matches:[at('2026-10-25T17:00:00Z','upcoming')]});
  assert.equal((await h(req())).headers.get('x-matches-cache'),'fresh');assert.equal(loads,before+2,'retried right after 120 s, long before 00:00 UTC');
  // No Retry-After: 1 s, 2 s, 4 s ... (streak resets after a success).
  time+=CACHE_LIMITS.seasonIdleMaxTtl*1000+1;next=()=>{throw limited(0);};before=loads;
  for(const wait of [1000,2000,4000]){await h(req());const attempted=loads;time+=wait-1;await h(req());assert.equal(loads,attempted,'blocked for '+wait);time+=2;}
  await h(req());assert.equal(loads,before+4);
  // Very long Retry-After values are honoured up to 24 h.
  time+=8001;next=()=>{throw limited(48*H);};await h(req());const blocked=loads;time+=23*H;await h(req());assert.equal(loads,blocked);time+=H+1;await h(req());assert.equal(loads,blocked+1);
});

test('Retry-After parsing: seconds and HTTP dates; invalid or past values mean no header',()=>{
  const now=Date.parse('2026-10-17T12:00:00Z');
  assert.equal(retryAfterMs('1',now),1000);assert.equal(retryAfterMs('3600',now),3600e3);
  assert.equal(retryAfterMs('Sat, 17 Oct 2026 12:01:30 GMT',now),90e3);
  for(const v of [null,'', '0','-5','soon','Sat, 17 Oct 2026 11:00:00 GMT'])assert.equal(retryAfterMs(v,now),0,String(v));
});

test('access denied (401/402/403): caches purged, retained data never served, re-probe every 5 min',async()=>{
  for(const status of [401,402,403]){
    let time=Date.parse('2026-10-17T12:00:00Z'),mode='ok',loads=0;const json=(s,b)=>new Response(JSON.stringify(b),{status:s});
    const page={count:1,next:null,results:[event({id:215997,event_date:'2026-10-25T17:00:00+00:00',status:'notstarted',home_score:null,away_score:null})]};
    const fetchImpl=async url=>{loads++;if(mode==='denied')return json(status,{code:'authentication_required'});if(mode==='outage')return json(503,{});
      const path=String(url);if(path.includes('?'))return json(200,page);if(path.endsWith('/215997/'))return json(200,event());
      const name=path.split('/215997/')[1].replace('/','');return json(200,resources()[name].value);};
    const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,load:({token})=>fetchSeason({token,fetchImpl}),loadDetail:({id,token})=>fetchDetail({id,token,fetchImpl})});
    assert.equal((await h(req())).status,200);assert.equal((await h(req('?id=215997'))).status,200);
    // A temporary outage still serves the retained copy, marked stale.
    time+=7*H;mode='outage';assert.equal((await withoutFreshness(await h(req('?id=215997')))).freshness.stale,true,status+' outage');
    // Lost access: no stale fallback for fixtures or details, and the copies are gone.
    time+=CACHE_LIMITS.failureCooldownMs+1;mode='denied';
    const fixtures=await h(req());assert.equal(fixtures.status,502,status+' fixtures');assert.deepEqual(await fixtures.json(),{error:{code:'matches_unavailable'}});
    const detailRes=await h(req('?id=215997'));assert.equal(detailRes.status,503,status+' detail');assert.deepEqual(await detailRes.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});
    const probes=loads;time+=CACHE_LIMITS.accessReprobeMs-1;mode='outage';await h(req());assert.equal(loads,probes,'no provider calls during access re-probe window');
    const after=await h(req('?id=215997'));assert.equal(after.status,503,'retained detail is not resurrected');
    time+=2;mode='ok';assert.equal((await h(req())).status,200,'access restored after re-probe');
  }
});

test('details: stale only for temporary failures, never for unknown ids; concurrent misses share one request',async()=>{
  let time=0,calls=0,mode='ok';const gate=deferred();const full=detail();
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,loadDetail:async({id})=>{calls++;if(mode==='wait')await gate.promise;if(mode==='fail')throw Error('PROVIDER_UNAVAILABLE');if(mode==='missing')throw Error('MATCH_NOT_FOUND');return {...full,id};}});
  const fresh=await withoutFreshness(await h(req('?id=215997')));assert.equal(calls,1);assert.equal(fresh.freshness.stale,false);
  time=6*H+1;mode='fail';const stale=await withoutFreshness(await h(req('?id=215997')));assert.deepEqual(stale.rest,fresh.rest);assert.equal(stale.freshness.stale,true);
  mode='missing';time+=CACHE_LIMITS.failureCooldownMs+1;assert.equal((await h(req('?id=215997'))).status,404,'MATCH_NOT_FOUND is never masked');
  mode='wait';const a=h(req('?id=300001')),b=h(req('?id=300001'));await Promise.resolve();gate.resolve();
  await Promise.all([a,b]);assert.equal(calls,4,'one shared request for two concurrent misses');
});

test('optional resources: 429 keeps the partial body and backs off; 401 on any resource fails the whole detail',async()=>{
  const base={'':()=>Response.json(event()),'lineups/':()=>Response.json(resources().lineups.value),'incidents/':()=>Response.json(resources().incidents.value),'stats/':()=>Response.json(resources().stats.value)};
  const fetchWith=overrides=>async url=>({...base,...overrides})[String(url).split('/215997/')[1]]();
  const partial=await fetchDetail({id:'215997',token:'t',fetchImpl:fetchWith({'stats/':()=>new Response(JSON.stringify({code:'rate_limited'}),{status:429,headers:{'Retry-After':'20'}})})});
  assert.equal(partial.availability.stats,'error');assert.deepEqual(partial[PROVIDER_LIMITED],{retryAfterMs:20000});
  assert.doesNotMatch(JSON.stringify(partial),/retryAfter|providerLimited/);
  await assert.rejects(fetchDetail({id:'215997',token:'t',fetchImpl:fetchWith({'lineups/':()=>new Response('{}',{status:401})})}),e=>e.accessDenied===true&&e.message==='PROVIDER_UNAVAILABLE');
  let time=0,seasonLoads=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,loadDetail:async()=>partial,load:async()=>{seasonLoads++;return {season:'2026-2027',matches:[]};}});
  const res=await h(req('?id=215997'));assert.equal(res.status,200);assert.equal((await res.json()).availability.stats,'error');
  assert.equal((await h(req())).status,503,'fixtures wait for the 20 s Retry-After');assert.equal(seasonLoads,0);
  time=20001;assert.equal((await h(req())).status,200);assert.equal(seasonLoads,1);
  // Provider errors map to the unchanged outward messages.
  await assert.rejects(fetchSeason({token:'t',fetchImpl:async()=>new Response('{}',{status:403})}),e=>e.accessDenied&&e.message==='matches_unavailable');
  await assert.rejects(fetchSeason({token:'t',fetchImpl:async()=>new Response('{}',{status:429,headers:{'Retry-After':'1'}})}),e=>e.limited&&e.retryAfterMs===1000&&e.message==='provider_limited');
});
