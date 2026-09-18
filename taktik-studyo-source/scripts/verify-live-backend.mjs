import assert from 'node:assert/strict';
import {SHARE_BYTES} from '../src/lib/validation.js';
process.loadEnvFile('.env');
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
const origin='https://taktik-studyo.unql9enes.chatgpt.site';
const request=(path,options={})=>{const headers=new Headers({apikey:key,origin,'Content-Type':'application/json'});for(const [k,v] of Object.entries(options.headers||{})){if(v===null)headers.delete(k);else headers.set(k,v);}return fetch(url+path,{...options,headers,signal:AbortSignal.timeout(25000)});};
const result=await request('/rest/v1/teams?select=id,name&limit=1');assert.equal(result.status,200);
const [team]=await result.json();
const players=await request('/rest/v1/players?select=id,name&limit=1');assert.equal(players.status,200);assert.equal((await players.json()).length,1);
const probes=[
 ['/rest/v1/teams','POST',{id:'integration-probe',name:'Integration probe',short_name:'QA',color_primary:'#123456',color_secondary:'#abcdef'}],
 ['/rest/v1/teams?id=eq.integration-probe','PATCH',{name:'Integration probe'}],
 ['/rest/v1/teams?id=eq.integration-probe','DELETE'],
 ['/rest/v1/players','POST',{id:'integration-probe',team_id:team.id,name:'Integration probe',position:'M'}],
 ['/rest/v1/players?id=eq.integration-probe','PATCH',{name:'Integration probe'}],
 ['/rest/v1/players?id=eq.integration-probe','DELETE'],
 ['/rest/v1/shared_lineups?select=public_id','GET'],
 ['/rest/v1/shared_lineups','POST',{team_name:'Integration probe',formation:'4-3-3',lineup_data:{},drawing_data:[]}],
 ['/rest/v1/shared_lineups?public_id=eq.00000000-0000-4000-8000-000000000000','PATCH',{team_name:'Integration probe'}],
 ['/rest/v1/shared_lineups?public_id=eq.00000000-0000-4000-8000-000000000000','DELETE'],
 ['/rest/v1/rpc/create_shared_lineup','POST',{payload:{},client_bucket:'a'.repeat(64)}]
];
const statuses=await Promise.all(probes.map(async([path,method,body])=>{const res=await request(path,{method,body:body?JSON.stringify(body):undefined});assert.ok([401,403].includes(res.status),`${method} ${path}: ${res.status}`);return {method,path,status:res.status};}));
console.log('PASS: live SELECT teams/players; denied anon INSERT/UPDATE/DELETE, shared reads and privileged RPC.',JSON.stringify(statuses));
const endpoint='/functions/v1/lineups';
const body={team_name:'Backend integration test',formation:'4-3-3',lineup_data:{team:{name:'Backend integration test',short:'QA',color:'#123456',color2:'#abcdef'},customized:false,players:Array.from({length:11},(_,id)=>({id,name:'QA '+id,x:50,y:10+7*id,number:id+1,role:id===0?'KL':'MO',renamed:false}))},drawing_data:[{tool:'pen',color:'#ffffff',width:4,points:[{x:.1,y:.2},{x:.3,y:.4}]}]};
const cases=[
 [400,JSON.stringify({...body,unexpected:true}),{}],
 [400,JSON.stringify({...body,formation:'99-1'}),{}],
 [400,JSON.stringify({...body,lineup_data:{...body.lineup_data,players:[]}}),{}],
 [413,' '.repeat(SHARE_BYTES+1),{}],
 [415,'{}',{'Content-Type':'text/plain'}],
 [403,JSON.stringify(body),{origin:'https://evil.test'}],
 [401,JSON.stringify(body),{apikey:'wrong'}],
 [401,JSON.stringify(body),{apikey:null}],
 [403,JSON.stringify(body),{'x-bot-token':'invalid-token'}],
 [403,JSON.stringify(body),{}]
];
for(const [expected,raw,headers] of cases){const res=await request(endpoint,{method:'POST',headers,body:raw});const text=await res.text();assert.equal(res.status,expected,`Expected ${expected}; ${text.slice(0,200)}`);}
const preflight=await request(endpoint,{method:'OPTIONS'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
const missing=await request(endpoint+'?id=00000000-0000-4000-8000-000000000000');assert.equal(missing.status,404);
console.log('PASS: live Edge malformed payload 400, large payload 413, Origin 403, missing/invalid key 401, missing/invalid bot token 403, unknown ID 404.');
console.log('Turnstile configuration ready:',preflight.headers.get('X-Sharing-Ready'));
console.log('NOT RUN: successful production save requires a real configured Turnstile widget and valid single-use token.');
