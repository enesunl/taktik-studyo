import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createMatchesHandler,CACHE_LIMITS} from '../supabase/functions/matches/handler.js';
import {PROVIDER_LIMITED} from '../supabase/functions/matches/provider.js';
import {match} from './helpers/matches-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
import {toShare} from '../src/lib/validation.js';

// SEC2: a signed-in user must not be able to spend the shared provider quota by enumerating
// match ids. Details are fetched only for fixtures of the last successfully loaded season.
const user={id:'u',email_confirmed_at:'2026-10-01'};
const req=q=>new Request('https://x.test/functions/v1/matches'+q,{headers:{authorization:'Bearer jwt'}});
const H=3600e3;

test('unscheduled ids never reach the provider: 404 from the cached season list',async()=>{
  let seasonLoads=0,detailCalls=0;
  const h=createMatchesHandler({token:'t',now:()=>0,authenticate:async()=>user,
    load:async()=>{seasonLoads++;return {season:'2026-2027',matches:[match({id:215997})]};},
    loadDetail:async({id})=>{detailCalls++;return {...detail(),id};}});
  assert.equal((await h(req('?id=215997'))).status,200);assert.equal(detailCalls,1);
  for(let id=300000;id<300200;id++){
    const res=await h(req('?id='+id));assert.equal(res.status,404);assert.deepEqual(await res.json(),{error:{code:'MATCH_NOT_FOUND'}});
  }
  assert.equal(detailCalls,1,'200 enumerated ids cost no provider request');assert.equal(seasonLoads,1,'season served from cache');
});

test('no season ever loaded → 503 without a detail request; lost access clears the schedule',async()=>{
  let detailCalls=0,mode='down',time=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async()=>user,
    load:async()=>{if(mode==='down')throw Error('matches_unavailable');if(mode==='denied')throw Object.assign(Error('matches_unavailable'),{accessDenied:true});return {season:'2026-2027',matches:[match({id:215997})]};},
    loadDetail:async({id})=>{detailCalls++;if(mode==='down')throw Error('PROVIDER_UNAVAILABLE');return {...detail(),id};}});
  const first=await h(req('?id=215997'));assert.equal(first.status,503);assert.equal(detailCalls,0);
  time+=CACHE_LIMITS.failureCooldownMs+1;mode='ok';assert.equal((await h(req('?id=215997'))).status,200);assert.equal(detailCalls,1);
  // A temporary outage keeps the last schedule: the retained detail is still served (stale).
  time+=7*H;mode='down';const stale=await h(req('?id=215997'));assert.equal(stale.status,200);assert.equal((await stale.json()).freshness.stale,true);
  // Lost provider access purges data and the schedule: nothing is served or fetched.
  time+=CACHE_LIMITS.failureCooldownMs+1;mode='denied';const before=detailCalls;
  assert.equal((await h(req('?id=215997'))).status,503);assert.equal(detailCalls,before);
});

test('access lost while requests are in progress (another load purges): their data is not shown, shared waiters included',async()=>{
  const old={...detail(),kickoff:'2026-09-20T18:00:00Z'},target={...detail(),id:'600',status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]};
  let gate;const held=new Promise(r=>{gate=r;});
  const h=createMatchesHandler({token:'t',now:()=>Date.parse('2026-09-23T00:00:00Z'),authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:[old,target]}),
    loadDetail:async({id})=>{if(id===target.id)return {...target};await held;throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{accessDenied:true});},
    canonical:()=>({events:async data=>{await held;await new Promise(r=>setTimeout(r,0));return data;},match:async data=>data})});
  // Target loaded; its history lookup (shared by both requests) and a fixture list are still in progress when access is lost.
  const pending=[h(req('?id=600')),h(req('?id=600')),h(req(''))];await new Promise(r=>setTimeout(r,20));gate();
  assert.deepEqual((await Promise.all(pending)).map(r=>r.status),[503,503,502]);
});

