import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchesHandler,matchesOrigins,seasonTTL} from '../supabase/functions/matches/handler.js';
import {match,deferred} from './helpers/matches-fixture.mjs';

const user = {id:'test-user',email_confirmed_at:'2026-09-01'};
const request = (query = '',headers = {},method = 'GET') => new Request('http://localhost/functions/v1/matches'+query,{method,headers:{origin:'http://localhost:4173',authorization:'Bearer test-jwt',...headers}});
const result = {season:'2026-2027',matches:[match()]};
const options = {token:'test-only',authenticate:async() => user,load:async() => result,origins:['http://localhost:4173']};
test('matches requires verified confirmed non-anonymous Auth before any provider/cache access',async() => {
  for(const u of [null,{id:'u'},{...user,is_anonymous:true}]) {
    let reads = 0;const handler = createMatchesHandler({...options,authenticate:async() => u,load:async() => {reads++;return result;}});
    assert.equal((await handler(request())).status,401);assert.equal(reads,0);
  }
  const handler = createMatchesHandler({...options,authenticate:async() => {throw Error('private');}});
  assert.equal((await handler(request())).status,401);
  assert.equal((await handler(request('',{authorization:''}))).status,401);
});
test('strict origin handling and GET-only fixed scope; CORS never wildcard',async() => {
  const handler = createMatchesHandler(options);
  for (const query of ['?league_id=12','?season_id=1','?url=https://evil.invalid','?round=6']) assert.equal((await handler(request(query))).status,400);
  assert.equal((await handler(request('',{},'POST'))).status,405);
  assert.equal((await handler(request('',{origin:'https://attacker.invalid'}))).status,403);
  const preflight = await handler(request('',{},'OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:4173');
  assert.deepEqual(matchesOrigins(),['https://taktikstudyo.com']);
  for(const origin of ['*','','https://taktikstudyo.com/path','https://user:pass@example.com','http://localhost:9999','https://*.example.com']) assert.throws(() => matchesOrigins(origin));
});
test('cache is private, expires per seasonTTL, deduplicates concurrent loads and authenticates cache hits',async() => {
  let loads=0,checks=0,time=0;const wait=deferred();
  const handler=createMatchesHandler({...options,now:()=>time,authenticate:async()=>{checks++;return user;},load:async()=>{loads++;return wait.promise;}});
  const a=handler(request()),b=handler(request());await Promise.resolve();wait.resolve(result);
  const responses=await Promise.all([a,b]);assert.equal(loads,1);assert.equal(checks,2);
  // Browser max-age stays at most 5 minutes; the server TTL depends on how close a match is (PROD1.2).
  const ttl=seasonTTL(result,0);assert.equal(responses[0].headers.get('cache-control'),'private, max-age='+Math.min(300,ttl));
  await handler(request());assert.equal(loads,1);assert.equal(checks,3);
  time=ttl*1000-1;await handler(request());assert.equal(loads,1);
  time=ttl*1000+1;await handler(request());assert.equal(loads,2);
});
test('rate limit, timeout and connection failures never expose upstream body, token or error',async() => {
  for(const error of ['provider_limited','secret token, URL and stack']) {
    const handler=createMatchesHandler({...options,load:async()=>{throw Error(error);}});
    const response=await handler(request());assert.equal(response.status,error==='provider_limited'?503:502);
    assert.deepEqual(await response.json(),{error:{code:'matches_unavailable'}});assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
