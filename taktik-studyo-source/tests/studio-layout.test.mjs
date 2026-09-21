import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const studio=readFileSync(new URL('../dist/studyo.html',import.meta.url),'utf8');
test('Studio mounts a single squad panel beside the board, with player editing preserved',()=>{
 const lineup=studio.split('<div class="studio-lineup">')[1].split('<footer>')[0];
 assert.match(lineup,/^<section id="boardPanel"/);
 assert.match(lineup,/<\/section><section class="squad-panel" id="squadPanel">/);
 for(const id of ['squadPanel','squadList','squadCount','squadSource','playerForm','rosterSelect']){
  assert.equal(studio.split('id="'+id+'"').length-1,1,id+' must not be duplicated');
 }
 assert.doesNotMatch(lineup,/id="playerForm"/);
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