test('a provider load started before access was lost and succeeding afterwards restores nothing: no 200, no refilled cache, no early re-probe; a later load restores access',async()=>{
  let time=0,seasonGate=null;const calls=[],gates=new Map(),denied=new Set(['402']);
  const hold=id=>{let open;gates.set(id,new Promise(r=>{open=r;}));return open;};
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),
    load:async()=>{calls.push('season');await seasonGate;return {season:'2026-2027',matches:[match({id:401}),match({id:402}),match({id:403})]};},
    loadDetail:async({id})=>{calls.push(id);await gates.get(id);if(denied.has(id))throw Object.assign(Error('PROVIDER_UNAVAILABLE'),{accessDenied:true});return {...detail(),id};}});
  await h(req(''));
  // Detail: two requests share the load of 401; the 402 load is denied meanwhile; then 401 succeeds.
  const open401=hold('401'),shared=[h(req('?id=401')),h(req('?id=401'))];await new Promise(r=>setTimeout(r,5));
  assert.equal((await h(req('?id=402'))).status,503);open401();
  assert.deepEqual((await Promise.all(shared)).map(r=>r.status),[503,503]);
  // Season: a reload in progress when access is lost completes afterwards.
  time+=CACHE_LIMITS.accessReprobeMs+1;denied.clear();await h(req('?id=401'));
  const open402=hold('402');denied.add('402');const late=h(req('?id=402'));await new Promise(r=>setTimeout(r,5));
  time+=31*60e3;let openSeason;seasonGate=new Promise(r=>{openSeason=r;});const list=h(req(''));await new Promise(r=>setTimeout(r,5));
  open402();assert.equal((await late).status,503);openSeason();seasonGate=null;assert.equal((await list).status,502);
  // Nothing was restored: no cached data served and no provider call before the re-probe time.
  const before=calls.length;
  assert.deepEqual([(await h(req('?id=401'))).status,(await h(req(''))).status],[503,502]);assert.equal(calls.length,before);
  time+=CACHE_LIMITS.accessReprobeMs+1;denied.clear();
  assert.deepEqual([(await h(req(''))).status,(await h(req('?id=401'))).status],[200,200],'a load started after the loss restores access');
});

// PROD5.3: per-account detail limits. The handler asks the database before any season/detail work.
test('detail limiter: verified account only, 429 with Retry-After, fails closed, no provider call after rejection, list unaffected',async()=>{
  let seasonLoads=0,detailCalls=0,answer=0;const accounts=[];
  const h=createMatchesHandler({token:'t',now:()=>0,authenticate:async jwt=>jwt==='jwt'?user:null,
    load:async()=>{seasonLoads++;return {season:'2026-2027',matches:[match({id:215997})]};},
    loadDetail:async({id})=>{detailCalls++;return {...detail(),id};},
    allowDetail:async account=>{accounts.push(account);if(answer instanceof Error)throw answer;return answer;}});
  answer=120;let res=await h(req('?id=215997'));
  assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'120');assert.deepEqual(await res.json(),{error:{code:'RATE_LIMITED'}});
  assert.equal(seasonLoads+detailCalls,0,'a rejected request never reaches the provider');
  for(const unavailable of [Error('rpc down'),null,undefined,-1,1.5,'0']){
    answer=unavailable;res=await h(req('?id=215997'));assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});
  }
  assert.equal(seasonLoads+detailCalls,0,'limiter unavailable fails closed without provider calls');
  answer=0;res=await h(req('?id=215997'));assert.equal(res.status,200);assert.equal(res.headers.get('retry-after'),null);assert.equal(detailCalls,1);
  assert.ok(accounts.every(account=>account==='u'),'only the server-verified account id is checked');
  const checked=accounts.length;
  assert.equal((await h(req(''))).status,200,'match list');
  assert.equal((await h(new Request('https://x.test/functions/v1/matches?id=215997',{headers:{authorization:'Bearer forged'}}))).status,401);
  assert.equal((await h(req('?id=215997&account=other'))).status,400);
  assert.equal(accounts.length,checked,'list, unauthenticated and malformed requests never consult or charge the limiter');
  // PROD5.4 charging: malformed ids are refused before auth (free); well-formed ids outside the season
  // and provider failures count once but never cost a provider request (enumeration stays blocked).
  assert.equal((await h(req('?id=abc'))).status,400);assert.equal(accounts.length,checked);
  for(let id=300000;id<300005;id++)assert.equal((await h(req('?id='+id))).status,404);
  assert.equal(accounts.length,checked+5);assert.equal(detailCalls,1,'enumerated ids cost no provider request');
});

