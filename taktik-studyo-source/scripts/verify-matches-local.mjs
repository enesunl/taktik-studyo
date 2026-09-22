// Opt-in, read-only live BSD verification. No .env loading, credential output,
// storage, production Supabase requests, deployment or database operations.
// This runs the real handler/provider in Node, with a test-only Auth dependency;
// it does NOT claim to validate the Supabase gateway/Deno runtime or real Auth.
import assert from 'node:assert/strict';
import {createMatchesHandler} from '../supabase/functions/matches/handler.js';
import {fetchSeason} from '../supabase/functions/matches/provider.js';
import {defaultRound,seasonValid} from '../src/lib/matches.js';

if (!process.env.BSD_API_TOKEN) {
  console.error('BSD_API_TOKEN must be supplied in the local process environment.');
  process.exitCode = 1;
} else {
  try {
    let upstreamRequests = 0;
    const handler = createMatchesHandler({token:process.env.BSD_API_TOKEN,
      origins:['http://localhost:4173'],
      authenticate:async jwt => jwt === 'local-test-only' ? {id:'local-test-user',email_confirmed_at:'2026-09-21'} : null,
      load:options => fetchSeason({...options,fetchImpl:(url,init) => {upstreamRequests++;return fetch(url,init);}}),
    });
    const request = () => new Request('http://localhost/functions/v1/matches',{headers:{origin:'http://localhost:4173',authorization:'Bearer local-test-only'}});
    const response = await handler(request());assert.equal(response.status,200);
    const data = await response.json();assert.ok(seasonValid(data));
    assert.equal(data.matches.length,306);assert.equal(new Set(data.matches.map(m => m.id)).size,306);
    const rounds = [...new Set(data.matches.map(m => m.round))].sort((a,b) => a-b);
    assert.deepEqual(rounds,Array.from({length:34},(_,i) => i+1));
    assert.ok(rounds.every(round => data.matches.filter(m => m.round === round).length === 9));
    assert.equal(upstreamRequests,2);
    await handler(request());assert.equal(upstreamRequests,2);
    console.log(JSON.stringify({runtime:'Node handler; mocked Auth; live BSD GET only',fixtures:data.matches.length,unique:306,rounds:[rounds[0],rounds.at(-1)],matchesPerRound:9,quality:data.quality,defaultRound:defaultRound(data.matches),upstreamRequests,cacheHit:true}));
  } catch {
    // Never serialize upstream/SDK errors or assertions containing provider data.
    console.error('Local matches verification failed; no credentials or raw provider response logged.');
    process.exitCode = 1;
  }
}
