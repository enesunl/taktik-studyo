import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLiveBackend} from '../scripts/verify-live-backend.mjs';

const url='https://abcdefghijklmnopqrst.supabase.co',key='sb_publishable_live_test_only';
// Simulated production. `release` selects the post-release contract; `token` is the only valid JWT.
// `sec1` removes the anonymous legacy catalogue read (signed-in reads stay).
function fakeProduction({release=true,sec1=release,token='valid-jwt'}={}){
  const calls=[];
  const fetchImpl=async(input,init={})=>{
    const u=new URL(input),method=init.method||'GET',h=new Headers(init.headers),origin=h.get('origin'),auth=h.get('authorization');
    calls.push({path:u.pathname+u.search,method,body:init.body});
    const json=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers});
    const p=u.pathname;
    if(p==='/rest/v1/teams'||p==='/rest/v1/players')return method!=='GET'?json(401,{}):auth==='Bearer '+token||!sec1?json(200,[{id:'x'}]):json(401,{code:'42501'});
    // After the release the BSD catalogue exists and is signed-in only (SEC1.1).
    if(p==='/rest/v1/catalogue_teams'||p==='/rest/v1/catalogue_players'){
      if(!release)return json(404,{code:'PGRST205'});
      if(method!=='GET')return json(401,{});
      return auth==='Bearer '+token?json(200,Array.from({length:18},(_,i)=>({id:'t'+i}))):json(401,{code:'42501'});
    }
    if(p==='/rest/v1/shared_lineups'||p==='/rest/v1/profiles')return json(401,{});
    if(p==='/rest/v1/rpc/create_shared_lineup'){const b=JSON.parse(init.body);return 'owner' in b?json(release?401:404,{}):json(release?404:401,{});}
    if(p==='/functions/v1/lineups'){
      const cors={'access-control-allow-origin':origin,'access-control-allow-headers':release?'apikey, authorization, content-type, x-bot-token':'apikey, content-type, x-bot-token','x-sharing-ready':'true'};
      if(origin!=='https://taktikstudyo.com')return json(403,{});
      if(method==='OPTIONS')return new Response(null,{status:204,headers:cors});
      if(h.get('apikey')!==key)return json(401,{});
      if(method==='GET'){const id=u.searchParams.get('id');return /^[0-9a-f-]{36}$/.test(id)?json(404,{}):json(400,{});}
      if(release&&auth!=='Bearer '+token)return json(401,{});
      const raw=init.body||'';
      if(!/^application\/json/.test(h.get('content-type')||''))return json(415,{});
      if(raw.length>131072)return json(413,{});
      let body;try{body=JSON.parse(raw);}catch{return json(400,{});}
      if(body.unexpected||body.formation==='99-1')return json(400,{});
      return json(403,{});
    }
    if(p==='/functions/v1/account-delete'||p==='/functions/v1/matches'){
      if(!release)return json(404,{});
      if(method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin}});
      if(auth!=='Bearer '+token)return json(401,{});
      if(p.endsWith('matches'))return json(200,{season:'2026-2027',matches:[]});
      const body=JSON.parse(init.body);return body.confirmation==='HESABIMI SIL'?json(200,{deleted:true}):json(400,{error:{code:'confirmation_mismatch'}});
    }
    throw Error('unexpected '+p);
  };
  return {calls,fetchImpl};
}
const quiet=()=>{};

test('default run is read-only: only GET/OPTIONS and rejected function POSTs, no REST writes, no password or real confirmation',async()=>{
  const f=fakeProduction();const {failed,results}=await verifyLiveBackend({url,key,fetchImpl:f.fetchImpl,log:quiet});
  assert.equal(failed,0,JSON.stringify(results.filter(r=>r.status==='FAIL')));
  for(const call of f.calls){
    if(call.path.startsWith('/rest/'))assert.equal(call.method,'GET',call.path);
    else assert.ok(['GET','OPTIONS','POST'].includes(call.method));
    assert.doesNotMatch(String(call.body??''),/HESABIMI SIL/);
  }
  assert.ok(results.some(r=>r.status==='NOT RUN'&&r.name==='anonymous write probes'));
  assert.ok(results.some(r=>r.status==='NOT RUN'&&r.name==='authenticated checks'));
});

test('post-release strict mode passes all checks, including write probes and authenticated non-writing checks',async()=>{
  const f=fakeProduction();
  const {failed,results}=await verifyLiveBackend({url,key,fetchImpl:f.fetchImpl,probeWrites:true,accessToken:'valid-jwt',log:quiet});
  assert.equal(failed,0,JSON.stringify(results.filter(r=>r.status==='FAIL')));
  assert.ok(results.some(r=>r.name==='legacy 2-arg RPC removed'&&r.status==='PASS'));
  assert.ok(results.some(r=>r.name==='account-delete wrong confirmation 400 (no deletion)'&&r.status==='PASS'));
});

test('pre-release mode matches current production; strict mode flags the missing release pieces',async()=>{
  const pre=await verifyLiveBackend({url,key,fetchImpl:fakeProduction({release:false}).fetchImpl,preRelease:true,probeWrites:true,log:quiet});
  assert.equal(pre.failed,0,JSON.stringify(pre.results.filter(r=>r.status==='FAIL')));
  const strict=await verifyLiveBackend({url,key,fetchImpl:fakeProduction({release:false}).fetchImpl,log:quiet});
  const failures=strict.results.filter(r=>r.status==='FAIL').map(r=>r.name);
  for(const expected of ['lineups allows authorization header','lineups anonymous POST rejected (login required)','account-delete preflight allows production origin','matches preflight allows production origin'])
    assert.ok(failures.includes(expected),expected);
});

test('SEC1: anonymous legacy catalogue read is reported open before the fix, required closed after it',async()=>{
  const open=await verifyLiveBackend({url,key,fetchImpl:fakeProduction({release:false}).fetchImpl,preRelease:true,log:quiet});
  for(const table of ['teams','players'])assert.ok(open.results.some(r=>r.name==='legacy '+table+' not anonymously readable'&&r.status==='NOT RUN'&&/OPEN/.test(r.detail)));
  const fixed=await verifyLiveBackend({url,key,fetchImpl:fakeProduction({release:false,sec1:true}).fetchImpl,preRelease:true,accessToken:'valid-jwt',log:quiet});
  for(const table of ['teams','players']){
    assert.ok(fixed.results.some(r=>r.name==='legacy '+table+' not anonymously readable'&&r.status==='PASS'));
    assert.ok(fixed.results.some(r=>r.name==='legacy '+table+' readable when signed in'&&r.status==='PASS'));
  }
  const strict=await verifyLiveBackend({url,key,fetchImpl:fakeProduction({release:true,sec1:false}).fetchImpl,log:quiet});
  assert.deepEqual(strict.results.filter(r=>r.status==='FAIL').map(r=>r.name),['legacy teams not anonymously readable','legacy players not anonymously readable']);
});

test('refuses to run against an unexpected project',async()=>{
  await assert.rejects(verifyLiveBackend({url:'https://other.supabase.co',key,expectedRef:'abcdefghijklmnopqrst',fetchImpl:async()=>{throw Error('no request');},log:quiet}),/Refusing to run/);
});