const dir=new URL('../supabase/migrations/',import.meta.url);
const [A,B]=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
async function limitsDatabase(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  await db.query('insert into auth.users values ($1),($2)',[A,B]);await db.query("insert into public.profiles(id,username) values ($1,'owner_a')",[A]);
  // Supabase gives service_role full table access (as in account-limits-database.test.mjs).
  await db.exec('grant all on all tables in schema public to service_role');
  return db;
}
const allowed=async(db,account,role='service_role')=>{await db.exec('set role '+role);try{return (await db.query('select public.matches_detail_allowed($1) n',[account])).rows[0].n;}finally{await db.exec('reset role');}};
const rows=async(db,like)=>Object.fromEntries((await db.query('select bucket,attempts from tactics_private.share_limits where bucket like $1',[like])).rows.map(r=>[r.bucket,r.attempts]));

test('matches_detail_allowed (real SQL): 30/10 min and 150/day per account, rejections uncharged, service role only, sharing unaffected',async()=>{
  const db=await limitsDatabase();
  for(let i=0;i<30;i++)assert.equal(await allowed(db,A),0);
  const wait=await allowed(db,A);assert.ok(wait>0&&wait<=600,'seconds until the 10-minute window resets: '+wait);
  assert.deepEqual(await rows(db,'matches:%'+A),{['matches:10m:'+A]:30,['matches:day:'+A]:30},'the rejected request is not counted');
  assert.equal(await allowed(db,B),0,'other accounts are independent');
  await db.query("update tactics_private.share_limits set attempts=150 where bucket=$1",['matches:day:'+B]);
  const daily=await allowed(db,B);assert.ok(daily>0&&daily<=86400,'seconds until the UTC day resets: '+daily);
  assert.equal((await rows(db,'matches:10m:'+B))['matches:10m:'+B],1,'a day-limited request is not counted either');
  // An expired window of this account is removed on its next allowed request.
  await db.query("insert into tactics_private.share_limits values ($1,date_bin('10 minutes',now(),'2026-01-01'::timestamptz)-interval '10 minutes',7)",['matches:10m:'+A]);
  await db.query("update tactics_private.share_limits set attempts=0 where bucket=$1 and window_start=date_bin('10 minutes',now(),'2026-01-01'::timestamptz)",['matches:10m:'+A]);
  assert.equal(await allowed(db,A),0);assert.equal((await db.query('select count(*)::int n from tactics_private.share_limits where bucket=$1',['matches:10m:'+A])).rows[0].n,1);
  for(const role of ['anon','authenticated'])await assert.rejects(allowed(db,A,role),e=>e.code==='42501','no direct RPC access for '+role);
  await assert.rejects(allowed(db,null),e=>e.code==='22023');
  // Sharing still works with its own buckets and caps, and never touches the match-detail counters.
  const before=await rows(db,'matches:%');
  const share=toShare({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'P'+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]});
  await db.exec('set role service_role');const created=(await db.query('select public.create_shared_lineup($1::jsonb,$2,$3) id',[JSON.stringify(share),'a'.repeat(64),A])).rows[0].id;await db.exec('reset role');
  assert.ok(created,'share link created');assert.deepEqual(await rows(db,'matches:%'),before);
  assert.equal((await rows(db,'global:10m'))['global:10m'],1);
});

// Distinct accounts: the per-account limit (4 at once) is not what these tests measure.
const reqAs=(q,account)=>new Request('https://x.test/functions/v1/matches'+q,{headers:{authorization:'Bearer '+account}});

