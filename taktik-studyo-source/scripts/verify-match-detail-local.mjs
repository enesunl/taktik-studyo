// Opt-in live BSD GET verification. Token stays in the process environment.
// Real Node handler/provider, test-only Auth dependency: not browser/gateway QA.
import assert from 'node:assert/strict';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';
import {fetchDetail} from '../supabase/functions/matches/provider.js';
import {detailValid} from '../src/lib/match-detail.js';

if (!process.env.BSD_API_TOKEN) {
  console.error('BSD_API_TOKEN must be supplied in the local process environment.');
  process.exitCode = 1;
} else {
  try {
    let upstreamRequests = 0;
    const handler = createMatchesHandler({token:process.env.BSD_API_TOKEN,
      origins:['http://localhost:4173'],
      authenticate:async jwt => jwt === 'local-test-only' ? {id:'local-test-user',email_confirmed_at:'2026-09-21'} : null,
      loadDetail:options => fetchDetail({...options,fetchImpl:(url,init) => {upstreamRequests++;return fetch(url,init);}}),
    });
    const request = id => new Request('http://localhost/functions/v1/matches?id='+id,{headers:{origin:'http://localhost:4173',authorization:'Bearer local-test-only'}});
    const summaries = [];
    for (const id of ['215997','216231']) {
      const response = await handler(request(id));assert.equal(response.status,200);
      const data = await response.json();assert.ok(detailValid(data,id));
      assert.equal(JSON.stringify(data).includes('https://'),false);
      if (id === '215997') {
        assert.equal(data.status,'finished');assert.equal(data.round,6);
        assert.deepEqual(data.score,{home:3,away:2});
        assert.equal(data.lineups.home.formation,'4-2-3-1');assert.equal(data.lineups.away.formation,'4-1-4-1');
        for (const side of ['home','away']) {assert.equal(data.lineups[side].starters.length,11);assert.equal(data.lineups[side].substitutes.length,10);}
        assert.equal(data.incidents.length,33);assert.equal(data.substitutions.length,9);
        assert.equal(data.statistics.xg.away,2.13);
      } else {
        assert.equal(data.status,'upcoming');assert.deepEqual(data.score,{home:null,away:null});
      }
      const before = upstreamRequests;
      assert.equal((await handler(request(id))).status,200);assert.equal(upstreamRequests,before);
      summaries.push({id,status:data.status,round:data.round,score:data.score,
        availability:data.availability,incidents:data.incidents.length,substitutions:data.substitutions.length,
        lineups:data.lineups ? Object.fromEntries(['home','away'].map(side => [side,data.lineups[side] ? {formation:data.lineups[side].formation,starters:data.lineups[side].starters.length,bench:data.lineups[side].substitutes.length} : null])) : null,
        xg:data.statistics?.xg ?? null,cacheHit:true});
    }
    assert.equal(upstreamRequests,8);
    console.log(JSON.stringify({runtime:'Node handler; mocked Auth; live BSD GET only',upstreamRequests,matches:summaries}));
  } catch {
    console.error('Local match-detail verification failed; no credentials or raw provider response logged.');
    process.exitCode = 1;
  }
}
