import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAllowedOrigins} from '../supabase/functions/lineups/origins.js';
import {createHandler} from '../supabase/functions/lineups/handler.js';
import {createBotVerifier} from '../supabase/functions/lineups/turnstile.js';

const production = 'https://taktikstudyo.com';
const preview = 'https://preview.example.test';

test('origin configuration defaults to production only when absent; explicit lists replace the default', () => {
  assert.deepEqual(parseAllowedOrigins(), [production]);
  assert.deepEqual(parseAllowedOrigins(undefined), [production]);
  assert.deepEqual(parseAllowedOrigins(production), [production]);
  assert.deepEqual(parseAllowedOrigins(preview), [preview]);
});

test('origin configuration normalizes HTTPS origins, trims entries and removes duplicates', () => {
  assert.deepEqual(parseAllowedOrigins(` HTTPS://TAKTIKSTUDYO.COM:443/, ${preview}, ${production} `), [production, preview]);
  assert.deepEqual(parseAllowedOrigins('https://preview.example.test:8443/'), ['https://preview.example.test:8443']);
});

test('invalid or empty origin configuration fails closed, including mixed valid and invalid entries', () => {
  const invalid = ['', ' ', '*', 'null', null, 42, 'not a URL', 'http://taktikstudyo.com',
    'https://*.example.test', 'https://%2a.example.test', 'https://user:password@example.test',
    `${production}/lineup/123`, `${production}/.`, `${production}/?`, `${production}#`,
    `${production}?x=1`, `${production}#fragment`, 'https://example.test\\path',
    'https://exam\nple.test', 'https:///example.test', 'https://example.test:99999',
    `${production},`, `,${production}`, `${production},,${preview}`, `${production},*`];
  for (const value of invalid) assert.throws(() => parseAllowedOrigins(value), /ALLOWED_ORIGINS/);
});

test('production origin regression: default and explicit configuration allow preflight with exact headers', async () => {
  for (const config of [undefined, production]) {
    let accesses = 0;
    const handler = createHandler({
      origins:parseAllowedOrigins(config), publicKey:'public-test',
      client:{from() { accesses++; }, rpc() { accesses++; }},
      verifyBot:async () => { accesses++; return false; }
    });
    const response = await handler(new Request('https://db.test/functions/v1/lineups', {
      method:'OPTIONS', headers:{origin:production,'access-control-request-method':'POST',
        'access-control-request-headers':'apikey, authorization, content-type, x-bot-token'}
    }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), production);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
    assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'apikey, authorization, content-type, x-bot-token');
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal(accesses, 0);
  }
});