test('detail loads: at most 32 at once, further cold loads wait in order instead of failing; overflow is 503 + Retry-After without a provider call; stale served at once',async()=>{
  const ids=Array.from({length:97},(_,i)=>String(400000+i)),started=[],gates=[];let active=0,peak=0,time=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:ids.map(id=>match({id:Number(id)}))}),
    loadDetail:async({id})=>{started.push(id);peak=Math.max(peak,++active);await new Promise(r=>gates.push(r));active--;return {...detail(),id};}});
  const pending=ids.map(id=>h(reqAs('?id='+id,'a'+id)));
  await new Promise(r=>setTimeout(r,20));assert.equal(started.length,32,'32 provider loads at once');
  gates.shift()();await new Promise(r=>setTimeout(r,20));assert.equal(started[32],ids[32],'a freed slot goes to the oldest waiter');
  const release=setInterval(()=>gates.splice(0).forEach(r=>r()),1);const res=await Promise.all(pending);clearInterval(release);
  assert.equal(peak,32);assert.equal(res.filter(r=>r.status===200).length,96,'32 running + 64 waiting are all served');
  const rejected=res.find(r=>r.status===503);assert.equal(rejected.headers.get('retry-after'),'5');
  assert.deepEqual(await rejected.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});assert.equal(started.length,96,'the overflow request reached no provider');
  // Expired but within the stale window: while all slots are busy, a cached match is served stale at once.
  time+=7*H;const busy=ids.slice(0,32).map(id=>h(reqAs('?id='+id,'a'+id)));await new Promise(r=>setTimeout(r,20));
  const stale=await h(reqAs('?id='+ids[40],'a'+ids[40]));assert.equal(stale.status,200);assert.equal(stale.headers.get('x-matches-cache'),'stale');
  assert.equal(started.length,128,'only the 32 refreshes reached the provider');
  gates.splice(0).forEach(r=>r());await Promise.all(busy);
});

test('a load waiting for its slot skips the provider once a 429 block started, and leaves no cooldown behind',async()=>{
  const ids=Array.from({length:33},(_,i)=>String(410000+i)),started=[],gates=[];let time=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:ids.map(id=>match({id:Number(id)}))}),
    loadDetail:async({id})=>{started.push(id);await new Promise(r=>gates.push(r));const d={...detail(),id};
      if(id===ids[0])Object.defineProperty(d,PROVIDER_LIMITED,{value:{retryAfterMs:1000}});return d;}});
  const pending=ids.map(id=>h(reqAs('?id='+id,'a'+id)));await new Promise(r=>setTimeout(r,20));assert.equal(started.length,32);
  gates.shift()();assert.equal((await pending[0]).status,200,'partial detail with a provider 429 signal');
  const skipped=await pending[32];assert.equal(skipped.status,503);assert.equal(skipped.headers.get('retry-after'),null,'a provider block is no local overload');
  assert.equal(started.length,32,'the waiting load was not sent during the block');
  gates.splice(0).forEach(r=>r());await Promise.all(pending);
  time+=1001;const after=h(reqAs('?id='+ids[32],'a'+ids[32]));await new Promise(r=>setTimeout(r,20));gates.splice(0).forEach(r=>r());
  assert.equal((await after).status,200,'after the block the match loads at once: no cooldown');assert.equal(started.at(-1),ids[32]);
});

test('probable-XI saturation: the 33rd concurrent resolution answers with provider XIs only (short browser cache), not 503',async()=>{
  const old={...detail(),kickoff:'2026-09-20T18:00:00Z'},targets=Array.from({length:33},(_,i)=>({...detail(),id:String(500+i),status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]}));
  let history=0,gate;const held=new Promise(r=>{gate=r;});
  const h=createMatchesHandler({token:'t',now:()=>Date.parse('2026-09-23T00:00:00Z'),authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:[old,...targets]}),
    loadDetail:async({id})=>{if(id!==old.id)return targets.find(m=>m.id===id);history++;await held;return old;}});
  const pending=targets.map(m=>h(reqAs('?id='+m.id,'a'+m.id)));
  const first=await Promise.race([Promise.any(pending),new Promise(r=>setTimeout(()=>r(null),200))]);
  assert.ok(first,'one request is answered while 32 resolutions wait for history');
  assert.equal(first.status,200);assert.ok(Number(first.headers.get('cache-control').split('=')[1])<=60);
  const body=await first.json();assert.equal(body.studioLineups.home,null);assert.equal(body.studioLineups.away,null);
  gate();const rest=await Promise.all(pending);assert.ok(rest.every(r=>r.status===200));assert.equal(history,1,'one shared history load');
  const again=await (await h(reqAs('?id='+body.id,'a'+body.id))).json();assert.equal(again.studioLineups.home.lineupKind,'probable-recent-match','the reduced answer is not kept');
});

