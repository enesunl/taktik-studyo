import test from 'node:test';
import assert from 'node:assert/strict';
import {localMatchesEndpoint,requestMatches} from '../src/lib/matches-transport.js';
import {createMatchesApi} from '../src/lib/matches.js';
import {createLocalMatches} from '../scripts/local-matches.mjs';
import {match,deferred} from './helpers/matches-fixture.mjs';

const season={season:'2026-2027',matches:[match()]};
const current=()=>true;
test('local endpoint selection is exact, production stays on the configured SDK, queries cannot override it',async()=>{
  for(const origin of ['http://localhost:4173','http://127.0.0.1:4173']) assert.equal(localMatchesEndpoint(new URL(origin+'/maclar?url=https://evil.test')),'/__local/matches');
  for(const origin of ['https://taktikstudyo.com','http://localhost:4174','http://localhost.evil.test:4173','http://127.0.0.2:4173'])assert.equal(localMatchesEndpoint(new URL(origin)),null);
  let calls=0;
  const client={functions:{invoke:async(...args)=>{calls++;assert.deepEqual(args,['matches',{method:'GET',timeout:16000}]);return{data:season};}},auth:{getSession(){throw Error('No alternate auth');}}};
  const response=await requestMatches({client,current,location:new URL('https://taktikstudyo.com/maclar?endpoint=http://localhost:4173'),fetchImpl(){throw Error('No local fetch');}});
  assert.equal(response.data,season);assert.equal(calls,1);
});
test('local browser sends only session bearer to fixed same-origin endpoint, no production matches or media call',async()=>{
  const calls=[];
  const client={auth:{getSession:async()=>({data:{session:{access_token:'qa-session-only'}}})},functions:{invoke(){throw Error('No production matches');}}};
  const api=createMatchesApi({client,current,location:new URL('http://localhost:4173/maclar'),fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(season);}});
  assert.equal((await api.load()).ok,true);assert.equal(calls.length,1);assert.equal(calls[0].url,'/__local/matches');
  assert.equal(calls[0].options.headers.Authorization,'Bearer qa-session-only');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.credentials,'omit');
});
test('missing session, session error, stale session lookup and local errors fail closed without raw error data',async()=>{
  for(const session of [{data:{session:null}},{error:{message:'private'},data:{} }]){
    const api=createMatchesApi({client:{auth:{getSession:async()=>session}},current,location:new URL('http://localhost:4173'),fetchImpl(){throw Error('No network');}});
    assert.deepEqual(await api.load(),{ok:false,error:{code:'matches_unavailable'}});
  }
  const wait=deferred();let active=true,requests=0;
  const api=createMatchesApi({client:{auth:{getSession:()=>wait.promise}},current:()=>active,location:new URL('http://localhost:4173'),fetchImpl:async()=>{requests++;return Response.json(season);}});
  const pending=api.load();active=false;wait.resolve({data:{session:{access_token:'qa-session-only'}}});
  assert.deepEqual(await pending,{ok:false,error:{code:'state_changed'}});assert.equal(requests,0);
});
test('local server validates bearer through the local Auth GET before provider/cache access',async()=>{
  const calls=[];let loads=0;
  const handler=createLocalMatches({url:'http://127.0.0.1:54321',key:'sb_publishable_testonly',token:'test-only',port:4173,
    fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return Response.json({id:'u',email_confirmed_at:'2026-09-21',is_anonymous:false});},
    load:async()=>{loads++;return season;}});
  const req=()=>new Request('http://localhost:4173/__local/matches',{headers:{Authorization:'Bearer qa-session-only',Origin:'http://localhost:4173'}});
  assert.equal((await handler(req())).status,200);assert.equal((await handler(req())).status,200);assert.equal(loads,1);assert.equal(calls.length,2);
  for(const {url,options} of calls){assert.equal(url,'http://127.0.0.1:54321/auth/v1/user');assert.equal(options.method,'GET');assert.equal(new Headers(options.headers).get('Authorization'),'Bearer qa-session-only');}
  assert.equal((await handler(new Request('http://localhost:4173/__local/matches'))).status,401);
  assert.equal((await handler(new Request('http://localhost:4173/__local/matches?url=https://evil.test',{headers:{Authorization:'Bearer qa-session-only'}}))).status,400);
});
test('local server denies invalid/unconfirmed/anonymous users and refuses service-role configuration',async()=>{
  for(const value of [{id:'u'},{id:'u',email_confirmed_at:'yes',is_anonymous:true},null]){
    const handler=createLocalMatches({url:'http://127.0.0.1:54321',key:'sb_publishable_testonly',token:'test-only',port:4173,
      fetchImpl:async()=>Response.json(value??{message:'private'},{status:value?200:401}),load(){throw Error('No BSD');}});
    assert.equal((await handler(new Request('http://localhost:4173/__local/matches',{headers:{Authorization:'Bearer qa-session-only'}}))).status,401);
  }
  assert.throws(()=>createLocalMatches({url:'https://evil.test',key:'sb_publishable_testonly',token:'test-only',port:4173}));
  assert.throws(()=>createLocalMatches({url:'http://127.0.0.1:54321',key:'sb_secret_testonly',token:'test-only',port:4173}));
});
