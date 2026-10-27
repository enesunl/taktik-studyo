import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEvent,fetchSeason,fetchDetail,pacedFetch} from '../supabase/functions/matches/provider.js';
import {teamMapping} from '../supabase/functions/matches/teams.js';
import {event} from './helpers/matches-fixture.mjs';

test('BSD normalization uses explicit local identities, names and existing catalogue colors',() => {
  const seed = readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8');
  assert.equal(teamMapping.size,18);
  for (const mapped of teamMapping.values()) assert.ok(seed.includes("('"+mapped.teamId+"','"+mapped.name+"',"));
  for (const [id,name] of [[196,'Beşiktaş'],[194,'Başakşehir'],[3380,'Amedspor']]) {
    const m = normalizeEvent(event({home_team_id:id,away_team_id:134}));
    assert.equal(m.home.name,name);assert.notEqual(m.home.teamId,String(id));
    const row = seed.split('\n').find(s => s.includes("('"+m.home.teamId+"','"));
    assert.ok(row.includes("'"+m.home.color+"','"+m.home.color2+"'"));
  }
});

for (const [input,expected] of [['finished','finished'],['notstarted','upcoming'],['live','live'],['inprogress','live'],['postponed','postponed'],['cancelled','cancelled'],['unexpected-status','unknown']]) {
  test('provider status '+input+' -> '+expected,() => {
    const m = normalizeEvent(event({status:input}));assert.equal(m.status,expected);
    assert.deepEqual(m.score,expected === 'upcoming' ? {home:null,away:null} : {home:3,away:2});
  });
}
test('normalization tolerates missing scores and mapping; strips every provider/media extra',() => {
  const m = normalizeEvent(event({home_score:null,away_score:undefined,home_team_id:99999,home_team:'<img src=x onerror=alert(1)>',photo:'https://media.invalid/a',highlights:['private'],raw_secret:'never'}));
  assert.deepEqual(m.score,{home:null,away:null});assert.equal(m.home.teamId,null);assert.equal(m.home.color,'#647067');
  assert.equal(m.home.name,'<img src=x onerror=alert(1)>');
  assert.doesNotMatch(JSON.stringify(m),/https:|raw_secret|highlights|photo/);
});
test('malformed events, scope, team, round and timestamps rejected individually',() => {
  for (const e of [null,{},event({id:NaN}),event({season_id:2}),event({league_id:2}),event({round_number:null}),event({round_number:35}),event({round_number:'6'}),event({home_team:null}),event({home_team_id:null}),event({event_date:null}),event({event_date:'2026-09-20T17:00:00'}),event({event_date:'not-date'})]) assert.equal(normalizeEvent(e),null);
  assert.equal(normalizeEvent(event()).kickoff,'2026-09-20T17:00:00.000Z');
});
const response = data => new Response(JSON.stringify(data));
const next = 'https://sports.bzzoiro.com/api/v2/events/?league_id=11&limit=200&offset=200&season_id=1539';
test('pagination merges 200+106 records, deduplicates and skips malformed rows',async() => {
  const first = Array.from({length:200},(_,i) => event({id:i+1}));first[199] = null;
  const last = Array.from({length:106},(_,i) => event({id:i+200}));last[105] = event({id:1});
  const calls = [], fetchImpl = async(url,options) => {calls.push(url);assert.equal(options.headers.Authorization,'Token test-only');assert.equal(options.redirect,'error');return response({count:306,results:calls.length === 1 ? first : last,next:calls.length === 1 ? next : null});};
  const result = await fetchSeason({token:'test-only',fetchImpl});
  assert.equal(calls.length,2);assert.equal(new URL(calls[1]).searchParams.get('offset'),'200');
  assert.equal(result.matches.length,304);assert.deepEqual(result.quality,{skipped:1,duplicates:1});
});
test('full static season is 306 unique fixtures and nine fixtures in each numeric round',async() => {
  const raw = Array.from({length:306},(_,i) => event({id:i+1,round_number:Math.floor(i/9)+1}));let calls = 0;
  const result = await fetchSeason({token:'test-only',fetchImpl:async() => {calls++;return response({count:306,results:calls === 1 ? raw.slice(0,200) : raw.slice(200),next:calls === 1 ? next : null});}});
  assert.equal(result.matches.length,306);
  for(let round = 1; round <= 34; round++) assert.equal(result.matches.filter(m => m.round === round).length,9);
});
test('next URLs cannot leak credentials, escape provider scope or loop pagination',async() => {
  for (const bad of ['https://attacker.invalid/'+next,'//attacker.invalid/',next.replace('offset=200','offset=0'),next.replace('league_id=11','league_id=12'),next.replace('season_id=1539','season_id=1'),next+'&url=https://attacker.invalid',next+'&limit=200',next.replace('/events/','/teams/'),next+'#fragment',42]) {
    let count = 0;
    await assert.rejects(fetchSeason({token:'test-only',fetchImpl:async() => {count++;return response({count:306,results:Array.from({length:200},(_,i) => event({id:i+1})),next:bad});}}),/matches_unavailable/);
    assert.equal(count,1);
  }
});
test('provider errors are bounded and safe; missing list, invalid JSON, incomplete pages rejected',async() => {
  const inputs = [() => new Response('secret provider error',{status:500}),() => new Response('bad'),() => response({count:1,next:null}),() => response({count:2,results:[event()],next:null}),() => response({count:1,results:[event()]}),() => {throw Error('secret connection detail');}];
  for (const fetchImpl of inputs) await assert.rejects(fetchSeason({token:'test-only',fetchImpl}),/^Error: matches_unavailable$/);
  await assert.rejects(fetchSeason({token:'test-only',fetchImpl:async() => new Response('private',{status:429})}),/provider_limited/);
  await assert.rejects(fetchSeason({token:''}),/matches_unavailable/);
});
test('provider timeout aborts pending fetch and page bound rejects runaway pagination',async() => {
  await assert.rejects(fetchSeason({token:'test-only',timeoutMs:5,fetchImpl:(_u,{signal}) => new Promise((_r,reject) => signal.addEventListener('abort',() => reject(Error('abort'))))}),/matches_unavailable/);
  let count = 0;
  await assert.rejects(fetchSeason({token:'test-only',fetchImpl:async() => {count++;return response({count:800,results:Array.from({length:200},(_,i) => event({id:count*200+i})),next:next.replace('offset=200','offset='+count*200)});}}),/matches_unavailable/);
  assert.equal(count,4);
});

