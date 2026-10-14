import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createLocalCatalogueService} from '../scripts/catalogue/local-service.mjs';
import {createCatalogueSource} from '../src/lib/catalogue-source.js';
import {createCanonicalCatalogue,normalizeCanonical} from '../src/lib/catalogue-canonical.js';
import {createPlayerOverrides,playerKey} from '../src/lib/player-overrides.js';
import {createStudioProjects} from '../src/lib/studio-projects.js';
import {serializeStudioProject,projectBoardState} from '../src/lib/studio-project-snapshot.js';
import {createMatchLayout,createFreeTeam,createLocalCatalogue,emptyStudioTeam} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {classicFixture,control,Element} from './helpers/classic-board-fixture.mjs';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf} from './helpers/matches-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
import {writeDraft,readDraft} from '../src/lib/drafts.js';
import {shareValid,toShare} from '../src/lib/validation.js';
import {internalPlayerId} from '../src/lib/catalogue-identity.js';
import {squadFallback} from '../src/lib/catalogue-default-xi.js';
import {createUserDraftScope} from '../src/lib/draft-scope.js';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const origin='http://localhost:4173';
test('D4 clean room: no old catalogue, aliases or roster script; actual SQL and page engines',async t=>{
 const service=await createLocalCatalogueService({authenticate:async token=>({id:token==='other'?other:owner}),port:4173});
 const calls=[];let token='owner';
 const client={auth:{getSession:async()=>({data:{session:{access_token:token}}})}};
 const fetchImpl=async(path,options)=>{assert.equal(path,'/__local/catalogue');const body=JSON.parse(options.body);assert.notEqual(body.action,'resolve');if(body.action==='query')assert(!['teams','players','legacy_team_aliases','legacy_player_aliases'].includes(body.query.table));calls.push(body);return service.handle(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin}}));};
 const make=window=>{window.location??={origin};return createCatalogueSource({config:{source:'canonical'},window,client,fetchImpl});};
 const classic=classicFixture({canonical:true}),runtime=make(classic.context.window);let model;
 try{
  await t.test('18/543, two queries, single-flight/cache, no provider plumbing/legacy fields in browser model',async()=>{
   const [a,b]=await Promise.all([runtime.load(),runtime.load()]);assert.equal(a,b);model=a;
   assert.equal(model.teams.length,18);assert.equal(model.players.length,543);assert(model.players.every(p=>internalPlayerId(p.id)));
   assert.equal(new Set(model.players.map(p=>p.id)).size,543);assert.equal(calls.filter(c=>c.action==='query').length,2);assert.equal(calls.filter(c=>c.action==='defaults').length,1);
   await runtime.load();assert.equal(calls.length,3);
   assert.doesNotMatch(JSON.stringify(model),/fotmob|source_url|photo_url|faces\/|selection_rank|"roles"|"starts"|"value"|provider_id/);
   assert.equal(model.teams[0].id,'galatasaray');assert.equal(model.teams[0].shortName,'GS');
   assert.equal(new Set(service.state.playerMappings.map(m=>m.provider_id)).size,543);
   assert.equal((await service.db.query('select count(*)::int n from legacy_team_aliases')).rows[0].n,0);assert.equal((await service.db.query('select count(*)::int n from legacy_player_aliases')).rows[0].n,0);
   assert.equal((await service.db.query("select to_regclass('public.teams') t,to_regclass('public.players') p")).rows[0].t,null);
   assert.equal((await service.db.query("select to_regclass('public.players') p")).rows[0].p,null);
   // Stronger than empty: every following page operation must work with no alias tables.
   await service.db.exec('drop table public.legacy_player_aliases,public.legacy_team_aliases');
  });
  await t.test('Classic/Comparison engines use UUIDs: team/formations, reserves, substitute, drag, independent boards',()=>{
   const left=classic.create({team:'Galatasaray',benchOnly:true}),right=classic.create({team:'Galatasaray',benchOnly:true});
   assert(left.board.getState().players.every(p=>internalPlayerId(p.athleteId)&&!Object.hasOwn(p,'photo')));assert.equal(left.board.getState().team.id,'galatasaray');
   const before=JSON.stringify(right.board.getState());left.board.selectTeam('Fenerbahçe');left.board.applyFormation('3-5-2');assert.equal(JSON.stringify(right.board.getState()),before);
   const state=left.board.getState();assert.equal(state.team.id,'fenerbahce');assert.equal(state.players.length,11);
   const reserves=control(left.root,'squadList').children;assert(reserves.length>0);assert(reserves.every(b=>!state.players.some(p=>p.athleteId===b.dataset.athleteId)));
   control(left.root,'players').children[1].listeners.click();control(left.root,'rosterSelect').onchange({target:{value:reserves[0].dataset.athleteId}});
   assert.equal(left.board.getState().players[1].athleteId,reserves[0].dataset.athleteId);
   const p=control(left.root,'players').children[1],start=left.board.getState().players[1].x;
   p.listeners.pointerdown({button:0,currentTarget:p,clientX:100,clientY:100,pointerId:1});p.listeners.pointermove({clientX:120,clientY:90});p.listeners.pointerup({type:'pointerup',clientX:120,clientY:90});
   assert.notEqual(left.board.getState().players[1].x,start);assert.equal(JSON.stringify(right.board.getState()),before);assert.doesNotMatch(control(left.root,'squadSource').textContent,/FotMob|TFF/);
  });
  await t.test('canonical scoped boards still restore isolated legacy left/right drafts',()=>{
   const scope=createUserDraftScope({userId:owner,storage:{getItem(){return null;},setItem(){}},isCurrent:()=>true});
   const boards=['left','right'].map(slot=>classic.create({draftContext:scope.context(slot)}).board);
   assert(boards.every(b=>b.getState().players.every(p=>internalPlayerId(p.athleteId))));
   const before=JSON.stringify(boards[1].getState());boards[0].selectTeam('Fenerbahçe');assert.equal(JSON.stringify(boards[1].getState()),before);
   scope.dispose();assert.throws(()=>boards[0].getState());assert.throws(()=>boards[1].getState());
  });
  await t.test('Free Studio selector and Match Studio page mount canonical players; no rosters.js dependency',async()=>{
   const f=matchBoardDocument('/mac-studyosu'),rt=make(f.window);await rt.load();
   const local=createLocalCatalogue(f.window);assert(local.canonical);assert.equal(local.teams.length,18);
   const home=createFreeTeam(local.teams[0],'home',local),away=createFreeTeam(local.teams[1],'away',local);
   assert(home.players.every(p=>internalPlayerId(p.playerId)&&p.key.startsWith('internal:')));
   const board=createMatchBoard({root:f.nodes.matchStudioContent,document:f.document,model:{matchId:null,home,away},utils:f.utils});
   const before=board.exportState(),copy=JSON.stringify(before.model.away),pitch=JSON.stringify(before.pitch);
   board.setTeam('home',createFreeTeam(local.teams[2],'home',local));assert.equal(JSON.stringify(board.exportState().model.away),copy);assert.equal(JSON.stringify(board.exportState().pitch),pitch);board.dispose();
   const page=mountMatchStudio({...f,current:()=>true});await page.ready;
   const options=allNodes(f.nodes.matchStudioContent).filter(n=>n.className==='studio-team-option');assert.equal(options.length,18);
   fire(allNodes(f.nodes.matchStudioContent).find(n=>n.textContent==='Ev sahibi takımı seç'),'click');fire(options[0],'click');
   assert.equal(allNodes(f.nodes.matchStudioContent).filter(n=>n.className==='match-player').length,11);page.dispose();
   const m=matchBoardDocument('/mac-studyosu?id=215997'),mr=make(m.window);await mr.load();
   const input=detail();input.home.teamId=input.away.teamId=null;
   const match=await service.canonicalMatch(input);assert(match.canonicalModel.home.players.every(p=>internalPlayerId(p.playerId)));assert.equal(match.home.teamId,'amedspor');
   assert(mr.validateMatch(match));const invalid=structuredClone(match);invalid.canonicalModel.home.players[0].playerId='603669';assert(!mr.validateMatch(invalid));
   const mp=mountMatchStudio({...m,current:()=>true,api:{load:async()=>({ok:true,match})}});await mp.ready;
   assert.equal(allNodes(m.nodes.matchStudioContent).filter(n=>n.className==='match-player').length,22);mp.dispose();
   const center=matchBoardDocument('/mac?id=215997'),cr=make(center.window);await cr.load();
   const upcoming={...match,status:'upcoming',lineups:null};
   const cp=mountMatchDetail({...center,current:()=>true,api:{load:async()=>({ok:true,match:upcoming})}});await cp.ready;
   const rows=allNodes(center.nodes.matchDetailContent).filter(n=>n.className==='lineup-player');
   assert(rows.length>=22);assert(rows.every(n=>internalPlayerId(n.dataset.playerId)));cp.dispose();
  });
  await t.test('same-season completed confirmed XI resolves provider IDs only on server; predicted ignored',async()=>{
   const raw=detail();
   for(const side of ['home','away']){
    const id=service.resolver.team(raw[side].providerId,'bsd'),squad=service.state.players.filter(p=>p.team_id===id),xi=squadFallback(squad);
    const convert=id=>{const p=squad.find(p=>p.id===id);return {id:service.state.playerMappings.find(m=>m.player_id===id).provider_id,name:p.display_name,number:p.shirt_number,position:{G:'goalkeeper',D:'defender',M:'midfielder',F:'forward'}[p.position_group]};};
    raw.lineups[side]={startersValid:true,formation:'4-3-3',starters:xi.starters.map(p=>convert(p.playerId)),substitutes:xi.bench.map(convert)};
   }
   raw.lineups.status='confirmed';raw.status='finished';let reads=0;
   const recent=await createLocalCatalogueService({port:4173,authenticate:async()=>({id:owner}),token:'mock-token-only',loadSeason:async()=>({matches:[raw]}),loadDetail:async()=>{reads++;return raw;}});
   try{
    const [a,b]=await Promise.all([recent.defaults(),recent.defaults()]);const homeId=service.resolver.team(raw.home.providerId,'bsd');assert.equal(a,b);assert.equal(reads,1);assert.equal(a[homeId].kind,'recent-confirmed');assert(a[homeId].starters.every(p=>internalPlayerId(p.playerId)));
    const match=await recent.canonicalMatch(raw);assert.equal(match.canonicalModel.home.lineupKind,'confirmed');assert(match.canonicalModel.home.players.every(p=>internalPlayerId(p.playerId)));
    raw.lineups.status='predicted';assert.notEqual((await recent.canonicalMatch(raw)).canonicalModel.home.lineupKind,'confirmed');
    raw.lineups.status='confirmed';raw.lineups.home.formation='invalid';assert.notEqual((await recent.canonicalMatch(raw)).canonicalModel.home.lineupKind,'confirmed');
    raw.lineups.home.formation='4-3-3';raw.lineups.home.starters[1].id='999999999999';assert.notEqual((await recent.canonicalMatch(raw)).canonicalModel.home.lineupKind,'confirmed');
   }finally{await recent.db.close();}
  });
  await t.test('internal-only overrides persist on a clean database and overlay classic, free/match, projects',async()=>{
   const id=model.players.find(p=>p.teamId==='galatasaray'&&p.positionGroup==='F').id,key='internal:'+id;
   const opts={client:runtime.dataClient,validatedUser:{id:owner},current:()=>true,internalOnly:true};
   const store=createPlayerOverrides(opts);assert((await store.load()).ok);assert(!store.has(key));
   assert(!(await store.save('local:123',{name:'Rejected',number:8,role:'MO'})).ok);
   assert(!(await store.save('bsd:123',{name:'Rejected',number:8,role:'MO'})).ok);
   assert((await store.save(key,{name:'Canonical edit',number:9,role:'SF'})).ok);
   const reload=createPlayerOverrides(opts);assert((await reload.load()).ok);assert.equal(reload.effective(key,{}).name,'Canonical edit');
   assert.equal((await service.db.query("select count(*)::int n from player_overrides where player_key not like 'internal:%'")).rows[0].n,0);
   const same=classic.create({team:model.teams.find(t=>model.players.find(p=>p.id===id).teamId===t.id).name,playerOverrides:reload});
   assert.equal(reload.key(id),key);assert(same.board.getState().players.every(p=>internalPlayerId(p.athleteId)));
   control(same.root,'players').children[1].listeners.click();control(same.root,'rosterSelect').onchange({target:{value:id}});
   assert.equal(control(same.root,'players').children[1].title,'Canonical edit');
   const f=matchBoardDocument(),rt=make(f.window);await rt.load();const local=createLocalCatalogue(f.window),team=local.teams.find(t=>t.id===model.players.find(p=>p.id===id).teamId);
   const free=createMatchBoard({root:f.nodes.matchStudioContent,document:f.document,model:{matchId:null,home:createFreeTeam(team,'home',local),away:emptyStudioTeam()},utils:f.utils,playerOverrides:reload});
   fire(allNodes(f.nodes.matchStudioContent).find(n=>n.className==='match-player'),'click');assert(textOf(f.nodes.matchStudioContent).includes('Canonical edit'));free.dispose();
   token='other';const otherStore=createPlayerOverrides({...opts,validatedUser:{id:other}});await otherStore.load();assert(!otherStore.has(key));token='owner';
   assert((await reload.reset(key)).ok);const reset=createPlayerOverrides(opts);await reset.load();assert(!reset.has(key));
  });
  await t.test('new UUID draft/share snapshot renders readonly without provider or alias lookup',async()=>{
   const {board}=classic.create({team:'Galatasaray'}),s=JSON.parse(JSON.stringify(board.getState())),map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
   assert(writeDraft(storage,'new',s));assert(readDraft(storage,'new').players.every(p=>internalPlayerId(p.athleteId)));assert(shareValid(toShare(s)));
   const shared=JSON.parse(JSON.stringify(toShare(s))),viewer=classicFixture({canonical:true});
   Object.defineProperty(viewer.context.window,'TAKTIK_ROSTERS',{get(){throw Error('readonly catalogue lookup');}});
   const beforeCalls=calls.length,restored=viewer.create({mode:'readonly',initialState:{...s,...shared}});assert.equal(calls.length,beforeCalls);
   assert.equal(restored.board.getState().players[0].athleteId,s.players[0].athleteId);assert.equal(restored.board.getState().players[0].name,s.players[0].name);
   assert.equal(control(restored.root,'players').children[0].querySelector('.player-jersey').className,'player-jersey');
  });
  await t.test('new internal project save/reopen/rename/delete uses real local RLS and preserves snapshots',async()=>{
   const f=matchBoardDocument(),rt=make(f.window);await rt.load();const local=createLocalCatalogue(f.window),home=createFreeTeam(local.teams[0],'home',local),away=createFreeTeam(local.teams[1],'away',local);
   const snapshot=serializeStudioProject({source:{mode:'free',matchId:null,week:null},model:{home,away},working:[...home.players,...away.players].map(p=>({slotKey:p.key,personKey:p.key,x:p.initialX,y:p.initialY})),drawings:[],pitch:{color:'#285b3b',width:1200,height:650}});
   assert(snapshot);assert(snapshot.teams.home.players.every(p=>internalPlayerId(p.playerId)));
   const api=createStudioProjects({client:rt.dataClient,validatedUser:{id:owner},current:()=>true}),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
   const created=await api.createProject({id,title:'D3 local',snapshot});assert(created.ok,JSON.stringify(created));const reopened=await api.getProject(id);assert(reopened.ok);assert.deepEqual(reopened.project.snapshot,snapshot);assert(projectBoardState(snapshot));
   assert.equal((await api.listProjects()).projects.length,1);const renamed=await api.renameProject({id,revision:1,title:'Renamed'});assert(renamed.ok);
   token='other';const b=createStudioProjects({client:rt.dataClient,validatedUser:{id:other},current:()=>true});assert(!(await b.getProject(id)).ok);token='owner';
   assert((await api.deleteProject({id,revision:renamed.project.revision})).ok);
  });
  await t.test('private mapping reads, foreign owner writes and nonlocal origins denied; static fallback safe',async()=>{
   const forbidden=await runtime.dataClient.from('player_provider_ids').select('*');assert(forbidden.error);
   const row=await runtime.dataClient.from('player_overrides').insert({user_id:other,player_key:'local:22',name:'No',number:2,role:'MO'}).select('*');assert.equal(row.error.code,'42501');
   const response=await service.handle(new Request(origin+'/__local/catalogue',{method:'POST',headers:{Origin:'https://attacker.test','content-type':'application/json',authorization:'Bearer owner'},body:'{"action":"defaults"}'}));assert.equal(response.status,403);
   const data=await runtime.dataClient.request('fallback');assert.equal(data.players.length,543);assert.doesNotMatch(JSON.stringify(data),/fotmob|source_url|photo_url|faces\/|selection_rank|"roles"|"starts"|provider_id/);
   assert.throws(()=>createCatalogueSource({config:{source:'canonical'},window:{location:{origin:'https://taktikstudyo.com'}},client}),/local_catalogue_required/);
  });
 }finally{await service.db.close();}
});
test('D3 canonical errors stay distinct and never call legacy tables',async()=>{
 for(const [error,code] of [[{code:'42P01'},'schema_unavailable'],[{code:'PGRST205'},'schema_unavailable'],[{code:'network'},'network_failure']]){
  const client={from(table){assert.equal(table,'catalogue_teams');const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},then(resolve){resolve({error});}};return q;}};
  await assert.rejects(createCanonicalCatalogue(client).load(),e=>e.code===code);
 }
 assert.throws(()=>normalizeCanonical([],[]),e=>e.code==='catalogue_empty');assert.throws(()=>normalizeCanonical([{}],[{}]),e=>e.code==='catalogue_malformed');
 const legacy=createCatalogueSource({client:null,window:{}});assert.equal(legacy.source,'legacy');assert.equal(legacy.dataClient,undefined);await legacy.load();
});
