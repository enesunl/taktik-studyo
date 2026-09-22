import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeEvent,fetchSeason} from '../supabase/functions/matches/provider.js';
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
