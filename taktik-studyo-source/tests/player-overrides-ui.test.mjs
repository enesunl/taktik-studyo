import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {legacyRosterScript} from './helpers/legacy-shape-roster.cjs';
import {createPlayerOverrides} from '../src/lib/player-overrides.js';
import {createFreeTeam,createLocalCatalogue,createMatchLayout} from '../src/lib/match-layout.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {mountMatchDetail} from '../src/lib/match-detail-ui.js';
import {overrideClient,owner,deferred} from './helpers/player-overrides-fixture.mjs';
import {classicFixture,control} from './helpers/classic-board-fixture.mjs';
import {matchBoardDocument} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf} from './helpers/matches-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),tick=()=>new Promise(r=>setImmediate(r));
const store=client=>createPlayerOverrides({client,validatedUser:{id:owner},current:()=>true});
function editor(f,value){control(f.root,'players').children[0].listeners.click();control(f.root,'playerName').value=value;control(f.root,'playerNumber').value='77';control(f.root,'playerRole').value='SF';control(f.root,'playerForm').onsubmit({preventDefault(){}});}
function bench(f,context){const state=f.board.getState(),ids=new Set(state.players.map(p=>p.athleteId));assert.equal(ids.size,11);
 const actual=control(f.root,'squadList').children.map(n=>n.dataset.athleteId);assert.ok(actual.every(id=>!ids.has(id)));
 const expected=context.window.TAKTIK_ROSTERS.teams[state.team.name].players.filter(p=>!ids.has(p.id)).map(p=>p.id);assert.equal(JSON.stringify(actual),JSON.stringify(expected));}
