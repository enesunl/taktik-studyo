import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {get} from 'node:http';
// PROD1.5: same race-free startup as local-static-server.test.mjs (the child picks and holds its
// own port and reports it; readiness shares the test budget instead of a fixed 5 s cap).
test('D3 explicit local switch serves canonical config, removes legacy scripts/attribution, no production asset rewrite',{timeout:60000},async()=>{
 const server=spawn(process.execPath,[fileURLToPath(new URL('./helpers/local-server-process.cjs',import.meta.url))],{env:{...process.env,CATALOGUE_SOURCE:'canonical'},stdio:['ignore','pipe','pipe']});
 const exited=once(server,'exit');let timer,port;
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Canonical local startup timed out')),45000);server.once('error',reject);server.once('exit',()=>reject(Error('Canonical local exited early')));let out='';server.stdout.on('data',s=>{out+=s;const m=out.match(/fixture ready on ([0-9]+)/);if(m){port=Number(m[1]);resolve();}});});
  const origin='http://127.0.0.1:'+port;
  for(const path of ['/studyo','/mac-studyosu','/mac']){
   const html=await (await fetch(origin+path)).text();assert.match(html,/\/__local\/catalogue-config.js/);assert.doesNotMatch(html,/<script src="rosters.js"|tff\.org|Takım listesi:/);assert.match(html,/hidden inert/);
  }
  const config=await(await fetch(origin+'/__local/catalogue-config.js')).text();assert.equal(config,'window.TAKTIK_CATALOGUE_CONFIG=Object.freeze({source:"canonical"});');
  const status=await new Promise((resolve,reject)=>get(origin+'/__local/catalogue-config.js',{headers:{host:'attacker.test:'+port}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
  assert.equal(status,403);
 }finally{clearTimeout(timer);server.kill();await exited;}
});
