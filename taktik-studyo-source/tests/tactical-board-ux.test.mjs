import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classicFixture,control} from './helpers/classic-board-fixture.mjs';
import {readDraft,writeDraft} from '../src/lib/drafts.js';
const nodes=n=>[n,...n.children.flatMap(nodes)];
const choose=(root,kind,value)=>nodes(control(root,'tacticalToolsPanel')).find(n=>n.dataset[kind]===value).listeners.click();
const draw=(root,type='freehand')=>{choose(root,'tool',type);const input=control(root,'pitch').children.find(n=>n.className==='match-drawing-input');const ev={button:0,pointerId:1,clientX:40,clientY:80,preventDefault(){}};input.listeners.pointerdown(ev);input.listeners.pointerup({...ev,type:'pointerup',clientX:180,clientY:220});};
const json=v=>JSON.parse(JSON.stringify(v));
function fixture(options={}){
 const f=classicFixture(),created=f.create({tacticalWorkspace:true,benchOnly:true,...options});
 const {root,board}=created,dialog=root.children.find(n=>n.className==='substitution-dialog');
 const search=dialog.children[1].children[0],list=dialog.children[3],status=dialog.children[2],cancel=dialog.children[4];
 const players=()=>control(root,'players').children.filter(n=>n.className.split(' ').includes('player'));
 const actions=()=>control(root,'players').children.filter(n=>n.className==='player-substitute');
 root.querySelectorAll=selector=>selector==='.player'?players():[];
 const open=id=>actions().find(n=>Number(n.dataset.slotId)===id).onclick();
 return {...f,...created,dialog,search,list,status,cancel,players,actions,open};
}
test('TB1 exposes tools, hides permanent roster, and gives all eleven starters real contextual action buttons',()=>{
 const f=fixture();assert.equal(control(f.root,'squadPanel').hidden,true);assert.equal(control(f.root,'squadList').children.length,0);
 assert.equal(control(f.root,'drawingTools').hidden,true);assert.equal(control(f.root,'drawingToggle').hidden,true);
 assert.equal(f.actions().length,11);for(const action of f.actions()){assert.equal(action.type,'button');assert.equal(action['aria-haspopup'],'dialog');assert.match(action['aria-label'],/yerine oyuncu seç/);}
 const panel=control(f.root,'tacticalToolsPanel');assert.equal(panel.children[0].className,'match-tactical-tools');assert.equal(nodes(panel).filter(n=>n.dataset.tool).length,8);
 const css=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');for(const selector of ['.player:hover+.player-substitute','.player:focus+.player-substitute','.player.selected+.player-substitute',':focus-visible','@media(pointer:coarse)'])assert(css.includes(selector));
});
test('picker opens for the exact starter, resets search, lists only bench, and filters by name',()=>{
 const f=fixture(),slot=f.board.getState().players[4];f.open(slot.id);assert(f.dialog.open);assert.match(f.dialog['aria-label'],new RegExp(slot.name));assert.equal(f.search.value,'');
 const ids=new Set(f.board.getState().players.map(p=>p.athleteId));assert(f.list.children.length>0);assert(f.list.children.every(n=>!ids.has(n.dataset.athleteId)));
 const name=f.list.children[0].children[1].children[0].textContent;f.search.value=name;f.search.listeners.input();assert(f.list.children.every(n=>n.children[1].children[0].textContent.includes(name)));
 f.search.value='unmatched-fixture-name';f.search.listeners.input();assert.equal(f.list.children.length,0);assert.equal(f.status.textContent,'Oyuncu bulunamadı.');f.cancel.onclick();f.open(slot.id);assert.equal(f.search.value,'');assert(f.list.children.length>0);
});
test('true swap retains slot id/coordinates/role, adds outgoing athlete to bench, never mutates canonical positions or duplicates athletes',()=>{
 const f=fixture(),before=f.board.getState(),slot=before.players[10];const roster=f.context.window.TAKTIK_ROSTERS.teams[before.team.name],canonical=json(roster);
 f.open(slot.id);const reserve=f.list.children[0],incoming=reserve.dataset.athleteId;reserve.onclick();assert.equal(f.dialog.open,false);
 const after=f.board.getState(),player=after.players.find(p=>p.id===slot.id);assert.equal(player.athleteId,incoming);
 for(const key of ['id','x','y','role'])assert.equal(player[key],slot[key]);assert.equal(new Set(after.players.map(p=>p.athleteId)).size,11);assert.deepEqual(json(roster),canonical);
 f.open(slot.id);const bench=f.list.children.map(n=>n.dataset.athleteId);assert(bench.includes(slot.athleteId));assert(!bench.includes(incoming));assert.equal(bench.length,roster.players.length-11);
 f.cancel.onclick();f.board.applyFormation('3-5-2');assert(f.board.getState().players.some(p=>p.athleteId===incoming));assert(!f.board.getState().players.some(p=>p.athleteId===slot.athleteId));
});
test('cancel and native Escape event leave state unchanged; both return focus to the slot',()=>{
 const f=fixture(),before=json(f.board.getState());let focus=0;f.players()[2].focus=()=>focus++;
 f.open(2);f.cancel.onclick();assert.equal(focus,1);assert.deepEqual(json(f.board.getState()),before);
 f.open(2);f.dialog.listeners.cancel({preventDefault(){}});assert.equal(focus,2);assert.equal(f.dialog.open,false);assert.deepEqual(json(f.board.getState()),before);
});
test('successful swap clears selection and contextual action state, with focus on neutral pitch instead of incoming player',()=>{
 const f=fixture(),pitch=control(f.root,'pitch');let pitchFocus=0,slotFocus=0;pitch.focus=()=>pitchFocus++;f.players()[4].focus=()=>slotFocus++;
 f.open(4);assert.equal(f.players()[4]['aria-pressed'],true);f.list.children[0].onclick();
 assert.equal(f.dialog.open,false);assert.equal(pitchFocus,1);assert.equal(slotFocus,0);assert(f.players().every(n=>n['aria-pressed']===false));
 assert.equal(pitch['data-player-actions'],'neutral');assert.equal(control(f.root,'playerForm').hidden,true);
 // Normal future keyboard focus or hover is a new interaction, not stale state.
 f.players()[4].listeners.pointermove();assert.equal(pitch['data-player-actions'],'active');
 f.root.listeners.keydown({key:'Escape',preventDefault(){}});assert(f.players().every(n=>n['aria-pressed']===false));
});
test('overridden names and shirt numbers follow stable athlete identity through swaps in both directions',()=>{
 const edits=new Map(),overrides={key:id=>id,ready:()=>true,has:id=>edits.has(id),subscribe:()=>()=>{},effective:(id,p)=>({...p,...edits.get(id)})};
 const f=fixture({playerOverrides:overrides}),slot=f.board.getState().players[1];edits.set(slot.athleteId,{name:'Edited outgoing',number:88});
 f.open(slot.id);const incoming=f.list.children[0].dataset.athleteId;edits.set(incoming,{name:'Edited incoming',number:77});f.cancel.onclick();f.open(slot.id);
 const choice=f.list.children.find(n=>n.dataset.athleteId===incoming);assert.equal(choice.children[1].children[0].textContent,'Edited incoming');choice.onclick();
 assert.equal(f.board.getState().players[1].name,'Edited incoming');assert.equal(f.board.getState().players[1].number,77);
 f.open(slot.id);const outgoing=f.list.children.find(n=>n.dataset.athleteId===slot.athleteId);assert.equal(outgoing.children[1].children[0].textContent,'Edited outgoing');outgoing.onclick();assert.equal(f.board.getState().players[1].number,88);
});
test('existing editor still opens while its legacy replacement select stays hidden',()=>{
 const f=fixture();f.players()[3].listeners.click();assert.equal(control(f.root,'playerForm').hidden,false);assert.equal(control(f.root,'rosterSelectLabel').hidden,true);
 assert.equal(control(f.root,'playerName').value,f.board.getState().players[3].name);
});
test('empty/custom team gets a meaningful empty bench and no persistence from opening/cancelling',()=>{
 const base=classicFixture().create().board.getState();base.team.name='Custom TB1';base.players.forEach(p=>delete p.athleteId);
 const f=fixture({initialState:base}),initialized=json(f.board.getState());assert.match(initialized.team.id,/^custom-/);f.open(0);assert.equal(f.status.textContent,'Yedek oyuncu bulunmuyor.');assert.equal(f.list.children.length,0);f.cancel.onclick();assert.deepEqual(json(f.board.getState()),initialized);
});
test('stale picker cannot replace players after external team change',()=>{
 const f=fixture();f.open(2);const choice=f.list.children[0];f.board.selectTeam('Fenerbahçe');const before=json(f.board.getState());choice.onclick();assert.deepEqual(json(f.board.getState()),before);assert.equal(f.dialog.open,false);
});
test('swap schedules existing draft save; reload preserves XI, derived bench, drawings and formation',()=>{
 const f=classicFixture(),stored=new Map(),timers=new Map();let next=0,changes=0;const storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)};
 f.context.setTimeout=fn=>{timers.set(++next,fn);return next;};f.context.clearTimeout=id=>timers.delete(id);f.context.window.TAKTIK_DRAFTS={read:k=>readDraft(storage,k),write:(k,s)=>writeDraft(storage,k,s)};
 const a=f.create({tacticalWorkspace:true,storageKey:'tb1',onChange:()=>changes++}),state=a.board.getState(),outgoing=state.players[6];
 const dialog=a.root.children.find(n=>n.className==='substitution-dialog');control(a.root,'players').children.find(n=>n.dataset.slotId===6).onclick();const choice=dialog.children[3].children[0],incoming=choice.dataset.athleteId;const beforeChanges=changes;choice.onclick();assert.equal(changes,beforeChanges+1);
 draw(a.root);
 a.board.applyFormation('4-4-2');for(const fn of [...timers.values()])fn();assert(readDraft(storage,'tb1'));
 const b=f.create({tacticalWorkspace:true,storageKey:'tb1'});assert.deepEqual(json(b.board.getState()),json(a.board.getState()));assert.equal(b.board.getState().drawings.length,1);
 control(b.root,'players').children.find(n=>n.dataset.slotId===6).onclick();const bench=b.root.children.find(n=>n.className==='substitution-dialog').children[3].children.map(n=>n.dataset.athleteId);assert(bench.includes(outgoing.athleteId));assert(!bench.includes(incoming));
});
test('expanded Studio relocates tools, not bench; Comparison retains its existing sidebar',()=>{
 const f=fixture();control(f.root,'expandBoard').onclick();assert.equal(control(f.root,'expandedBench').children.at(-1),control(f.root,'tacticalToolsPanel'));assert.equal(control(f.root,'expandedEmpty').hidden,true);control(f.root,'closeExpanded').onclick();
 const comparison=f.create({benchOnly:true});assert.equal(control(comparison.root,'squadPanel').hidden,false);assert(control(comparison.root,'squadList').children.length>0);assert(!control(comparison.root,'players').children.some(n=>n.className==='player-substitute'));
});