test('a failed history lookup is kept only for the failure cool-down: short browser cache, then the probable XI follows',async()=>{
  const old={...detail(),kickoff:'2026-09-20T18:00:00Z'},target={...detail(),id:'600',status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]};
  let time=Date.parse('2026-09-23T00:00:00Z'),fail=true,loads=0;
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:[old,target]}),
    loadDetail:async({id})=>{loads++;if(id===target.id)return {...target};if(fail){fail=false;throw Error('PROVIDER_UNAVAILABLE');}return {...old};}});
  const first=await h(reqAs('?id=600','a'));assert.equal(first.status,200);
  assert.ok(Number(first.headers.get('cache-control').split('=')[1])<=60,'not kept for the match TTL');
  assert.equal((await first.json()).studioLineups.home,null);
  time+=CACHE_LIMITS.failureCooldownMs-1;const held=await (await h(reqAs('?id=600','c'))).json();
  assert.equal(held.studioLineups.home,null,'no new lookup during the cool-down');assert.equal(loads,2);
  time+=2;
  const again=await (await h(reqAs('?id=600','b'))).json();assert.equal(again.studioLineups.home.lineupKind,'probable-recent-match','recovered');
});

test('no history lookup starts later than 10 s into a request (the app waits 30 s), except, with canonical presentation, each team\'s latest finished match; the reduced answer is short-lived',async()=>{
  const latest={...detail(),kickoff:'2026-09-20T18:00:00Z'},older={...detail({id:215990}),kickoff:'2026-09-13T18:00:00Z'};
  const target={...detail(),id:'600',status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]};
  const run=(fail,canonical)=>{
    let time=Date.parse('2026-09-23T00:00:00Z'),slow=true;const loads=[];
    const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:[latest,older,target]}),
      loadDetail:async({id})=>{loads.push(id);if(id===target.id&&slow){slow=false;time+=11e3;}if(id===latest.id&&fail){fail=false;throw Error('PROVIDER_UNAVAILABLE');}return {...[latest,older,target].find(m=>m.id===id)};},
      canonical:canonical?()=>({events:async data=>data,match:async data=>data}):undefined});
    return {h,loads,later:ms=>{time+=ms;}};
  };
  // Without canonical presentation: no history load after 10 s; reduced answer, short-lived, then recovered.
  const a=run(false,false),late=await a.h(reqAs('?id=600','a'));assert.ok(Number(late.headers.get('cache-control').split('=')[1])<=60);
  assert.equal((await late.json()).studioLineups.home,null);assert.deepEqual(a.loads,['600'],'no history load after 10 s');
  a.later(CACHE_LIMITS.failureCooldownMs+1);
  assert.equal((await (await a.h(reqAs('?id=600','b'))).json()).studioLineups.home.lineupKind,'probable-recent-match');
  // With it: the latest match is still looked up (its default XI would load it anyway): full answer.
  const b=run(false,true),full=await (await b.h(reqAs('?id=600','a'))).json();
  assert.equal(full.studioLineups.home.lineupKind,'probable-recent-match');assert.deepEqual(b.loads,['600',latest.id]);
  // It fails: the older candidate is not started after 10 s.
  const c=run(true,true),reduced=await c.h(reqAs('?id=600','a'));assert.ok(Number(reduced.headers.get('cache-control').split('=')[1])<=60);
  assert.equal((await reduced.json()).studioLineups.home,null);assert.deepEqual(c.loads,['600',latest.id],'no older history load after 10 s');
});

