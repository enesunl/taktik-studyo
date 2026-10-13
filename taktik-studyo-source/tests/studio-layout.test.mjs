import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const studio=readFileSync(new URL('../dist/studyo.html',import.meta.url),'utf8');
test('Studio right column hosts Tactical Tools, hides the legacy bench and retains the compact player editor',()=>{
 const lineup=studio.split('<div class="studio-lineup">')[1].split('<footer>')[0];
 assert.match(lineup,/^<section id="boardPanel"/);
 assert.match(lineup,/<\/section><div class="studio-controls"><section id="tacticalToolsPanel" class="tactics-panel"/);
 assert.match(lineup,/<section class="squad-panel" id="squadPanel" hidden>/);
 assert.match(lineup,/<\/section><section class="panel player-panel">/);
 for(const id of ['squadPanel','squadList','squadCount','squadSource','playerForm','rosterSelect']){
  assert.equal(studio.split('id="'+id+'"').length-1,1,id+' must not be duplicated');
 }
 assert.match(lineup,/id="playerForm"/);
 assert.doesNotMatch(studio,/class="studio-sidebar"/);
});

test('Studio template retains reusable drawing controls for relocation to the permanent tools panel',()=>{
 const actions=studio.split('<div class="board-actions">')[1].split('<details class="studio-formations">')[0];
 assert.match(actions,/id="drawingToggle"[^>]*aria-expanded="false"/);
 assert.match(actions,/id="drawingTools"[^>]*role="group"[^>]*hidden/);
 for(const id of ['penTool','drawingColor','eraserTool','finishDrawing'])assert.match(actions,new RegExp('id="'+id+'"'));
});

test('Studio formation controls are inside the board header, before the pitch',()=>{
 const header=studio.split('<section id="boardPanel"')[1].split('<div class="pitch-wrap">')[0];
 assert.match(header,/<details class="studio-formations"><summary aria-label="Diziliş seç">/);
 for(const id of ['boardFormation','formationList','customFormation','formationCount']){
  assert.match(header,new RegExp('id="'+id+'"'));
  assert.equal(studio.split('id="'+id+'"').length-1,1);
 }
 assert.doesNotMatch(header,/<details[^>]*\bopen\b/);
 assert.match(header,/data-filter="popular"/);assert.match(header,/data-filter="all"/);
});

test('Studio composition does not introduce controls into public shares or Comparison',()=>{
 const shared=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').split('<div id="sharedViewer" hidden>')[1];
 assert.doesNotMatch(shared,/studio-formations|squadPanel|formationList|<select\b/);
 const comparison=readFileSync(new URL('../dist/karsilastirma.html',import.meta.url),'utf8');
 assert.doesNotMatch(comparison,/studio-workspace|studio-lineup|studio-formations/);
 assert.match(comparison,/id="leftFormation"/);assert.match(comparison,/id="rightFormation"/);
});
