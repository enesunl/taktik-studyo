import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {createClient,isAuthApiError,isAuthSessionMissingError} from '@supabase/supabase-js';
import {createCatalogue} from '../src/lib/catalogue.js';
import {toShare} from '../src/lib/validation.js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {createAuthPageApi} from '../src/lib/auth-page-api.js';

const url = 'https://abcdefghijklmnopqrst.supabase.co';
const key = 'sb_publishable_local_test_only';
const id = '11111111-1111-4111-8111-111111111111';
const user = {id, email:'test@example.test', email_confirmed_at:'2026-09-18T10:00:00Z', aud:'authenticated', role:'authenticated'};
const team = {id:'test', name:'Test', short_name:'T', color_primary:'#123456', color_secondary:'#abcdef', logo_url:null};
const players = Array.from({length:11}, (_, i) => ({id:String(i), team_id:'test', name:'Player '+i,
  position:'M', shirt_number:i+1, photo_url:null, roles:['MO'], selection_rank:1}));
const board = {team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'}, formation:'4-3-3', customized:false,
  players:players.map((p,i) => ({id:i,name:p.name,x:50,y:50,number:i+1,role:'MO',renamed:false})), drawings:[]};
const jwt = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),
  Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
  'test_signature_not_a_real_token'].join('.');