// BSD burst limit (25/s, burst 110 per client address, not lifted by a paid plan): isolate-local pacing.
test('BSD pacing: burst passes at once, excess waits, overload fails without a request, abort refunds',async() => {
  let calls = 0;const ok = async() => {calls++;return 'ok';};
  const f = pacedFetch({fetchImpl:ok,rate:50,burst:2,maxWaitMs:50,now:() => 0});
  assert.deepEqual(await Promise.all([f('u'),f('u')]),['ok','ok']);
  let done = false;const third = f('u').then(value => {done = true;return value;});
  await Promise.resolve();await Promise.resolve();assert.equal(done,false,'third request waits for a token');assert.equal(await third,'ok');
  const queued = f('u');await assert.rejects(f('u'),/provider_overloaded/);assert.equal(await queued,'ok');
  assert.equal(calls,4,'an overloaded request never reaches the provider');
  // Fixed clock: after a refund the next wait is 20 ms (allowed); without it, 40 ms would exceed maxWaitMs.
  const g = pacedFetch({fetchImpl:ok,rate:50,burst:1,maxWaitMs:30,now:() => 0});await g('u');
  const abort = new AbortController(),waiting = g('u',{signal:abort.signal});abort.abort();
  await assert.rejects(waiting);const before = calls;
  assert.equal(await g('u'),'ok','an aborted wait gives its slot back');assert.equal(calls,before + 1);
});

test('BSD pacing overload marks optional detail resources as errors, never as complete; Edge paces every request',async() => {
  let calls = 0;const raw = event({status:'finished'});
  const fetchImpl = pacedFetch({fetchImpl:async() => {calls++;return {status:200,ok:true,headers:{get:() => null},text:async() => JSON.stringify(raw)};},rate:1,burst:1,maxWaitMs:0,now:() => 0});
  const detail = await fetchDetail({id:String(raw.id),token:'t',fetchImpl});
  assert.equal(calls,1,'only the base event reached the provider');
  assert.deepEqual(Object.values(detail.availability),['error','error','error']);
  const entry = readFileSync(new URL('../supabase/functions/matches/index.ts',import.meta.url),'utf8');
  assert.match(entry,/const bsdFetch = pacedFetch\(\);/);assert.equal(entry.match(/fetchImpl:bsdFetch/g).length,2);
});

test('BSD pacing defaults stay below the provider bucket at 10/s; a pacing overload is no provider failure',async() => {
  // 90 at once, then 10 per second: at most 90 + 10 t requests in t seconds (provider: 110 + 10 t).
  let time = 0,calls = 0;const f = pacedFetch({fetchImpl:async() => {calls++;return 'ok';},now:() => time});
  await Promise.all(Array.from({length:90},() => f('u')));assert.equal(calls,90);
  const abort = new AbortController(),queued = Array.from({length:30},() => f('u',{signal:abort.signal}));
  const overload = await f('u').catch(error => error);
  assert.equal(overload.message,'provider_overloaded');assert.equal(overload.overloaded,true,'the 31st waiter (3.1 s) is refused');
  abort.abort();await Promise.allSettled(queued);assert.equal(calls,90);
  const raw = event({status:'finished'});
  const detail = fetchDetail({id:String(raw.id),token:'t',fetchImpl:pacedFetch({fetchImpl:async() => 'never',burst:0,maxWaitMs:0,now:() => 0})});
  await assert.rejects(detail,error => error.message === 'PROVIDER_UNAVAILABLE' && error.overloaded === true);
});
