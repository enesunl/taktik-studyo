import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,id} from './helpers/studio-project-fixture.mjs';
import {normalizeStudioProjectSnapshot as normalize,projectBoardState,serializeStudioProject,studioRoute,projectTitle} from '../src/lib/studio-project-snapshot.js';
import {createDrawingHistory} from '../src/lib/tactical-drawings.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {safeInternalRedirect} from '../src/lib/auth-redirects.js';

test('snapshot roundtrip preserves source, substituted occupancy, positions, six drawings and appearance; fresh history',()=>{
 const s=snapshot();assert.ok(s);s.working[0].x=.31;s.working[0].y=.48;
 const reserve=s.teams.home.bench[0];assert.ok(reserve);s.working.find(p=>p.slotKey===s.teams.home.players[1].key).personKey=reserve.key;
 s.teams.home.lineupKind='probable-provider';s.teams.home.players[2].goals=2;
 const loaded=projectBoardState(s),again=serializeStudioProject({source:s.source,...loaded});
 assert.deepEqual(again,normalize(s));assert.equal(loaded.model.home.lineupKind,'probable-provider');
 const h=createDrawingHistory(again.drawings);assert.equal(h.snapshot().objects.length,6);assert.equal(h.undo(),false);assert.equal(h.snapshot().undoCount,0);
 assert.equal(again.teams.home.players[0].initialX,.07);assert.equal(again.working[0].x,.31);
});
test('explicit snapshot strips UI/provider/secret-like extras and free mode goal counts',()=>{
 const s=snapshot('free');s.selected='player';s.theme='dark';s.teams.home.photo='https://example.test';s.teams.home.players[0].goals=5;
 const clean=normalize(s);assert.ok(clean);assert.equal(clean.teams.home.players[0].goals,0);assert.doesNotMatch(JSON.stringify(clean),/selected|theme|photo|undoStack/);
 assert.deepEqual(normalize(clean),clean);
});
const mutations={
 version:s=>s.version=2,coordinate:s=>s.working[0].x=1.1,nan:s=>s.working[0].y=NaN,duplicate:s=>s.working[1].personKey=s.working[0].personKey,
 duplicatePlayer:s=>s.teams.home.bench.push({...s.teams.home.players[0]}),missingName:s=>delete s.teams.home.name,
 color:s=>s.teams.home.color='url(x)',pitch:s=>s.pitch.width=99999,formation:s=>s.teams.home.formation='4-9',
 shape:s=>s.drawings[0].type='script',count:s=>s.drawings=Array(201).fill(s.drawings[0]),
 points:s=>s.drawings[3].geometry.points=Array(257).fill({x:.2,y:.3}),drawCoord:s=>s.drawings[0].geometry.start.x=-1,
 duplicateDrawing:s=>s.drawings[1].id=s.drawings[0].id,missingTeam:s=>s.teams.away=null,
 tooLarge:s=>s.excess='x'.repeat(3*1024*1024),wrongSide:s=>s.working[0].personKey=s.teams.home.players[0].key,
};
for(const[name,mutate]of Object.entries(mutations))test('malformed snapshot rejected: '+name,()=>{const s=snapshot();mutate(s);assert.equal(normalize(s),null);assert.equal(projectBoardState(s),null);});
test('project route precedence, invalid UUID and protected aliases are exact',()=>{
 assert.deepEqual(studioRoute(''),{mode:'free'});assert.deepEqual(studioRoute('?id=215997'),{mode:'match',id:'215997'});
 assert.deepEqual(studioRoute('?project='+id+'&id=123'),{mode:'project',id});
 for(const q of ['?project=no','?project=','?project='+id+'&project='+id])assert.equal(studioRoute(q).mode,'invalid_project');
 for(const path of ['/calismalarim','/calismalarim.html'])assert.deepEqual(resolvePage(new URL(path,'https://example.test')),{kind:'protected',page:'projects',path:'/calismalarim.html'});
 assert.equal(safeInternalRedirect('/calismalarim.html'),'/calismalarim.html');assert.equal(safeInternalRedirect('/calismalarim.html?x=1'),null);
 assert.equal(projectTitle('  Plan  '),'Plan');assert.equal(projectTitle(' '),null);assert.equal(projectTitle('a'.repeat(121)),null);
});