test('actual classic editor persists globally: same-page Comparison, refresh, team-return, reset, stable XI bench identities',async()=>{
 const client=overrideClient(),overrides=store(client);await overrides.load();const f=classicFixture(),a=f.create({playerOverrides:overrides,benchOnly:true}),b=f.create({playerOverrides:overrides,benchOnly:true});
 const original=a.board.getState().players[0],catalogue=JSON.stringify(f.context.window.TAKTIK_ROSTERS);
 editor(a,'Personal XI');await tick();assert.equal(a.board.getState().players[0].name,'Personal XI');assert.equal(b.board.getState().players[0].name,'Personal XI');assert.equal(b.board.getState().players[0].athleteId,original.athleteId);
 assert.equal(control(b.root,'players').children[0].children[1].textContent,'Personal XI');bench(a,f.context);bench(b,f.context);
 a.board.selectTeam('Fenerbahçe');a.board.selectTeam('Galatasaray');assert.equal(a.board.getState().players.find(p=>p.athleteId===original.athleteId).name,'Personal XI');
 a.board.applyFormation('3-5-2');bench(a,f.context);bench(b,f.context);assert.equal(b.board.getState().formation,'4-3-3');
 const reloaded=store(client);await reloaded.load();const c=f.create({playerOverrides:reloaded,benchOnly:true});assert.equal(c.board.getState().players[0].name,'Personal XI');
 const readonly=f.create({mode:'readonly',initialState:{...a.board.getState(),players:a.board.getState().players.map(p=>({...p,name:'Public snapshot'}))},playerOverrides:overrides});assert.equal(readonly.board.getState().players[0].name,'Public snapshot');
 control(a.root,'players').children[0].listeners.click();control(a.root,'resetPlayerOverride').onclick();await tick();assert.equal(b.board.getState().players[0].name,original.name);assert.equal(JSON.stringify(f.context.window.TAKTIK_ROSTERS),catalogue);
});
test('failed player save preserves all form fields and canonical view; pending selection change receives no stale success',async()=>{
 const client=overrideClient(),overrides=store(client);await overrides.load();const f=classicFixture().create({playerOverrides:overrides}),original=f.board.getState().players[0];
 client.error={message:'private'};editor(f,'Not saved');await tick();assert.equal(control(f.root,'playerName').value,'Not saved');assert.equal(control(f.root,'playerNumber').value,'77');assert.equal(f.board.getState().players[0].name,original.name);assert.match(control(f.root,'playerEditStatus').textContent,/kaydedilemedi/);assert.doesNotMatch(control(f.root,'playerEditStatus').textContent,/private/);
 client.error=null;const d=deferred();client.pause=d.promise;editor(f,'Pending edit');await tick();f.board.selectTeam('Fenerbahçe');d.resolve();await tick();assert.equal(f.board.getState().team.name,'Fenerbahçe');assert.equal(control(f.root,'playerEditStatus').textContent,'');assert.equal(control(f.root,'playerForm').inert,false);
});
test('Free Studio overlay propagates without dirtying saved snapshot; reopen keeps tactical identity, bench, drawings and pitch',async()=>{
 const f=matchBoardDocument(),client=overrideClient(),overrides=store(client);await overrides.load();vm.runInNewContext(legacyRosterScript({withTeams:true}),{window:f.window});
 const local=createLocalCatalogue(f.window),model={matchId:null,home:createFreeTeam(local.teams[0],'home',local),away:createFreeTeam(local.teams[1],'away',local)};
 let changes=0;const options={root:f.nodes.matchStudioContent,document:f.document,model,utils:f.utils,playerOverrides:overrides,onChange:()=>changes++};const board=createMatchBoard(options),snapshot=structuredClone(board.exportState()),p=model.home.players[0];
 assert.equal((await overrides.save('local:'+p.playerId,{name:'Free custom',number:88,role:'MO'})).ok,true);
 assert.match(textOf(options.root),/Free custom/);assert.equal(changes,0);assert.deepEqual(structuredClone(board.exportState()),snapshot);
 board.dispose();const reopen=createMatchBoard({...options,model:snapshot.model,initial:snapshot});assert.match(textOf(options.root),/Free custom/);assert.deepEqual(structuredClone(reopen.exportState()),snapshot);
 await overrides.reset('local:'+p.playerId);assert.doesNotMatch(textOf(options.root),/Free custom/);assert.deepEqual(structuredClone(reopen.exportState()),snapshot);reopen.dispose();
});
test('BSD identity overlay applies to Match Studio without colliding with local catalogue IDs',async()=>{
 const f=matchBoardDocument(),overrides=store(overrideClient());await overrides.load();const model=createMatchLayout(detail()),p=model.home.players[0];
 await overrides.save('local:'+p.playerId,{name:'Wrong source',number:2,role:'MO'});
 const board=createMatchBoard({root:f.nodes.matchStudioContent,document:f.document,model,utils:f.utils,playerOverrides:overrides});assert.doesNotMatch(textOf(f.nodes.matchStudioContent),/Wrong source/);
 await overrides.save('bsd:'+p.playerId,{name:'Provider edit',number:6,role:'MO'});assert.match(textOf(f.nodes.matchStudioContent),/Provider edit/);assert.equal(board.exportState().model.home.players[0].name,p.name);board.dispose();
});
test('Match Center updates lineup, scorer and timeline display together without mutating match facts',async()=>{
 const f=matchBoardDocument('/mac?id=215997'),overrides=store(overrideClient()),match=detail(),source=structuredClone(match);await overrides.load();
 const page=mountMatchDetail({document:f.document,window:f.window,current:()=>true,playerOverrides:overrides,api:{load:async()=>({ok:true,match})}});await page.ready;
 await overrides.save('bsd:105',{name:'Personal scorer',number:19,role:'MO'});
 const nodes=allNodes(f.nodes.matchDetailContent);assert.ok(nodes.filter(n=>n.textContent==='Personal scorer').length>=2);
 assert.ok(nodes.some(n=>n.textContent==="Personal scorer 13′"||n.textContent?.startsWith('Personal scorer 13')));
 assert.deepEqual(match,source);await overrides.reset('bsd:105');assert.doesNotMatch(textOf(f.nodes.matchDetailContent),/Personal scorer/);page.dispose();
});
test('wider classic pitches keep drag positions normalized, with independent boards and bounded players',()=>{
 const f=classicFixture(),a=f.create({benchOnly:true}),b=f.create({benchOnly:true});
 control(a.root,'pitch').getBoundingClientRect=()=>({left:0,top:0,width:516,height:569});
 const before=a.board.getState(),other=JSON.stringify(b.board.getState()),p=before.players[5],el=control(a.root,'players').children[5];
 el.listeners.pointerdown({button:0,currentTarget:el,clientX:p.x*5.16,clientY:p.y*5.69,pointerId:1});
 el.listeners.pointermove({clientX:p.x*5.16+25.8,clientY:p.y*5.69+28.45});
 el.listeners.pointerup({type:'pointerup',clientX:p.x*5.16+25.8,clientY:p.y*5.69+28.45});
 const moved=a.board.getState().players[5];assert.ok(Math.abs(moved.x-p.x-5)<.00001);assert.ok(Math.abs(moved.y-p.y-5)<.00001);
 assert.equal(JSON.stringify(b.board.getState()),other);assert.ok(a.board.getState().players.every(p=>p.x>=9&&p.x<=91&&p.y>=9&&p.y<=92));
});
test('expanded workspace keeps responsive sizing and contained scrolling',()=>{
 const expanded=read('dist/styles.css');
 assert.match(expanded,/max-width:802px/);assert.match(expanded,/height:96dvh/);assert.match(expanded,/\.expanded-center\{min-height:0;overflow:hidden/);assert.match(expanded,/5\.8dvh/);assert.match(expanded,/overscroll-behavior:contain/);
});