test('TB1.1 empty pitch/grass/markings click clears underlying selection; UI controls and active drawing do not',()=>{
 const f=fixture(),pitch=control(f.root,'pitch'),select=()=>f.players()[2].listeners.click();
 for(const target of [pitch,control(f.root,'players'),{closest:()=>null}]){
  select();assert.equal(f.players()[2]['aria-pressed'],true);pitch.listeners.click({target});assert(f.players().every(n=>n['aria-pressed']===false));assert.equal(pitch['data-player-actions'],'neutral');assert.equal(control(f.root,'playerForm').hidden,true);
 }
 // Bubbling events from player/action/other embedded controls must not clear.
 for(const name of ['player','substitution action','button','input']){
  select();pitch.listeners.click({target:{closest:()=>({name})}});assert.equal(f.players()[2]['aria-pressed'],true);
 }
 select();control(f.root,'penTool').onclick();pitch.listeners.click({target:pitch});assert.equal(f.players()[2]['aria-pressed'],false);control(f.root,'finishDrawing').onclick();
 // Team/formation/tools/editor controls live outside the pitch event owner.
 assert.equal(f.context.document.listeners,undefined);assert.equal(f.root.listeners.click,undefined);
});

test('TB1.1 selecting another starter transfers selection; keyboard Escape deselects only outside modal',()=>{
 const f=fixture(),pitch=control(f.root,'pitch');f.players()[1].listeners.click();f.players()[5].listeners.click();
 assert.equal(f.players().filter(n=>n['aria-pressed']).length,1);assert.equal(f.players()[5]['aria-pressed'],true);
 let prevented=false;f.root.listeners.keydown({key:'Escape',preventDefault(){prevented=true;}});assert(prevented);assert(f.players().every(n=>!n['aria-pressed']));assert.equal(pitch['data-player-actions'],'neutral');
 f.open(5);f.root.listeners.keydown({key:'Escape',preventDefault(){throw Error('Native dialog owns Escape');}});assert.equal(f.players()[5]['aria-pressed'],true);
 const before=json(f.board.getState());f.dialog.listeners.cancel({preventDefault(){}});assert.equal(f.players()[5]['aria-pressed'],true);assert.deepEqual(json(f.board.getState()),before);
 f.players()[1].listeners.focus();assert.equal(pitch['data-player-actions'],'active');
});

