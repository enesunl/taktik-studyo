import test from 'node:test';
import assert from 'node:assert/strict';
import {createBotVerifier} from '../supabase/functions/lineups/turnstile.js';
import {createHandler} from '../supabase/functions/lineups/handler.js';
const origin='https://taktikstudyo.com';
test('Turnstile fails closed on absent key/token, bad action/hostname, denial and outage',async()=>{
 const req=token=>new Request(origin,{headers:token?{'x-bot-token':token}:{}});
 let calls=0;
 const response=()=>({ok:true,json:async()=>({success:true,action:'share_lineup',hostname:new URL(origin).hostname})});
 const verify=createBotVerifier({secret:'unit-test-fixture',origins:[origin],fetcher:async(_url,options)=>{calls++;assert.equal(options.body.get('response'),'fixture-token');return response();}});
 assert.equal(await verify(req()),false);assert.equal(calls,0);
 assert.equal(await createBotVerifier({secret:null,origins:[origin],fetcher:()=>{throw Error('must not fetch')}})(req('fixture-token')),false);
 assert.equal(await verify(req('fixture-token')),true);assert.equal(calls,1);
 for(const data of [{success:false},{success:'true',action:'share_lineup',hostname:new URL(origin).hostname},{success:true,action:'wrong',hostname:new URL(origin).hostname},
  ...['evil.test','taktikstudyo.com.evil.example','www.taktikstudyo.com','taktik-studyo.unql9enes.chatgpt.site'].map(hostname=>({success:true,action:'share_lineup',hostname}))]){
  const bad=createBotVerifier({secret:'unit-test-fixture',origins:[origin],fetcher:async()=>({ok:true,json:async()=>data})});assert.equal(await bad(req('fixture-token')),false);
 }
 const unavailable=createBotVerifier({secret:'unit-test-fixture',origins:[origin],fetcher:async()=>{throw Error('offline')}});assert.equal(await unavailable(req('fixture-token')),false);
});
test('Edge factory has no default verification bypass and reports only readiness',async()=>{
 const handler=createHandler({client:{rpc(){throw Error('must not write')}},origins:[origin],publicKey:'public-test',rateSalt:'test-only'});
 const preflight=await handler(new Request(origin,{method:'OPTIONS',headers:{origin}}));assert.equal(preflight.headers.get('X-Sharing-Ready'),'false');
 const payload={team_name:'Test',formation:'4-3-3',lineup_data:{team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},customized:false,players:Array.from({length:11},(_,id)=>({id,x:50,y:50,role:'MO',name:'Test',number:id+1,renamed:false}))},drawing_data:[]};
 const result=await handler(new Request(origin,{method:'POST',headers:{origin,apikey:'public-test','content-type':'application/json'},body:JSON.stringify(payload)}));assert.equal(result.status,401);
 // ACCOUNT1: a verified user still cannot write without the default-deny bot verification.
 const verified=createHandler({client:{rpc(){throw Error('must not write')}},origins:[origin],publicKey:'public-test',rateSalt:'test-only',authenticate:async()=>({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-10-14T00:00:00Z'})});
 const denied=await verified(new Request(origin,{method:'POST',headers:{origin,apikey:'public-test','content-type':'application/json',authorization:'Bearer jwt'},body:JSON.stringify(payload)}));assert.equal(denied.status,403);
});
