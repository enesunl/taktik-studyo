import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shortPlayerLabel} from '../src/lib/player-label.js';
import {classicFixture,control} from './helpers/classic-board-fixture.mjs';
import {exportFixture,serialize} from './helpers/weekly-export-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';
import {emptyWeeklyXI,pickWeeklyPlayer} from '../src/lib/weekly-xi.js';
import {createWeeklyPitch} from '../src/lib/weekly-xi-pitch.js';
import {createWeeklyGraphic,weeklyPalette,renderWeeklyPNG} from '../src/lib/weekly-xi-export.js';

test('pitch labels use explicit Turkish nationality, otherwise surname; full data stays intact',()=>{
 for(const [name,nationality,expected] of [
  ['Barış Alper Yılmaz','TR','Barış'],['Yunus Akgün','TUR','Yunus'],
  ['Victor Osimhen','Nigeria','Osimhen'],['Rafael Leão','Portugal','Leão'],
  ['Barış Alper Yılmaz',undefined,'Yılmaz'],['Yunus Akgün',undefined,'Akgün'],
  ['Pelé',undefined,'Pelé'],['  Rafael   Leão  ',undefined,'Leão'],['',undefined,''],
 ]){
  const player=Object.freeze({name,nationality});
  assert.equal(shortPlayerLabel(player),expected);assert.equal(player.name,name);
 }
});

test('only tactical workspace pitch uses the formatter; title, accessible name and shared board remain full',()=>{
 const f=classicFixture();
 for(const tacticalWorkspace of [true,false]){
  const {root,board}=f.create({tacticalWorkspace,playerLabel:shortPlayerLabel});
  const players=board.getState().players;
  const buttons=control(root,'players').children.filter(n=>n.dataset.id!==undefined);
  assert.equal(buttons.length,11);
  for(const [i,button] of buttons.entries()){
   const p=players[i];assert.equal(button.querySelector('.player-name').textContent,tacticalWorkspace?shortPlayerLabel(p):p.name);
   assert.equal(button.title,p.name);assert(button['aria-label'].includes(p.name));
  }
  const readonly=f.create({mode:'readonly',initialState:board.getState(),playerLabel:shortPlayerLabel});
  assert.equal(control(readonly.root,'players').children[0].querySelector('.player-name').textContent,players[0].name);
  readonly.board.dispose();board.dispose?.();
 }
});

test('Weekly editor, preview and PNG keep the same shortened labels, full titles and Tactical Board label styling',async()=>{
 const f=exportFixture();
 const player={id:'player1',teamId:'team1',name:'Victor Osimhen',teamName:'Team',number:45,positionGroup:'F',specificPosition:'ST',color:'#a61931',color2:'#f5bd28'};
 const state=pickWeeklyPlayer(emptyWeeklyXI(),1,player),before=JSON.stringify(state);
 const pitch=createWeeklyPitch({...f,state});
 const graphic=createWeeklyGraphic({...f,state,palette:weeklyPalette(f.document,f.window)});
 const projected=allNodes(graphic).find(n=>n.attrs.viewBox==='0 0 736 750');
 assert.equal(pitch.children.map(serialize).join(''),projected.children.map(serialize).join(''));
 const label=allNodes(pitch).find(n=>n.tagName==='text'&&n.textContent==='Osimhen');assert(label);
 assert.equal(label.attrs['font-weight'],'600');assert.equal(label.attrs['font-size'],'12');assert.equal(label.attrs.fill,'#ffffff');
 assert.match(label.attrs['font-family'],/DM Sans.*Arial/);
 const box=allNodes(pitch).find(n=>n.tagName==='rect'&&n.attrs.fill==='#102d20');
 assert.equal(box.attrs.rx,'4');assert.equal(Number(box.attrs['fill-opacity']),217/255);
 assert.equal(Number(box.attrs.width),7*9+12);assert.equal(Number(box.attrs.height),19.8);
 assert(allNodes(pitch).some(n=>n.tagName==='title'&&n.textContent.includes(player.name)));
 assert(!allNodes(pitch).some(n=>n.tagName==='text'&&n.textContent===player.name));
 assert.equal(JSON.stringify(state),before);
 await renderWeeklyPNG({...f,svg:graphic});assert.equal(await f.created.at(-1).text(),serialize(graphic));
});

test('account section shares the shell content edge on desktop and mobile',()=>{
 const css=readFileSync(new URL('../dist/profile.css',import.meta.url),'utf8');
 assert.match(css,/#profileAccount\{--account-label:140px;padding:28px 0 12px;max-width:none\}/);
 assert.match(css,/#profileAccount\{--account-label:110px;padding:24px 0 12px\}/);
 assert.match(css,/grid-template-columns:var\(--account-label\) minmax\(0,1fr\)/);
});