test('TB1.1 shared picker shell and row contract: slot heading, count, jersey/name/team/number/position and plus',()=>{
 const f=fixture(),slot=f.board.getState().players[10];f.open(slot.id);
 const header=f.dialog.children[0];assert.equal(header.className,'weekly-picker-head');assert.equal(header.children[0].textContent,slot.role+' için oyuncu seç');assert.equal(f.dialog['aria-labelledby'],header.children[0].id);
 assert.equal(header.children[1].className,'weekly-picker-close');assert.equal(header.children[1]['aria-label'],'Oyuncu seçimini kapat');
 assert.equal(f.list.className,'weekly-results');assert.equal(f.status.textContent,f.list.children.length+' yedek oyuncu');
 for(const row of f.list.children){assert.equal(row.className,'weekly-result');assert.equal(row.children[0].className,'player-jersey');assert.equal(row.children[1].className,'weekly-result-copy');assert.match(row.children[1].children[1].textContent,/Galatasaray · .+ · /);assert.equal(row.children[2].className,'weekly-result-action');assert.equal(row.children[2].textContent,'+');assert.equal(row.title,row.children[1].children[0].textContent);}
 f.search.value=f.list.children[0].title.toLocaleUpperCase('tr');f.search.listeners.input();assert.equal(f.status.textContent,f.list.children.length+' yedek oyuncu');assert(f.list.children.length>0);
 const before=json(f.board.getState());header.children[1].onclick();assert.equal(f.dialog.open,false);assert.equal(f.players()[10]['aria-pressed'],true);assert.deepEqual(json(f.board.getState()),before);
});

