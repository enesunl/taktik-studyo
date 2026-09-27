import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {get} from 'node:http';
test('D3 explicit local switch serves canonical config, removes legacy scripts/attribution, no production asset rewrite',{timeout:15000},async()=>{
 const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn(process.execPath,[fileURLToPath(new URL('../scripts/serve-local.cjs',import.meta.url)),String(port)],{env:{...process.env,CATALOGUE_SOURCE:'canonical'},stdio:['ignore','pipe','pipe']});
 const exited=once(server,'exit');let timer;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Canonical local startup timed out')),5000);server.once('error',reject);server.once('exit',()=>reject(Error('Canonical local exited early')));server.stdout.on('data',s=>{if(s.toString().includes('Taktik Studyo:'))resolve();});});
  const origin='http://127.0.0.1:'+port;
  for(const path of ['/studyo','/karsilastirma','/mac-studyosu','/mac']){
   const html=await (await fetch(origin+path)).text();assert.match(html,/\/__local\/catalogue-config.js/);assert.doesNotMatch(html,/<script src="rosters.js"|tff\.org|Takım listesi:/);assert.match(html,/hidden inert/);
  }
  const config=await(await fetch(origin+'/__local/catalogue-config.js')).text();assert.equal(config,'window.TAKTIK_CATALOGUE_CONFIG=Object.freeze({source:"canonical"});');
  const status=await new Promise((resolve,reject)=>get(origin+'/__local/catalogue-config.js',{headers:{host:'attacker.test:'+port}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
  assert.equal(status,404);
 }finally{clearTimeout(timer);server.kill();await exited;}
});
