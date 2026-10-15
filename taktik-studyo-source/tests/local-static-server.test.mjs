import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {resolvePage} from '../src/lib/page-routes.js';

// PROD1.5 flake fix: the child picks and holds its own port (no parent probe/release race) and the
// readiness wait shares the test budget. Under a fully parallel suite, child Node startup plus the
// esbuild bundle measured up to ~5 s, which exceeded the former fixed 5 s readiness cap.
test('local HTTP server serves every protected alias, including Çalışmalarım, without Auth or provider requests', {timeout:60000}, async()=>{
  const server=spawn(process.execPath,[fileURLToPath(new URL('./helpers/local-server-process.cjs',import.meta.url))],{stdio:['ignore','pipe','pipe']});
  const exited=once(server,'exit');let startupTimer,port,stderr='';
  try{
    server.stderr.on('data',chunk=>{stderr+=chunk;});
    await new Promise((resolve,reject)=>{
      startupTimer=setTimeout(()=>reject(Error('Local server startup timed out')),45000);
      server.once('error',reject);server.once('exit',()=>reject(Error('Local server exited before ready: '+stderr.trim())));
      let out='';server.stdout.on('data',chunk=>{out+=chunk;const m=out.match(/fixture ready on ([0-9]+)/);if(m){port=Number(m[1]);resolve();}});
    });
    const origin='http://127.0.0.1:'+port;
    for(const asset of ['/backend.js','/%62ackend.js','/BACKEND.JS','/backend.js?cache=test']){
      const response=await fetch(origin+asset);assert.equal(response.status,200);
      const js=await response.text();assert(js.includes('http://127.0.0.1:54321'));
      assert(!js.includes('zwhoailuklwtxaaawfaq'));
    }
    for(const asset of ['/backend.js.','/backend.js%20','/backend.js::$DATA'])assert.equal((await fetch(origin+asset)).status,403);
    for(const path of ['/ilk-11lerim','/haftanin-ilk-11i','/hos-geldin','/studyo','/profil','/maclar','/mac','/mac-studyosu','/calismalarim']){
      assert.equal(resolvePage(new URL(path,origin)).kind,'protected');
      const alias=await fetch(origin+path+'?test=route'),html=await fetch(origin+path+'.html');
      assert.equal(alias.status,200,path);assert.equal(html.status,200,path+'.html');
      assert.match(alias.headers.get('content-type'),/text\/html/);
      const body=await alias.text();assert.equal(body,await html.text());
      assert.match(body,/id="protectedContent"[^>]*hidden inert/);
      if(path==='/calismalarim')assert.match(body,/id="studioProjectsContent"/);
    }
    for(const path of ['/karsilastirma','/karsilastirma.html']){
      const response=await fetch(origin+path);assert.equal(response.status,200);
      assert.match(await response.text(),/http-equiv="refresh" content="0;url=\/studyo\.html"/);
    }
    const head=await fetch(origin+'/calismalarim',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await fetch(origin+'/not-a-page')).status,404);
    assert.equal((await fetch(origin+'/calismalarim',{method:'POST'})).status,405);
  }finally{clearTimeout(startupTimer);server.kill();await exited;}
});