test('TB1.1 failed replacement leaves modal and selection usable without claiming success',()=>{
 const f=fixture();f.open(3);const option=f.list.children[0],roster=f.context.window.TAKTIK_ROSTERS.teams[f.board.getState().team.name];
 const index=roster.players.findIndex(p=>p.id===option.dataset.athleteId),athlete=roster.players.splice(index,1)[0],before=json(f.board.getState());
 option.onclick();assert(f.dialog.open);assert.equal(f.players()[3]['aria-pressed'],true);assert.deepEqual(json(f.board.getState()),before);assert.match(f.status.textContent,/değiştirilemedi/);
 roster.players.splice(index,0,athlete);option.onclick();assert.equal(f.dialog.open,false);assert(f.players().every(n=>!n['aria-pressed']));
});

test('TB1.1 both pages load one shared picker stylesheet; no duplicate modal/row presentation remains',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 for(const file of ['dist/studyo.html','dist/haftanin-ilk-11i.html'])assert.equal((read(file).match(/href="player-picker.css"/g)||[]).length,1);
 const shared=read('dist/player-picker.css');assert.match(shared,/:is\(\.weekly-picker,\.substitution-dialog\)/);assert.match(shared,/overflow:hidden/);assert.match(shared,/\.weekly-results\{[^}]*overflow:auto/);assert.match(shared,/text-overflow:ellipsis/);assert.match(shared,/scrollbar-width:thin/);assert.match(shared,/var\(--bg-surface\)/);assert.match(shared,/:focus-visible/);
 assert.doesNotMatch(read('dist/styles.css'),/\.substitution-option\{|\.substitution-dialog\{/);assert.doesNotMatch(read('dist/weekly-xi.css'),/\.weekly-picker\{|\.weekly-result\{/);
 assert.match(read('dist/styles.css'),/\.pitch\[data-player-actions="neutral"\] \.player-substitute\{visibility:hidden/);
});
