import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROUNDS,requestedRound,adjacentRound,defaultRound,matchDate,createMatchesApi} from '../src/lib/matches.js';
import {mountMatches} from '../src/lib/matches-ui.js';
import {match,deferred,matchesDocument,matchesWindow,allNodes,textOf} from './helpers/matches-fixture.mjs';

test('strict week query accepts boundaries and rejects duplicates, fractions and external tricks',() => {
  assert.deepEqual(ROUNDS,Array.from({length:34},(_,i)=>i+1));
  for(const round of [1,6,34]) assert.equal(requestedRound('?hafta='+round),round);
  for(const value of ['0','35','abc','01','1.0','1e1','-1','6.5','%20','https://evil.invalid']) assert.equal(requestedRound('?hafta='+value),null);
  assert.equal(requestedRound('?hafta=1&hafta=2'),null);assert.equal(requestedRound(''),null);
  assert.equal(adjacentRound(1,-1),1);assert.equal(adjacentRound(34,1),34);assert.equal(adjacentRound(6,1),7);assert.equal(adjacentRound(6,-1),5);
});
const season = [match({id:1,round_number:1,event_date:'2026-08-14T17:00:00+00:00'}),match(),match({id:3,round_number:7,event_date:'2026-10-04T17:00:00+00:00',status:'notstarted'}),match({id:4,round_number:34,event_date:'2027-05-23T17:00:00+00:00',status:'notstarted'})];
test('default week deterministically prefers live, recent played, then closest; season boundaries',() => {
  const now=Date.parse('2026-09-22T00:00:00Z');
  assert.equal(defaultRound(season,now),6);
  assert.equal(defaultRound([...season,{...season[2],status:'live'}],now),7);
  assert.equal(defaultRound(season,Date.parse('2026-07-01Z')),1);
  assert.equal(defaultRound(season.map(m=>({...m,status:'finished'})),Date.parse('2027-06-01Z')),34);
  assert.equal(defaultRound(season.map(m=>({...m,status:'upcoming'})),now),6);
  assert.equal(defaultRound([],now),1);
});
test('UTC is preserved and formatting follows explicit timezone, including local date rollover',() => {
  const time='2026-09-20T17:00:00+00:00';
  assert.equal(Date.parse(time),Date.parse('2026-09-20T17:00:00Z'));
  assert.deepEqual(matchDate(time,'Europe/Istanbul'),{key:'2026-09-20',date:'20 Eylül Pazar',time:'20:00'});
  assert.equal(matchDate(time,'UTC').time,'17:00');assert.equal(matchDate(time,'America/New_York').time,'13:00');
  assert.equal(matchDate('2026-09-20T23:30:00+00:00','Europe/Istanbul').key,'2026-09-21');
});
function ui(data=season,path='/maclar') {
  const dom=matchesDocument(),win=matchesWindow(path);let calls=0,current=true;
  const options={...dom,window:win.window,current:()=>current,now:()=>Date.parse('2026-09-22T00:00:00Z'),api:{load:async()=>{calls++;return {ok:true,matches:data};}}};
  return {...dom,...win,options,calls:()=>calls,invalidate:()=>{current=false;}};
}
const byLabel=(root,label)=>allNodes(root).find(n=>n.attrs['aria-label']===label);
test('mount fetches once; week switching, pushState and back/forward only filter the season',async()=>{
  const f=ui(),page=mountMatches(f.options);await page.ready;const root=f.nodes.matchesContent;
  assert.match(textOf(root),/6. hafta/);assert.equal(f.calls(),1);assert.equal(f.window.location.search,'?hafta=6');
  await byLabel(root,'Sonraki hafta').emit('click');assert.equal(f.window.location.search,'?hafta=7');
  assert.equal(allNodes(root).filter(n=>n.className==='match-scores')[0].children.length,0,'upcoming has no fake 0–0 or null score');
  assert.ok(allNodes(root).some(n=>n.tagName==='time'));
  await byLabel(root,'Önceki hafta').emit('click');assert.equal(f.window.location.search,'?hafta=6');
  assert.deepEqual(allNodes(root).find(n=>n.className==='match-scores').children.map(n=>n.textContent),['3','2']);
  await byLabel(root,'34. hafta').emit('click');assert.equal(byLabel(root,'Sonraki hafta').disabled,true);
  f.set('/maclar?hafta=1');await f.window.emit('popstate');assert.equal(byLabel(root,'Önceki hafta').disabled,true);
  assert.equal(f.calls(),1);assert.equal(f.history.length,3);page.dispose();assert.equal(root.children.length,0);
  assert.equal(f.window.listeners.get('popstate').size,0);
});
test('loading, generic error, retry, double-submit and empty states are controlled',async()=>{
  const f=ui(),wait=deferred();let calls=0;f.options.api.load=()=>{calls++;return calls===1?wait.promise:Promise.resolve({ok:true,matches:[]});};
  const page=mountMatches(f.options),root=f.nodes.matchesContent;
  assert.match(textOf(root),/Maçlar yükleniyor/);await root.children[1].emit('click');assert.equal(calls,1);
  wait.resolve({ok:false,error:{message:'sensitive provider error'}});await page.ready;
  assert.match(textOf(root),/Lütfen biraz sonra/);assert.doesNotMatch(textOf(root),/sensitive/);assert.equal(root.children[1].hidden,false);
  await root.children[1].emit('click');assert.match(textOf(root),/Bu hafta için maç bulunamadı/);page.dispose();
});
test('safe text nodes, no media, non-navigating match IDs; stale account results cannot render',async()=>{
  const evil=match({home_team_id:999,home_team:'<img src="https://sports.bzzoiro.com/evil" onerror="alert(1)">'});
  const f=ui([evil]),page=mountMatches(f.options);await page.ready;const nodes=allNodes(f.nodes.matchesContent);
  assert.ok(nodes.some(n=>n.textContent===evil.home.name));assert.ok(!nodes.some(n=>['img','iframe','a','video'].includes(n.tagName)));
  assert.equal(nodes.find(n=>n.className==='match-card').dataset.matchId,evil.id);page.dispose();
  const g=ui(),wait=deferred();g.options.api.load=()=>wait.promise;const pending=mountMatches(g.options);g.invalidate();pending.dispose();
  wait.resolve({ok:true,matches:season});await pending.ready;assert.equal(g.nodes.matchesContent.children.length,0);
});
test('browser API calls only our matches function, validates data, and discards stale results',async()=>{
  const calls=[];let current=true;
  const client={functions:{invoke:async(...args)=>{calls.push(args);return {data:{season:'2026-2027',matches:season}};}}};
  const api=createMatchesApi({client,current:()=>current});assert.equal((await api.load()).ok,true);
  assert.deepEqual(calls,[['matches',{method:'GET',timeout:16000}]]);
  const wait=deferred();client.functions.invoke=()=>wait.promise;const pending=api.load();current=false;wait.resolve({data:{season:'2026-2027',matches:season}});
  assert.equal((await pending).error.code,'state_changed');
  current=true;client.functions.invoke=async()=>({data:{season:'2026-2027',matches:[{...season[0],home:{...season[0].home,color:'url(https://evil.invalid)'}}]}});
  assert.equal((await api.load()).error.code,'matches_unavailable');
});
test('production page has no board, provider access, token or media; build allowlist stays explicit',()=>{
  const html=readFileSync(new URL('../dist/maclar.html',import.meta.url),'utf8');
  assert.match(html,/id="protectedContent"[^>]*hidden inert/);assert.match(html,/Maç verileri: BSD Sports Data/);
  assert.doesNotMatch(html,/sports\.bzzoiro|BSD_API_TOKEN|<img|<video|app\.js|rosters\.js|Oturum doğrulanıyor/);
  for(const file of ['matches.js','matches-ui.js']) assert.doesNotMatch(readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8'),/BSD_API_TOKEN|sports\.bzzoiro|innerHTML/);
  assert.doesNotMatch(readFileSync(new URL('../scripts/build-backend.mjs',import.meta.url),'utf8'),/BSD_API_TOKEN/);
});
