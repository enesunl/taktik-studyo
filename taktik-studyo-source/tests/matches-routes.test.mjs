import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePage} from '../src/lib/page-routes.js';
import {loginUrl,safeInternalRedirect} from '../src/lib/auth-redirects.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {matchesDocument,matchesWindow,match,tick,deferred} from './helpers/matches-fixture.mjs';

for(const path of ['/maclar','/maclar.html']) {
  test(path+' uses the shared protected bootstrap; no drafts/catalogue; signed-in mount',async()=>{
    assert.deepEqual(resolvePage(new URL(path,'https://example.test')),{kind:'protected',page:'matches',path:'/maclar.html'});
    assert.equal(safeInternalRedirect('/maclar.html'),'/maclar.html');
    const dom=matchesDocument(),win=matchesWindow(path);let initialized=0,validated=0,requests=0;
    // This suite exercises production bootstrap; local transport has separate tests.
    win.window.location=new URL(path,'https://taktikstudyo.com');
    const validation=deferred();
    const auth={initialize:async()=>{initialized++;return{ok:true};},getState:()=>({status:'signed_in',user:{id:'a'}}),subscribe:()=>()=>{},validateUser:()=>{validated++;return validation.promise;}};
    const page=startPage({auth,...dom,window:win.window,backend:{loadCatalogue(){throw Error('No catalogue');}},client:{functions:{invoke:async()=>{requests++;return{data:{season:'2026-2027',matches:[match()]}};}}}});
    await tick();assert.equal(initialized,1);assert.equal(validated,1);assert.equal(requests,0);
    validation.resolve({ok:true,user:{id:'a'}});await page.ready;await tick();
    assert.equal(requests,1);assert.equal(dom.nodes.protectedContent.hidden,false);assert.ok(dom.nodes.matchesContent.children.length);
    page.dispose();assert.equal(dom.nodes.matchesContent.children.length,0);
  });
  test(path+' anonymous and recovery redirect safely without requesting matches',async()=>{
    for(const state of [{status:'signed_out',user:null},{status:'password_recovery',user:{id:'a'}}]) {
      const dom=matchesDocument(),win=matchesWindow(path);let initializes=0;
      const auth={initialize:async()=>{initializes++;return{ok:true};},getState:()=>state,subscribe:()=>()=>{},validateUser(){throw Error('No validation');}};
      const page=startPage({auth,...dom,window:win.window,client:{functions:{invoke(){throw Error('No request');}}}});await page.ready;
      assert.equal(initializes,1);assert.deepEqual(win.navigations,[loginUrl('/maclar.html')]);assert.equal(dom.nodes.protectedContent.hidden,true);page.dispose();
    }
  });
}