test('real SDK main singleton persists normal Auth; dedicated recovery construction never persists', async () => {
  const calls = [], creations = [], storageCalls = [], clients = [];
  const storage = new Map([['taktik:draft:main:v1','untouched'], ['taktik:draft:shared:'+id+':v1','shared-untouched']]);
  const sdkStorage = {getItem:k => storage.get(k) ?? null,
    setItem(k,v){storageCalls.push(k); storage.set(k,v);}, removeItem(k){storageCalls.push(k); storage.delete(k);}};
  const http = async (input, options = {}) => {
    const target = new URL(input); assert.equal(target.origin, url, 'all HTTP must stay inside this fake');
    const headers = new Headers(options.headers), method = options.method || 'GET';
    calls.push({path:target.pathname, method, headers, body:options.body});
    if (target.pathname === '/auth/v1/token') return Response.json({access_token:jwt, refresh_token:'fake-refresh',
      token_type:'bearer', expires_in:3600, user});
    if (target.pathname === '/auth/v1/verify') return Response.json({access_token:jwt, refresh_token:'fake-refresh',
      token_type:'bearer', expires_in:3600, user});
    if (target.pathname === '/auth/v1/user') return Response.json(user);
    if (target.pathname === '/auth/v1/logout') {assert.equal(target.searchParams.get('scope'), 'local'); return new Response(null, {status:204});}
    if (target.pathname === '/rest/v1/teams') return Response.json([team]);
    if (target.pathname === '/rest/v1/players') return Response.json(players);
    if (target.pathname === '/functions/v1/lineups') {
      if (method === 'OPTIONS') return new Response(null,{headers:{'X-Sharing-Ready':'true'}});
      if (method === 'POST') return Response.json({public_id:id});
      assert.equal(target.searchParams.get('id'), id); return Response.json(toShare(board));
    }
    throw Error('Unexpected mock HTTP path');
  };
  let client;
  const output = await build({stdin:{contents:"import './src/backend-entry.js'; export {auth} from './src/lib/auth.js';",
    resolveDir:fileURLToPath(new URL('..', import.meta.url)), sourcefile:'auth-test-entry.js'},
    bundle:true, write:false, platform:'browser', format:'cjs', target:'es2022',
    define:{__SUPABASE_URL__:JSON.stringify(url), __SUPABASE_PUBLISHABLE_KEY__:JSON.stringify(key), __TURNSTILE_SITE_KEY__:'"test-site-key"',
      // Explicit legacy rollback build: this suite covers Auth persistence/sharing over the legacy catalogue tables (SEC1.1).
      __CATALOGUE_SOURCE__:'"legacy"'},
    plugins:[{name:'fake-sdk-boundary',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/}, () => ({path:'sdk',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'}, () => ({contents:'export const createClient = globalThis.testCreateClient; export const isAuthApiError=globalThis.testIsAuthApiError; export const isAuthSessionMissingError=globalThis.testIsAuthSessionMissingError;'}));}}]});
  const window = {localStorage:sdkStorage};
  const context = vm.createContext({window, module:{exports:{}}, URL, Headers, Response, TextEncoder, AbortSignal, setTimeout,
    fetch:http, testIsAuthApiError:isAuthApiError, testIsAuthSessionMissingError:isAuthSessionMissingError,
    document:{getElementById(){throw Error('unexpected catalogue fallback');}},
    testCreateClient(u,k,options){
      creations.push({url:u,key:k,options});
      client = createClient(u,k,{...options,auth:{...options.auth,storage:sdkStorage}});
      clients.push(client);
      return client;
    }});
  vm.runInContext(output.outputFiles[0].text, context);
  const auth = context.module.exports.auth, backend = window.TAKTIK_BACKEND;
  try {
    assert.equal(calls.length,0,'backend definition does not eagerly fetch catalogue or restore Auth');
    await auth.initialize(); await backend.loadCatalogue();
    assert.equal(creations.length, 1);
    const config = creations[0].options.auth;
    assert.equal(config.persistSession, true); assert.equal(config.autoRefreshToken, true);
    assert.equal(config.detectSessionInUrl, false); assert.equal(config.debug, false);
    assert.equal(config.storageKey, 'taktik:auth:abcdefghijklmnopqrst.supabase.co:v1');
    assert.equal(backend.source, 'supabase');
    const catalogue = createCatalogue(client, () => 0);
    assert.equal((await catalogue.load()).rosters.Test.players.length, 11);
    const publicQueries = calls.filter(c => c.path.startsWith('/rest/'));
    assert.ok(publicQueries.length >= 2);
    assert.ok(publicQueries.every(c => c.headers.get('authorization') !== 'Bearer '+jwt));
    // ACCOUNT1: reading/readiness stay anonymous; creating a share requires the signed-in session.
    const share = async signedIn => {
      assert.equal(await backend.sharingReady(), true);
      assert.equal((await backend.readLineup(id)).team.name, 'Test');
      if (signedIn) assert.equal(await backend.saveLineup(board, 'test-turnstile-proof'), id);
      else await assert.rejects(backend.saveLineup(board, 'test-turnstile-proof'), /giriş yapmalısın/);
      await assert.rejects(backend.saveLineup(board, ''));
    };
    await share(false);
    assert.equal((await auth.signInWithPassword({email:user.email,password:'fake-password'})).ok, true);
    assert.equal((await auth.validateUser()).user.id, id);
    const start = calls.length;
    assert.equal((await createCatalogue(client).load()).rosters.Test.players.length, 11);
    const authenticatedQueries = calls.slice(start).filter(c => c.path.startsWith('/rest/'));
    assert.equal(authenticatedQueries.length, 2);
    assert.ok(authenticatedQueries.every(c => c.headers.get('authorization') === 'Bearer '+jwt));
    await share(true);
    const shares = calls.filter(c => c.path.startsWith('/functions/'));
    assert.equal(shares.length, 5);
    assert.equal(shares.filter(c => c.method === 'POST').length, 1);
    for (const call of shares) {
      assert.equal(call.headers.get('apikey'), key);
      if (call.method === 'POST') {
        assert.equal(call.headers.get('authorization'), 'Bearer '+jwt);
        assert.equal(call.headers.get('x-bot-token'), 'test-turnstile-proof');
        assert.deepEqual(JSON.parse(call.body), toShare(board));
      } else assert.equal(call.headers.get('authorization'), null);
    }
    assert.equal(calls.some(c => c.path.includes('shared_lineups')), false);
    assert.equal((await auth.signOut()).ok, true);
    assert.equal(storage.get('taktik:draft:main:v1'), 'untouched');
    assert.equal(storage.get('taktik:draft:shared:'+id+':v1'), 'shared-untouched');
    assert.ok(storageCalls.every(k => k.startsWith(config.storageKey)));
    assert.doesNotMatch(JSON.stringify(window), /fake-refresh|test_signature|fake-password/);
    assert.deepEqual(Object.keys(window).sort(), ['TAKTIK_BACKEND','TAKTIK_DRAFTS','TAKTIK_ROSTERS','TAKTIK_SHARE','TAKTIK_TEAMS','localStorage'].sort());
    const writesBeforeRecovery = storageCalls.length;
    assert.equal((await auth.completePasswordRecovery({tokenHash:'phase5-recovery-token-fixture',password:'new password 12'})).ok,true);
    assert.equal(creations.length,2,'dedicated client created only for completion');
    const recoveryConfig = creations[1].options.auth;
    assert.equal(creations[1].url,url); assert.equal(creations[1].key,key);
    assert.equal(recoveryConfig.persistSession,false); assert.equal(recoveryConfig.autoRefreshToken,false);
    assert.equal(recoveryConfig.detectSessionInUrl,false); assert.equal(recoveryConfig.debug,false);
    assert.equal('storage' in recoveryConfig,false,'production recovery factory supplies no custom token storage');
    assert.notEqual(recoveryConfig.storageKey,config.storageKey);
    assert.notEqual(creations[0].options.global.fetch,creations[1].options.global.fetch);
    assert.equal(storageCalls.length,writesBeforeRecovery,'even an injected storage adapter is unused by nonpersistent SDK');
    assert.equal(storage.has(config.storageKey),false);
    assert.equal(auth.getState().status,'signed_out'); assert.equal(auth.getCurrentUser(),null);
    assert.doesNotMatch(JSON.stringify(window),/phase5-recovery|fake-refresh|test_signature|new password/);
  } finally {auth.dispose(); await Promise.all(clients.map(c => c.auth.dispose()));}
});

test('real SDK with two independent mocked devices: TokenHash confirmation needs no PKCE verifier', async () => {
  const calls = [], stores = [new Map(),new Map()];
  const confirmed = {...user,email_confirmed_at:'2026-09-18T10:00:00Z',user_metadata:{username:'Cross_device'}};
  const http = async (input,options = {}) => {
    const target = new URL(input); assert.equal(target.origin,url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({path:target.pathname,body});
    if (target.pathname === '/auth/v1/signup') {
      assert.equal(target.searchParams.get('redirect_to'),'https://taktikstudyo.com/auth-callback.html');
      return Response.json({...user,user_metadata:body.data,identities:[]});
    }
    if (target.pathname === '/auth/v1/verify') {
      assert.equal(body.token_hash,'fake-cross-device-token'); assert.equal(body.type,'email');
      assert.equal('code_verifier' in body,false);
      return Response.json({access_token:jwt,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,user:confirmed});
    }
    if (target.pathname === '/auth/v1/user') return Response.json(confirmed);
    if (target.pathname === '/rest/v1/profiles') {
      assert.equal(target.searchParams.get('select'),'id,username,display_name,created_at,updated_at');
      assert.equal(target.searchParams.get('id'),'eq.'+id);
      return Response.json([{id,username:'Cross_device'}]);
    }
    throw Error('Unexpected fake request');
  };
  const clients = stores.map(store => createClient(url,key,{global:{fetch:http},auth:{persistSession:true,autoRefreshToken:false,
    detectSessionInUrl:false,storage:{getItem:k => store.get(k) ?? null,setItem:(k,v) => store.set(k,v),removeItem:k => store.delete(k)}}}));
  const controllers = clients.map(createAuthSession);
  const apis = clients.map((client,i) => createAuthPageApi({client,auth:controllers[i],origin:'https://taktikstudyo.com'}));
  try {
    await Promise.all(apis.map(api => api.initialize()));
    assert.deepEqual(await apis[0].signUp({email:user.email,password:'twelve chars pass',username:'Cross_device',termsAccepted:true}),{ok:true,status:'confirmation_pending'});
    assert.equal(controllers[0].getCurrentUser(),null); assert.equal(stores[1].size,0);
    assert.equal(calls.some(call => call.path.endsWith('/verify')),false);
    assert.deepEqual(await apis[1].verifyEmail('fake-cross-device-token'),{ok:true,userId:id,profile:{ok:true,status:'ready'}});
    assert.equal(controllers[1].getCurrentUser().id,id);
    assert.equal(controllers[0].getCurrentUser(),null,'PC does not gain phone session');
    assert.doesNotMatch(JSON.stringify(stores.map(store => [...store])),/fake-cross-device-token|code-verifier/);
    assert.equal(calls.filter(call => call.path.endsWith('/verify')).length,1);
  } finally {
    controllers.forEach(auth => auth.dispose());
    await Promise.all(clients.map(client => client.auth.stopAutoRefresh()));
  }
});