test('configured origins support preflight, verified sharing and reads with exact CORS headers', async () => {
  const origins = parseAllowedOrigins(`${production},${preview}`);
  const payload = {team_name:'Test',formation:'4-3-3',lineup_data:{team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},customized:false,players:Array.from({length:11},(_,id)=>({id,x:50,y:50,role:'MO',name:'Test',number:id+1,renamed:false}))},drawing_data:[]};
  const id = '01234567-89ab-4cde-8fab-0123456789ab';
  const owner = '11111111-1111-4111-8111-111111111111', jwt = 'user-jwt-fixture';
  let writes = 0, reads = 0, verifications = 0;
  const client = {
    async rpc(name, args) { assert.equal(name, 'create_shared_lineup'); assert.deepEqual(args.payload, payload); assert.match(args.client_bucket, /^[a-f0-9]{64}$/); assert.equal(args.owner, owner); writes++; return {data:id}; },
    from(table) { assert.equal(table, 'shared_lineups'); return {
      select() { return this; }, eq(column, value) { assert.equal(column, 'public_id'); assert.equal(value, id); return this; },
      async maybeSingle() { reads++; return {data:{...payload,expires_at:null}}; }
    }; }
  };
  const verifyBot = createBotVerifier({secret:'unit-test-fixture',origins,fetcher:async (_url, options) => {
    verifications++;
    return {ok:true,json:async()=>({success:true,action:'share_lineup',hostname:options.body.get('response')})};
  }});
  // ACCOUNT1: the owner comes only from the verified JWT.
  const authenticate = async token => token === jwt ? {id:owner,email_confirmed_at:'2026-10-14T00:00:00Z'} : null;
  const handler = createHandler({client,origins,publicKey:'public-test',rateSalt:'test-only',sharingReady:true,verifyBot,authenticate});
  for (const origin of origins) {
    const request = (method, headers = {}) => new Request('https://db.test/functions/v1/lineups' + (method === 'GET' ? '?id=' + id : ''), {
      method, headers:{origin,apikey:'public-test','content-type':'application/json',...headers},
      ...(method === 'POST' ? {body:JSON.stringify(payload)} : {})
    });
    const preflight = await handler(request('OPTIONS'));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(preflight.headers.get('Vary'), 'Origin');
    assert.equal(preflight.headers.get('X-Sharing-Ready'), 'true');
    const anonymous = await handler(request('POST', {'x-bot-token':new URL(origin).hostname}));
    assert.equal(anonymous.status, 401);
    const forged = await handler(request('POST', {'x-bot-token':new URL(origin).hostname,authorization:'Bearer forged'}));
    assert.equal(forged.status, 401);
    const missingToken = await handler(request('POST', {authorization:'Bearer '+jwt}));
    assert.equal(missingToken.status, 403);
    const saved = await handler(request('POST', {'x-bot-token':new URL(origin).hostname,authorization:'Bearer '+jwt}));
    assert.equal(saved.status, 201);
    assert.equal(saved.headers.get('Access-Control-Allow-Origin'), origin);
    assert.deepEqual(await saved.json(), {public_id:id});
    const loaded = await handler(request('GET'));
    assert.equal(loaded.status, 200);
    assert.equal(loaded.headers.get('Access-Control-Allow-Origin'), origin);
    assert.deepEqual(await loaded.json(), payload);
  }
  assert.equal(writes, 2); assert.equal(reads, 2); assert.equal(verifications, 2);
});

test('unlisted, missing and deceptive origins receive 403 before Turnstile or database access without reflection', async () => {
  let writes = 0, reads = 0, verifications = 0;
  const client = {rpc() { writes++; },from() { reads++; }};
  const handler = createHandler({client,origins:parseAllowedOrigins(),publicKey:'public-test',rateSalt:'test-only',
    verifyBot:async () => { verifications++; return true; }});
  const payload = {team_name:'Test',formation:'4-3-3',lineup_data:{team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},customized:false,players:Array.from({length:11},(_,id)=>({id,x:50,y:50,role:'MO',name:'Test',number:id+1,renamed:false}))},drawing_data:[]};
  const denied = [undefined, 'null', '*', 'http://localhost:4173', 'https://www.taktikstudyo.com',
    'https://evil.example', 'https://taktikstudyo.com.evil.example', 'http://taktikstudyo.com',
    'https://taktikstudyo.com.evil.test', 'https://taktikstudyo.com:8443',
    'https://taktik-studyo.unql9enes.chatgpt.site'];
  for (const origin of denied) for (const method of ['OPTIONS','GET','POST']) {
    const headers = {apikey:'public-test','content-type':'application/json','x-bot-token':'fixture-token'};
    if (origin !== undefined) headers.origin = origin;
    const url = 'https://db.test/functions/v1/lineups' + (method === 'GET' ? '?id=01234567-89ab-4cde-8fab-0123456789ab' : '');
    const response = await handler(new Request(url, {method,headers,
      ...(method === 'POST' ? {body:JSON.stringify(payload)} : {})}));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(writes, 0); assert.equal(reads, 0); assert.equal(verifications, 0);
});

test('production-origin GET rejects invalid UUIDs before database access', async () => {
  let reads = 0;
  const handler = createHandler({origins:parseAllowedOrigins(),publicKey:'public-test',
    client:{from() { reads++; }}});
  for (const id of ['', 'not-a-uuid', '01234567-89ab-1cde-8fab-0123456789ab', '01234567-89ab-4cde-0fab-0123456789ab']) {
    const response = await handler(new Request('https://db.test/functions/v1/lineups?id=' + id, {
      headers:{origin:production,apikey:'public-test'}
    }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), production);
  }
  assert.equal(reads, 0);
});
