import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {build} from 'esbuild';
import {createProtectedPage} from '../src/lib/protected-page.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {loginDestination,loginUrl} from '../src/lib/auth-redirects.js';
import {mountLanding} from '../src/lib/landing-ui.js';
import {chooseLegacyDrafts} from '../src/lib/legacy-import-ui.js';
import {createUserDraftScope,userDraftKey,legacyDraftKeys} from '../src/lib/draft-scope.js';
import {writeDraft,readDraft} from '../src/lib/drafts.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {mountAuthPage} from '../src/lib/auth-ui.js';
import {fixture,pageFixture,user,session} from './helpers/auth-fixture.mjs';
import {profileDocument} from './helpers/profile-fixture.mjs';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,0));
const state=id=>({status:id?'signed_in':'signed_out',user:id?{id}:null});
const validDraft={team:{name:'Legacy',short:'LEG',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,
  players:Array.from({length:11},(_,id)=>({id,name:'Player '+id,number:id+1,x:50,y:50,role:'MO',renamed:false})),drawings:[]};
class Node {
  constructor(){this.children=[];this.listeners=new Map();this.hidden=false;this.inert=false;this.textContent='';}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.listeners.set(k,fn);}
  removeEventListener(k,fn){if(this.listeners.get(k)===fn)this.listeners.delete(k);}
  async emit(k,event={}){return this.listeners.get(k)?.({preventDefault(){},...event});}
}
function memory(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
function authFake(initial=state(A)){
  let value=initial;const subscribers=new Set(),invalidators=new Set();
  const f={validation:async()=>({ok:true,user:value.user}),initialized:{ok:true},validations:[],logout:{ok:true}};
  f.auth={getState:()=>value,getCurrentUser:()=>value.user,initialize:async()=>f.initialized,
    validateUser:()=>{f.validations.push(value.user?.id);return f.validation();},
    subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
    onInvalidate(fn){invalidators.add(fn);return ()=>invalidators.delete(fn);},
    async signOut(){if(f.logout.ok)f.emit(state(null));return f.logout;}};
  f.emit=next=>{value=next;for(const fn of invalidators)fn();for(const fn of subscribers)fn();};
  return f;
}
function guarded(initial){
  const f=authFake(initial),storage=memory(),mounts=[],shows=[],navigations=[];
  const options={auth:f.auth,storage,path:'/studyo.html',show:value=>shows.push(value),navigate:url=>navigations.push(url),
    mount(scope){const record={scope,disposed:false};mounts.push(record);return ()=>{record.disposed=true;};}};
  return {...f,storage,mounts,shows,navigations,options,guard:createProtectedPage(options)};
}

test('route resolution preserves root share precedence, exact v4 rejection and legacy support',()=>{
  const route=url=>resolvePage(new URL(url,'https://taktikstudyo.com'));
  assert.equal(route('/').kind,'landing'); assert.equal(route('/?utm=test').kind,'landing');
  assert.deepEqual(route('/?lineup='+A),{kind:'shared',id:A});
  assert.deepEqual(route('/lineup/'+B+'?lineup='+A),{kind:'shared',id:A});
  for(const url of ['/?lineup=','/?lineup=abc','/?lineup='+A+'&lineup='+A,'/lineup/not-a-uuid','/lineup/']) assert.equal(route(url).kind,'share_error');
  for(const path of ['/studyo.html','/karsilastirma.html','/profil.html'])assert.equal(route(path).kind,'protected');
});

test('safe next accepts exact paths only; duplicates and encoded external tricks default to studio',async()=>{
  for(const path of ['/studyo.html','/karsilastirma.html','/profil.html']){
    assert.equal(loginDestination('?next='+encodeURIComponent(path)),path);
    assert.equal(new URL(loginUrl(path),'https://example.test').searchParams.get('next'),path);
  }
  for(const next of ['https://evil.example','//evil.example','/\\evil','javascript:alert(1)','%2F%2Fevil.example','/unknown','/profil.html?x=1','/profil.html#x'])
    assert.equal(loginDestination('?next='+encodeURIComponent(next)),'/studyo.html');
  assert.equal(loginDestination('?next=/profil.html&next=/profil.html'),'/studyo.html');
  for(const profile of ['ready','profile_incomplete','username_conflict','profile_error']){
    const f=pageFixture('login','?next=/profil.html');f.api.signIn=async()=>({ok:true,profile:{status:profile}});
    const page=mountAuthPage(f.options);await page.ready;await f.fields.authForm.emit('submit');
    assert.deepEqual(f.calls,[{kind:'navigate',url:'/profil.html'}]);page.dispose();
  }
  for(const pageName of ['register','callback']){
    const f=pageFixture(pageName),page=mountAuthPage(f.options);await page.ready;
    await (pageName==='callback'?f.fields.authSubmit:f.fields.authForm).emit(pageName==='callback'?'click':'submit');
    assert.deepEqual(f.calls.filter(c=>c.kind==='replace'),[{kind:'replace',url:pageName==='callback'?'/studyo.html':'/giris.html?reason=confirmation_pending'}]);page.dispose();
  }
});

test('logged-out and password recovery never mount; safe login redirect',async()=>{
  for(const initial of [state(null),{status:'password_recovery',user:{id:A}}]){
    const f=guarded(initial);await f.guard.start();assert.equal(f.mounts.length,0);assert.equal(f.validations.length,0);
    assert.equal(f.navigations[0],loginUrl('/studyo.html'));f.guard.dispose();
  }
});

test('local restore alone never mounts; server validation same id is mandatory',async()=>{
  const f=guarded(),wait=deferred();f.options.auth.validateUser=()=>wait.promise;
  const pending=f.guard.start();await tick();assert.equal(f.mounts.length,0);assert.equal(f.shows.at(-1),'pending');
  wait.resolve({ok:true,user:{id:A}});await pending;assert.equal(f.mounts.length,1);assert.equal(f.mounts[0].scope.context('main').key,userDraftKey(A,'main'));f.guard.dispose();
});

test('validation mismatch and transient errors fail closed; invalid sessions redirect; retry works',async()=>{
  for(const result of [{ok:true,user:{id:B}},{ok:false,error:{code:'user_validation_failed'}},{ok:false,error:{code:'unauthenticated'}}]){
    const f=guarded();f.options.auth.validateUser=async()=>{if(result.error?.code==='unauthenticated')f.emit(state(null));return result;};await f.guard.start();assert.equal(f.mounts.length,0);
    assert.equal(f.navigations.length,result.error?.code==='unauthenticated'?1:0);
    if(!f.navigations.length){assert.equal(f.shows.at(-1),'error');f.options.auth.validateUser=async()=>({ok:true,user:{id:A}});await f.guard.retry();assert.equal(f.mounts.length,1);}
    f.guard.dispose();
  }
});

test('account switch disposes A immediately before B validation; stale results ignored',async()=>{
  const f=guarded();await f.guard.start();const a=f.mounts[0],wait=deferred();
  f.options.auth.validateUser=()=>{assert.equal(a.disposed,true);return wait.promise;};
  f.emit(state(B));assert.equal(a.disposed,true);assert.equal(a.scope.isActive(),false);assert.equal(f.mounts.length,1);
  f.emit(state(null));wait.resolve({ok:true,user:{id:B}});await tick();assert.equal(f.mounts.length,1);f.guard.dispose();
  const g=guarded(),first=deferred();g.options.auth.validateUser=()=>first.promise;const start=g.guard.start();await tick();
  g.options.auth.validateUser=async()=>({ok:true,user:{id:B}});g.emit(state(B));await tick();
  first.resolve({ok:true,user:{id:A}});await start;assert.equal(g.mounts.length,1);assert.equal(g.mounts[0].scope.context('main').key,userDraftKey(B,'main'));g.guard.dispose();
});

test('real Auth event invalidation hides/disposes synchronously; getUser error classification is controlled',async()=>{
  const f=fixture({initial:{user:{id:A}}}),shows=[];let disposed=false;
  const guard=createProtectedPage({auth:f.auth,storage:memory(),path:'/studyo.html',show:s=>shows.push(s),navigate(){},mount:()=>()=>{disposed=true;}});
  await guard.start();assert.equal(disposed,false);
  f.emit('SIGNED_IN',{user:{id:B}});assert.equal(disposed,true);assert.equal(shows.at(-1),'pending');
  guard.dispose();
  f.userResult={error:{status:401,message:'private'},data:{user:null}};assert.equal((await f.auth.validateUser()).error.code,'user_validation_failed');
  f.userResult={error:{status:503,message:'private'},data:{user:null}};assert.deepEqual(await f.auth.validateUser(),{ok:false,error:{code:'user_validation_failed'}});f.auth.dispose();
});

test('signout starts with teardown, preserves drafts; cleanup failure stays closed',async()=>{
  for(const ok of [true,false]){
    const f=guarded();await f.guard.start();f.storage.setItem(userDraftKey(A,'main'),'keep');f.storage.setItem(legacyDraftKeys.main,'legacy');
    const wait=deferred();f.options.auth.signOut=()=>wait.promise;
    const pending=f.guard.signOut();assert.equal(f.mounts[0].disposed,true);assert.equal(f.shows.at(-1),'pending');
    wait.resolve({ok});await pending;assert.equal(f.storage.data.size,2);
    assert.equal(f.navigations.at(-1),ok?'/giris.html':undefined);
    if(!ok){
      assert.equal(f.shows.at(-1),'logout_error');f.emit(state(A));await tick();
      assert.equal(f.mounts.length,1,'late Auth notifications cannot reopen after failed signout');
      await f.guard.retry();assert.equal(f.mounts.length,2,'explicit retry validates before reopening');
    }
    f.guard.dispose();
  }
});

test('legacy import prompts only for valid empty slots, requires click, preserves source and restores before mount',async()=>{
  for(const mode of ['accept','decline','existing','invalid','race']){
    const storage=memory(),scope=createUserDraftScope({userId:A,storage}),container=new Node(),document={createElement:()=>new Node()};
    writeDraft(storage,legacyDraftKeys.main,validDraft);const source=storage.getItem(legacyDraftKeys.main);
    if(mode==='invalid')storage.setItem(legacyDraftKeys.main,'bad');
    if(mode==='existing')writeDraft(storage,userDraftKey(A,'main'),validDraft);
    let mounted=false;const pending=chooseLegacyDrafts({scope,slots:['main'],container,document}).then(()=>{mounted=true;return scope.context('main').read();});
    if(['existing','invalid'].includes(mode)){assert.equal(container.children.length,0);await pending;scope.dispose();continue;}
    assert.equal(container.children.length,1);assert.equal(storage.getItem(userDraftKey(A,'main')),null);assert.equal(mounted,false);
    if(mode==='race')writeDraft(storage,userDraftKey(A,'main'),{...validDraft,formation:'4-4-2'});
    await container.children[0].children[mode==='decline'?2:1].emit('click');const restored=await pending;
    assert.equal(storage.getItem(legacyDraftKeys.main),source);assert.equal(container.children.length,0);
    if(mode==='decline')assert.equal(restored,null);else assert.equal(restored.formation,mode==='race'?'4-4-2':'4-3-3');scope.dispose();
  }
});

test('comparison legacy decisions are per slot; account disposal dismisses pending import',async()=>{
  const storage=memory(),scope=createUserDraftScope({userId:A,storage}),container=new Node(),document={createElement:()=>new Node()};
  for(const slot of ['left','right'])writeDraft(storage,legacyDraftKeys[slot],validDraft);
  const pending=chooseLegacyDrafts({scope,slots:['left','right'],container,document});
  await container.children[0].children[1].emit('click');await tick();
  assert.ok(scope.context('left').read());assert.equal(scope.context('right').read(),null);
  scope.dispose();await pending;assert.equal(container.children.length,0);assert.equal(storage.getItem(userDraftKey(A,'right')),null);
});

test('landing stays public through Auth failure/recovery; nav and local logout update',async()=>{
  const f=authFake(state(null)),out=[new Node(),new Node()],inside=[new Node(),new Node()],button=new Node(),message=new Node(),events=new Node();
  const document={querySelectorAll:q=>q==='[data-logged-out]'?out:inside,getElementById:id=>id==='signOut'?button:message};
  const page=mountLanding({auth:f.auth,document,eventTarget:events});await page.ready;
  assert.equal(out[0].hidden,false);assert.equal(inside[0].hidden,true);
  f.emit(state(A));assert.equal(inside[0].hidden,false);assert.equal(out[0].hidden,true);
  f.emit({status:'password_recovery',user:{id:A}});assert.equal(inside[0].hidden,true);
  f.emit(state(A));await button.emit('click');assert.equal(inside[0].hidden,true);assert.equal(out[0].hidden,false);
  page.dispose();
  f.auth.initialize=async()=>{throw Error('offline');};const failed=mountLanding({auth:f.auth,document,eventTarget:events});await failed.ready;assert.equal(out[0].hidden,false);failed.dispose();
});

function bootFixture(path,initial=state(A)){
  const f=authFake(initial),nodes=Object.fromEntries(['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut','legacyImport','studioRoot','landing'].map(id=>[id,new Node()]));
  const storage=memory(),events=new Node(),calls=[];
  const window=Object.assign(events,{location:{pathname:path,search:'',replace:url=>calls.push(['navigate',url])},localStorage:storage,
    TAKTIK_APP:{mountStudio(root,scope){calls.push(['studio',scope.context('main').key,scope.context('main').read()]);return ()=>calls.push(['dispose']);},mountShared:r=>calls.push(['shared',r])},
    TAKTIK_COMPARISON:{mount:scope=>{calls.push(['comparison',scope.context('left').key,scope.context('right').key]);return ()=>calls.push(['dispose']);}}});
  const options={auth:f.auth,window,document:{getElementById:id=>nodes[id],createElement:()=>new Node()},backend:{loadCatalogue:async()=>calls.push(['catalogue'])}};
  options.document=profileDocument(options.document).document;
  return {...f,nodes,storage,calls,options};
}

test('studio/comparison open directly with own drafts, never prompting, importing or deleting legacy data',async()=>{
  for(const path of ['/studyo.html','/karsilastirma.html'])for(const existing of [false,true]){
    const f=bootFixture(path);
    for(const slot of ['main','left','right']){
      writeDraft(f.storage,legacyDraftKeys[slot],validDraft);
      if(existing)writeDraft(f.storage,userDraftKey(A,slot),{...validDraft,formation:'4-4-2'});
    }
    const before=new Map(f.storage.data),page=startPage(f.options);
    await page.ready;assert.equal(f.nodes.protectedContent.hidden,false);assert.equal(f.calls[0][0],'catalogue');
    assert.equal(f.nodes.legacyImport.children.length,0);assert.deepEqual(f.storage.data,before);
    if(path==='/studyo.html'){
      assert.equal(f.calls[1][1],userDraftKey(A,'main'));
      assert.equal(f.calls[1][2]?.formation??null,existing?'4-4-2':null);
    }
    else assert.deepEqual(f.calls[1],['comparison',userDraftKey(A,'left'),userDraftKey(A,'right')]);
    f.emit(state(B));assert.equal(f.nodes.protectedContent.hidden,true);await tick();
    assert.ok(f.calls.some(c=>c[1]===userDraftKey(B,path==='/studyo.html'?'main':'left')));
    assert.equal(f.nodes.legacyImport.children.length,0);assert.deepEqual(f.storage.data,before);page.dispose();
  }
});

test('profile route is guarded and never fetches catalogue even when profile client is unavailable',async()=>{
  for(const initial of [state(null),state(A)]){
    const f=bootFixture('/profil.html',initial),page=startPage(f.options);await page.ready;
    assert.equal(f.calls.filter(c=>c[0]==='catalogue').length,0);
    assert.equal(f.nodes.protectedContent.hidden,!initial.user);assert.equal(f.validations.length,initial.user?1:0);page.dispose();
  }
});

test('legacy data never creates a startup prompt; only server-confirmed users can open studio/comparison',async()=>{
  for(const path of ['/studyo.html','/karsilastirma.html'])for(const confirmed of [false,true]){
    const f=bootFixture(path),real=fixture({initial:session});f.options.auth=real.auth;
    real.userResult={data:{user:{...user,email_confirmed_at:confirmed?user.email_confirmed_at:undefined}}};
    real.client.auth.signOut=async options=>{assert.deepEqual(options,{scope:'local'});real.emit('SIGNED_OUT',null);return {error:null};};
    const slot=path==='/studyo.html'?'main':'left';writeDraft(f.storage,legacyDraftKeys[slot],validDraft);
    const source=f.storage.getItem(legacyDraftKeys[slot]),page=startPage(f.options);
    await page.ready;
    assert.equal(f.nodes.legacyImport.children.length,0);
    assert.equal(f.calls.some(c=>c[0]==='catalogue'),confirmed);
    assert.equal(f.calls.some(c=>c[0]===(slot==='main'?'studio':'comparison')),confirmed);
    assert.equal(f.storage.getItem(legacyDraftKeys[slot]),source);page.dispose();real.auth.dispose();
  }
});

test('public shared bootstrap ignores all Auth APIs for logged-out and logged-in users',()=>{
  for(const initial of [state(null),state(A)]){
    const f=bootFixture('/',initial);f.options.window.location.search='?lineup='+B;
    f.options.auth=new Proxy({}, {get(){throw Error('share must never consult Auth');}});
    startPage(f.options);assert.deepEqual(f.calls,[['shared',{kind:'shared',id:B}]]);
  }
});

test('static shells hide protected contents and deterministic defer order leaves engine definitions idle',()=>{
  for(const file of ['studyo','karsilastirma','profil']){
    const html=readFileSync(new URL('../dist/'+file+'.html',import.meta.url),'utf8');
    assert.match(html,/id="protectedContent"[^>]*hidden inert/);assert.match(html,/id="guardMessage" role="status"/);
    assert.match(html,/<button id="signOut" type="button">/);
    if(file!=='profil')assert.ok(html.indexOf('src="backend.js" defer')<html.indexOf('src="app.js" defer'));
  }
  const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/startMainBoard\(\);/);
  const redirects=readFileSync(new URL('../dist/_redirects',import.meta.url),'utf8');assert.equal(redirects.trim(),'/lineup/* /index.html 200');
});

