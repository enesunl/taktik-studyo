import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createMatchesHandler,CACHE_LIMITS} from '../supabase/functions/matches/handler.js';
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
