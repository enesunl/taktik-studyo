import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {requestedMatchId,backToMatches,createMatchDetailApi,detailValid,POSITION_LABELS,incidentMinute} from '../src/lib/match-detail.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {mountMatches} from '../src/lib/matches-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {createLocalMatches} from '../scripts/local-matches.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
import {MatchNode,matchesDocument,matchesWindow,allNodes,textOf,match,deferred,tick} from './helpers/matches-fixture.mjs';

test('strict positive integer ID and independent source-week validation',()=>{
  assert.equal(requestedMatchId('?id=215997'),'215997');
  for(const q of ['', '?id=abc','?id=-1','?id=0','?id=<script>','?id=1&id=1','?id=1.0','?id=01','?id=9007199254740992','?id=1%20'])assert.equal(requestedMatchId(q),null);
  assert.equal(requestedMatchId('?id=215997&hafta=abc'),'215997');
  assert.equal(backToMatches('?id=215997&hafta=6'),'/maclar?hafta=6');assert.equal(backToMatches('?hafta=35'),'/maclar');assert.equal(backToMatches('?hafta=1&hafta=2'),'/maclar');
});
function ui(value=detail(),path='/mac?id=215997&hafta=6'){
  const dom=matchesDocument(),win=matchesWindow(path);dom.nodes.matchDetailContent=new MatchNode();let calls=0,active=true;
  const options={document:dom.document,window:win.window,current:()=>active,api:{load:async()=>{calls++;return{ok:true,match:value};}}};
  return{...dom,...win,options,calls:()=>calls,stop:()=>{active=false;}};
}
test('completed match renders header, 42 players, formations, stats, timeline and available match studio',async()=>{
  const f=ui(),page=mountMatchDetail(f.options);await page.ready;const root=f.nodes.matchDetailContent,all=allNodes(root),text=textOf(root);
  for(const expected of ['Amedspor','Beşiktaş','3 — 2','MS','4-2-3-1','4-1-4-1','2,13','İstatistikler','Kadrolar','Oyuncu değişiklikleri','Maç olayları','İkinci sarıdan kırmızı kart'])assert.ok(text.includes(expected),expected);
  assert.equal(all.filter(n=>n.className==='lineup-player').length,42);assert.equal(f.calls(),1);assert.equal(root.children[0].href,'/maclar?hafta=6');
  assert.ok(all.some(n=>n.textContent==='Maçı Stüdyoda Aç'&&n.href==='/mac-studyosu?id=215997&hafta=6'));assert.ok(!all.some(n=>['img','video','iframe'].includes(n.tagName)));
  assert.doesNotMatch(text,/3071|undefined|NaN|\bnull\b|2,15/);assert.deepEqual(POSITION_LABELS,{goalkeeper:'KL',defender:'DEF',midfielder:'ORT',forward:'FOR',unknown:'—'});
  assert.equal(incidentMinute({minute:90,added:3}),'90+3′');page.dispose();assert.equal(root.children.length,0);
});
test('future match cleanly renders missing resources, kickoff and no fabricated score',async()=>{
  const future={...detail(),status:'upcoming',score:{home:null,away:null},statistics:null,lineups:null,incidents:[],substitutions:[],availability:{stats:'unavailable',lineups:'unavailable',incidents:'unavailable'}};
  const f=ui(future),page=mountMatchDetail(f.options);await page.ready;const text=textOf(f.nodes.matchDetailContent);
  assert.match(text,/Maç istatistikleri henüz mevcut değil/);assert.match(text,/Kadrolar henüz açıklanmadı/);assert.match(text,/Maç olayları maç başladıktan sonra/);assert.doesNotMatch(text,/null|undefined|NaN|0 — 0|3 — 2/);page.dispose();
});
test('invalid/missing IDs never call API; errors, retry and stale account replies stay controlled',async()=>{
  for(const path of ['/mac','/mac?id=abc']){const f=ui(detail(),path),page=mountMatchDetail(f.options);await page.ready;assert.equal(f.calls(),0);assert.match(textOf(f.nodes.matchDetailContent),/Maç bulunamadı/);page.dispose();}
  const f=ui(),wait=deferred();let calls=0;f.options.api.load=()=>{calls++;return calls===1?wait.promise:Promise.resolve({ok:true,match:detail()});};
  const page=mountMatchDetail(f.options);assert.match(textOf(f.nodes.matchDetailContent),/yükleniyor/);await f.nodes.matchDetailContent.children[2].emit('click');assert.equal(calls,1);
  wait.resolve({ok:false,error:{code:'PROVIDER_UNAVAILABLE',message:'secret'}});await page.ready;assert.doesNotMatch(textOf(f.nodes.matchDetailContent),/secret/);await f.nodes.matchDetailContent.children[2].emit('click');assert.equal(calls,2);page.dispose();
  const g=ui(),late=deferred();g.options.api.load=()=>late.promise;const pending=mountMatchDetail(g.options);g.stop();pending.dispose();late.resolve({ok:true,match:detail()});await pending.ready;assert.equal(g.nodes.matchDetailContent.children.length,0);
});
test('XSS payloads render as text and malicious style/optional shapes fail validation',async()=>{
  const full=detail();full.lineups.home.starters[0].name='<img src=x onerror=alert(1)>';
  full.incidents[0].player.name='<script>bad</script>';const f=ui(full),page=mountMatchDetail(f.options);await page.ready;
  assert.ok(allNodes(f.nodes.matchDetailContent).some(n=>n.textContent===full.lineups.home.starters[0].name));assert.equal(detailValid(full,'215997'),true);
  assert.equal(detailValid({...full,statistics:{shots:{home:NaN,away:1}}},'215997'),false);
  assert.equal(detailValid({...full,home:{...full.home,color:'url(https://evil.test)'}},'215997'),false);
  assert.equal(detailValid({...full,incidents:[{}]},'215997'),false);page.dispose();
});
test('M1 completed and upcoming cards use keyboard-native anchors and retain week',async()=>{
  for(const status of ['finished','notstarted']){
    const dom=matchesDocument(),win=matchesWindow('/maclar?hafta=6');const page=mountMatches({document:dom.document,window:win.window,current:()=>true,api:{load:async()=>({ok:true,matches:[match({status})]})}});await page.ready;
    const card=allNodes(dom.nodes.matchesContent).find(n=>n.className==='match-card');assert.equal(card.tagName,'a');assert.equal(card.href,'/mac?id=215997&hafta=6');assert.match(card.attrs['aria-label'],/Amedspor - Beşiktaş/);page.dispose();
  }
});
for(const path of ['/mac','/mac.html'])test(path+' shares protected Auth bootstrap for signed in, signed out and recovery',async()=>{
  assert.deepEqual(resolvePage(new URL(path,'https://taktikstudyo.com')),{kind:'protected',page:'match',path:'/mac.html'});
  for(const status of ['signed_in','signed_out','password_recovery']){
    const f=ui(),state={status,user:status==='signed_out'?null:{id:'u'}};let initialized=0,validated=0,requests=0,catalogues=0;
    f.window.location=new URL('https://taktikstudyo.com'+path+'?id=215997&hafta=6');f.window.location.replace=url=>f.navigations.push(url);
    const auth={initialize:async()=>{initialized++;return{ok:true};},getState:()=>state,subscribe:()=>()=>{},validateUser:async()=>{validated++;return{ok:true,user:{id:'u'}};}};
    const page=startPage({auth,document:f.document,window:f.window,client:{functions:{invoke:async()=>{requests++;return{data:detail()};}}},backend:{loadCatalogue(){catalogues++;return Promise.resolve();}}});await page.ready;await tick();
    // SEC1.1: the active catalogue (no static roster) loads only after validation.
    assert.equal(initialized,1);assert.equal(validated,status==='signed_in'?1:0);assert.equal(requests,status==='signed_in'?1:0);assert.equal(catalogues,status==='signed_in'?1:0);assert.equal(f.nodes.protectedContent.hidden,status!=='signed_in');page.dispose();
  }
});
test('installed SDK builds only production matches?id; local transport only same-origin matches?id',async()=>{
  const urls=[];const client=createClient('http://127.0.0.1:54321','sb_publishable_testonly',{accessToken:async()=>'test-jwt',global:{fetch:async(url)=>{urls.push(String(url));return Response.json(detail());}}});
  const api=createMatchDetailApi({client,current:()=>true,location:new URL('https://taktikstudyo.com/mac')});assert.equal((await api.load('215997')).ok,true);assert.deepEqual(urls,['http://127.0.0.1:54321/functions/v1/matches?id=215997']);
  const local=createMatchDetailApi({client:{auth:{getSession:async()=>({data:{session:{access_token:'test-jwt'}}})}},current:()=>true,location:new URL('http://localhost:4173/mac'),fetchImpl:async(url)=>{urls.push(url);return Response.json(detail());}});
  assert.equal((await local.load('215997')).ok,true);assert.equal(urls[1],'/__local/matches?id=215997');
});
test('local M2 requires local getUser verification before detail load; anonymous denied',async()=>{
  const requests=[];let loads=0;
  const handler=createLocalMatches({url:'http://127.0.0.1:54321',key:'sb_publishable_testonly',token:'test-only',port:4173,
    fetchImpl:async(url)=>{requests.push(String(url));return Response.json({id:'u',email_confirmed_at:'yes'});},loadDetail:async({id})=>{assert.equal(id,'215997');loads++;return detail();}});
  assert.equal((await handler(new Request('http://localhost:4173/__local/matches?id=215997'))).status,401);assert.equal(loads,0);
  const res=await handler(new Request('http://localhost:4173/__local/matches?id=215997',{headers:{Authorization:'Bearer test-jwt'}}));assert.equal(res.status,200);assert.equal(loads,1);assert.deepEqual(requests,['http://127.0.0.1:54321/auth/v1/user']);
});
test('detail API maps SDK/local status errors, rejects mismatched response and discards stale result',async()=>{
  for(const [status,code] of [[400,'INVALID_MATCH_ID'],[401,'UNAUTHORIZED'],[404,'MATCH_NOT_FOUND'],[503,'PROVIDER_UNAVAILABLE']]){
    const api=createMatchDetailApi({client:{functions:{invoke:async()=>({error:{context:{status},message:'private'}})}},current:()=>true});assert.deepEqual(await api.load('215997'),{ok:false,error:{code}});
  }
  const wait=deferred();let current=true;const api=createMatchDetailApi({client:{functions:{invoke:()=>wait.promise}},current:()=>current});const pending=api.load('215997');current=false;wait.resolve({data:detail()});assert.equal((await pending).error.code,'state_changed');
});
test('static detail shell is protected, board-free and provider/media-free',()=>{
  const html=readFileSync(new URL('../dist/mac.html',import.meta.url),'utf8');assert.match(html,/id="protectedContent"[^>]*hidden inert/);assert.match(html,/Maç verileri: BSD Sports Data/);assert.doesNotMatch(html,/<img|<video|sports\.bzzoiro|BSD_API_TOKEN/);
  for(const file of ['match-detail.js','match-detail-ui.js'])assert.doesNotMatch(readFileSync(new URL('../src/lib/'+file,import.meta.url),'utf8'),/innerHTML|BSD_API_TOKEN|sports\.bzzoiro/);
});
