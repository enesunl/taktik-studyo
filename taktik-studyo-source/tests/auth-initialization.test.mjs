import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createAuthSession} from '../src/lib/auth-session.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {ProfileNode,profileDocument,deferred} from './helpers/profile-fixture.mjs';

const origin = 'https://abcdefghijklmnopqrst.supabase.co';
const user = {id:'11111111-1111-4111-8111-111111111111',email:'test@example.test',
  email_confirmed_at:'2026-09-18T00:00:00Z',user_metadata:{username:'Test_12'}};
const session = {user,access_token:'startup-test-access',refresh_token:'startup-test-refresh',
  expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer'};
const flush = () => new Promise(resolve => setImmediate(resolve));

function sdkFixture(initial = session, store = new Map()) {
  const key = 'startup-test-auth';
  if (initial) store.set(key,JSON.stringify(initial));
  const storage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const calls = [], events = [], requested = deferred(), response = deferred();
  const client = createClient(origin,'sb_publishable_local_test_only',{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:key,storage},
    global:{fetch:async (input,options={})=>{
      const url = new URL(input); assert.equal(url.origin,origin,'never contact a real Auth server');
      calls.push({path:url.pathname,method:options.method||'GET'});
      if (url.pathname === '/auth/v1/user') {requested.resolve(); await response.promise; return Response.json(user);}
      if (url.pathname === '/auth/v1/token') return Response.json(session);
      if (url.pathname === '/auth/v1/logout') {assert.equal(url.searchParams.get('scope'),'local'); return new Response(null,{status:204});}
      if (url.pathname === '/rest/v1/player_overrides') return Response.json([]);
      if (url.pathname === '/rest/v1/profiles') return Response.json([{id:user.id,username:'Test_12',display_name:'Test'}]);
      throw Error('Unexpected fake endpoint');
    }}
  });
  const subscription = client.auth.onAuthStateChange(event=>{events.push(event);}).data.subscription;
  const auth = createAuthSession(client);
  return {auth,client,storage,store,calls,events,requested,response,
    async dispose(){response.resolve();auth.dispose();subscription.unsubscribe();await client.auth.dispose();}};
}

function pageFixture(f,path) {
  const nodes = Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut','studioRoot'].map(id=>[id,new ProfileNode()]));
  nodes.protectedContent.hidden = nodes.protectedContent.inert = true;
  const profile = profileDocument({getElementById:id=>nodes[id]});
  const navigation = [], mounts = [], events = new ProfileNode();
  const window = Object.assign(events,{localStorage:f.storage,
    location:{pathname:path,search:'',replace:url=>navigation.push(url)},
    TAKTIK_APP:{mountStudio(){mounts.push('studio');return ()=>{};}},
    TAKTIK_COMPARISON:{mount(){mounts.push('comparison');return ()=>{};}}});
  return {nodes,profile,navigation,mounts,options:{auth:f.auth,client:f.client,window,
    document:profile.document,backend:{async loadCatalogue(){mounts.push('catalogue');}}}};
}

for (const persisted of [false,true]) test(`real SDK initialization settles with persisted session=${persisted}, including INITIAL_SESSION`,{timeout:3000},async()=>{
  const f = sdkFixture(persisted?session:null);
  try {
    const first = f.auth.initialize(); assert.equal(first,f.auth.initialize());
    const ready = await first;
    await flush();
    assert.equal(ready.ok,true);
    assert.equal(f.auth.getState().status,persisted?'signed_in':'signed_out');
    assert.ok(f.events.includes('INITIAL_SESSION'));
    assert.equal((await f.client.auth.getSession()).data.session?.user.id??null,persisted?user.id:null);
    assert.equal(f.calls.length,0,'restoration is only a candidate, not server validation');
    assert.equal((await f.auth.signOut()).ok,true);
    assert.equal(f.auth.getState().status,'signed_out');
  } finally {await f.dispose();}
});

test('real SDK login persists a session that a fresh controller restores and validates',{timeout:3000},async()=>{
  const login = sdkFixture(null); let reload;
  try {
    login.response.resolve();
    assert.equal((await login.auth.signInWithPassword({email:user.email,password:'test password twelve'})).ok,true);
    await login.dispose();
    reload = sdkFixture(null,login.store);
    assert.equal((await reload.auth.initialize()).ok,true);
    assert.equal(reload.auth.getCurrentUser().id,user.id);
    const validation = reload.auth.validateUser();
    await reload.requested.promise;
    assert.equal(reload.calls.filter(c=>c.path==='/auth/v1/user').length,1);
    reload.response.resolve();
    assert.equal((await validation).ok,true);
  } finally {await (reload||login).dispose();}
});

for (const path of ['/studyo.html','/profil.html','/karsilastirma.html','/studyo','/profil','/karsilastirma']) {
  test(`persisted-session protected bootstrap reaches server validation and ready: ${path}`,{timeout:3000},async()=>{
    const f = sdkFixture(), page = pageFixture(f,path);
    const mounted = startPage(page.options);
    try {
      assert.ok(mounted?.ready,'protected shell must start its guard, including hosting pretty URLs');
      await f.requested.promise;
      assert.equal(page.nodes.protectedContent.hidden,true);
      assert.equal(page.nodes.guardRetry.hidden,true);
      assert.equal(page.mounts.length,0);
      assert.equal(f.calls.filter(c=>c.path==='/auth/v1/user').length,1);
      f.response.resolve(); await mounted.ready; await flush();
      assert.equal(page.nodes.protectedContent.hidden,false);
      assert.equal(page.nodes.guardStatus.hidden,true);
      assert.equal(f.calls.filter(c=>c.path==='/auth/v1/user').length,1);
      if (path.startsWith('/profil')) {
        assert.equal(page.mounts.length,0);
        assert.equal(page.profile.mounts.length,1);
        assert.equal(page.profile.mounts[0].fields.form.hidden,false,'profile loads only after guard validation');
      } else assert.deepEqual(page.mounts,['catalogue',path.startsWith('/studyo')?'studio':'comparison']);
    } finally {mounted?.dispose();await f.dispose();}
  });
}

test('logout during pending server validation closes locally and never mounts stale content',{timeout:3000},async()=>{
  const f = sdkFixture(), page = pageFixture(f,'/studyo.html');
  const mounted = startPage(page.options);
  try {
    await f.requested.promise;
    page.nodes.signOut.emit('click');
    // Drain SDK/local notifications without a production timeout or arbitrary delay.
    for(let i=0;i<20&&!page.navigation.length;i++) await flush();
    assert.deepEqual(page.navigation,['/giris.html']);
    assert.equal(f.auth.getState().status,'signed_out');
    assert.equal(f.calls.filter(c=>c.path==='/auth/v1/logout').length,1);
    f.response.resolve();await mounted.ready;
    assert.equal(page.mounts.length,0);assert.equal(page.nodes.protectedContent.hidden,true);
  } finally {mounted.dispose();await f.dispose();}
});

test('pretty protected aliases map to canonical safe-next paths without broad path matching',()=>{
  for(const [alias,page] of [['/studyo','studio'],['/profil','profile'],['/karsilastirma','comparison']]) {
    assert.deepEqual(resolvePage({pathname:alias}),{kind:'protected',page,path:alias+'.html'});
    for(const path of [alias+'/extra',alias+'-evil',alias.toUpperCase(),'/%'+alias.slice(1),'/evil'+alias])
      assert.notEqual(resolvePage({pathname:path}).kind,'protected');
  }
});