test('probable-XI saturation still uses cached history details: a refreshed match keeps its probable XI without a provider call',async()=>{
  const upcoming={status:'upcoming',kickoff:'2026-10-10T12:00:00Z',lineups:null,score:{home:null,away:null},incidents:[],substitutions:[]};
  const old={...detail(),kickoff:'2026-09-20T18:00:00Z'},other={...detail({id:215998,home_team_id:194,away_team_id:134}),kickoff:'2026-09-20T18:00:00Z'};
  const target={...detail(),...upcoming,id:'600'},holders=Array.from({length:32},(_,i)=>({...detail({home_team_id:194,away_team_id:134}),...upcoming,id:String(700+i)}));
  let time=Date.parse('2026-09-23T00:00:00Z'),gate;const held=new Promise(r=>{gate=r;}),loads=[];
  const h=createMatchesHandler({token:'t',now:()=>time,authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),load:async()=>({season:'2026-2027',matches:[old,other,target,...holders]}),
    loadDetail:async({id})=>{loads.push(id);if(id===other.id)await held;return {...[old,other,target,...holders].find(m=>m.id===id)};}});
  assert.equal((await (await h(reqAs('?id=600','a'))).json()).studioLineups.home.lineupKind,'probable-recent-match');
  const pending=holders.map(m=>h(reqAs('?id='+m.id,'b'+m.id)));await new Promise(r=>setTimeout(r,20));
  time+=2*H;const refreshed=await h(reqAs('?id=600','c'));
  assert.equal(refreshed.status,200);assert.ok(Number(refreshed.headers.get('cache-control').split('=')[1])<=60);
  const body=await refreshed.json();assert.equal(body.studioLineups.home.lineupKind,'probable-recent-match','cached history is still used');
  assert.equal(body.studioLineups.away.sourceMatchId,old.id);assert.equal(loads.filter(id=>id===old.id).length,1,'no new history load');
  gate();assert.ok((await Promise.all(pending)).every(r=>r.status===200));
});

test('one account: while an instance is busy (16+ detail requests), at most 4 at once; the 5th is 429 + Retry-After, not charged; others unaffected; an idle instance does not cut a burst',async()=>{
  const gates=[],charged=[];let loads=0;
  const handler=()=>createMatchesHandler({token:'t',authenticate:async jwt=>({id:jwt,email_confirmed_at:'x'}),allowDetail:async account=>{charged.push(account);return 0;},
    load:async()=>({season:'2026-2027',matches:Array.from({length:24},(_,i)=>match({id:420000+i}))}),
    loadDetail:async({id})=>{loads++;await new Promise(r=>gates.push(r));return {...detail(),id};}});
  const tick=()=>new Promise(r=>setTimeout(r,20)),h=handler();
  const others=Array.from({length:12},(_,i)=>h(reqAs('?id='+(420010+i),'o'+i))),mine=Array.from({length:4},(_,i)=>h(reqAs('?id='+(420000+i),'heavy')));await tick();
  const fifth=await h(reqAs('?id=420004','heavy'));assert.equal(fifth.status,429);assert.equal(fifth.headers.get('retry-after'),'5');
  assert.deepEqual(await fifth.json(),{error:{code:'RATE_LIMITED'}});assert.equal(charged.length,16,'the rejected request is not charged');
  const other=h(reqAs('?id=420005','other'));await tick();assert.equal(loads,17,'another account is not limited');
  gates.splice(0).forEach(r=>r());assert.ok((await Promise.all([...others,...mine,other])).every(r=>r.status===200));
  const again=h(reqAs('?id=420006','heavy'));await tick();gates.splice(0).forEach(r=>r());
  assert.equal((await again).status,200,'finished requests free their place');
  const idle=handler(),burst=Array.from({length:6},(_,i)=>idle(reqAs('?id='+(420000+i),'heavy')));await tick();
  assert.equal(loads,24,'idle instance: all 6 load');gates.splice(0).forEach(r=>r());assert.ok((await Promise.all(burst)).every(r=>r.status===200));
});