test('actual backend bundle defers routes to DOMContentLoaded; landing/profile avoid catalogue; bfcache revalidates',async()=>{
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/backend-entry.js',import.meta.url))],bundle:true,write:false,format:'iife',target:'es2022',
    define:{__SUPABASE_URL__:'""',__SUPABASE_PUBLISHABLE_KEY__:'""',__TURNSTILE_SITE_KEY__:'""',__AUTH_TURNSTILE_SITE_KEY__:'""'},
    plugins:[{name:'test-auth',setup(b){b.onLoad({filter:/[\\/]lib[\\/]auth\.js$/},()=>({contents:'export const auth=globalThis.testAuth;'}));}}]});
  for(const path of ['/','/studyo.html','/karsilastirma.html','/profil.html','/?lineup='+A,'/?lineup=invalid']){
    const url=new URL(path,'https://taktikstudyo.com'),f=bootFixture(url.pathname),events=new Node();
    f.options.window.location.search=url.search;
    let initializes=0,catalogues=0;
    f.options.auth.initialize=async()=>{initializes++;return{ok:true};};
    const document=Object.assign(events,f.options.document,{body:{dataset:{}},readyState:'interactive',querySelectorAll:()=>[]});
    const context=vm.createContext({window:f.options.window,document,testAuth:f.options.auth,URL,URLSearchParams,TextEncoder,AbortSignal,setTimeout,
      fetch(){throw Error('no network expected');}});
    vm.runInContext(built.outputFiles[0].text,context);
    const backend=f.options.window.TAKTIK_BACKEND,load=backend.loadCatalogue;
    backend.loadCatalogue=()=>{catalogues++;return load();};
    assert.equal(initializes,0);assert.equal(f.calls.length,0);assert.equal(catalogues,0);
    await events.emit('DOMContentLoaded');await tick();
    if(path.includes('lineup')){assert.equal(initializes,0);assert.equal(f.calls[0][0],'shared');assert.equal(catalogues,0);}
    else if(path==='/'){assert.equal(f.nodes.landing.hidden,false);assert.equal(initializes,1);assert.equal(catalogues,0);}
    else {
      assert.equal(f.validations.length,1);assert.equal(f.nodes.protectedContent.hidden,false);
      assert.equal(catalogues,path==='/profil.html'?0:1);
      await f.options.window.emit('pagehide');assert.equal(f.nodes.protectedContent.hidden,true);
      await f.options.window.emit('pageshow',{persisted:true});await tick();
      assert.equal(f.validations.length,2);assert.equal(f.nodes.protectedContent.hidden,false);
    }
    await f.options.window.emit('pagehide');
  }
});
