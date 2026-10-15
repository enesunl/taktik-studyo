import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchesHandler,CACHE_LIMITS} from '../supabase/functions/matches/handler.js';
import {match} from './helpers/matches-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';

// SEC2: a signed-in user must not be able to spend the shared provider quota by enumerating
// match ids. Details are fetched only for fixtures of the last successfully loaded season.
const user={id:'u',email_confirmed_at:'2026-10-01'};
const req=q=>new Request('https://x.test/functions/v1/matches'+q,{headers:{authorization:'Bearer jwt'}});
const H=3600e3;

test('unscheduled ids never reach the provider: 404 from the cached season list',async()=>{
  let seasonLoads=0,detailCalls=0;
  const h=createMatchesHandler({token:'t',now:()=>0,authenticate:async()=>user,
    load:async()=>{seasonLoads++;return {season:'2026-2027',matches:[match({id:215997})]};},
    loadDetail:async({id})=>{detailCalls++;return {...detail(),id};}});
  assert.equal((await h(req('?id=215997'))).status,200);assert.equal(detailCalls,1);
  for(let id=300000;id<300200;id++){
    const res=await h(req('?id='+id));assert.equal(res.status,404);assert.deepEqual(await res.json(),{error:{code:'MATCH_NOT_FOUND'}});
  }
  assert.equal(detailCalls,1,'200 enumerated ids cost no provider request');assert.equal(seasonLoads,1,'season served from cache');
});

test('no season ever loaded → 503 without a detail request; lost access clears the schedule',async()=>{
  let detailCalls=0,mode='down',time=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,
    load:async()=>{if(mode==='down')throw Error('matches_unavailable');if(mode==='denied')throw Object.assign(Error('matches_unavailable'),{accessDenied:true});return {season:'2026-2027',matches:[match({id:215997})]};},
    loadDetail:async({id})=>{detailCalls++;if(mode==='down')throw Error('PROVIDER_UNAVAILABLE');return {...detail(),id};}});
  const first=await h(req('?id=215997'));assert.equal(first.status,503);assert.equal(detailCalls,0);
  time+=CACHE_LIMITS.failureCooldownMs+1;mode='ok';assert.equal((await h(req('?id=215997'))).status,200);assert.equal(detailCalls,1);
  // A temporary outage keeps the last schedule: the retained detail is still served (stale).
  time+=7*H;mode='down';const stale=await h(req('?id=215997'));assert.equal(stale.status,200);assert.equal((await stale.json()).freshness.stale,true);
  // Lost provider access purges data and the schedule: nothing is served or fetched.
  time+=CACHE_LIMITS.failureCooldownMs+1;mode='denied';const before=detailCalls;
  assert.equal((await h(req('?id=215997'))).status,503);assert.equal(detailCalls,before);
});
