import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classicFixture,control} from './helpers/classic-board-fixture.mjs';
import {readDraft,writeDraft} from '../src/lib/drafts.js';
import {createUserDraftScope,userDraftKey} from '../src/lib/draft-scope.js';
const json=v=>JSON.parse(JSON.stringify(v)),nodes=n=>[n,...n.children.flatMap(nodes)];
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function environment(){
 const f=classicFixture(),w=f.context.window,old=w.TAKTIK_ROSTERS.teams;
 w.TAKTIK_TEAMS=[{id:'galatasaray',name:'Galatasaray',short:'GS',color:'#a61931',color2:'#f5bd28'},{id:'fenerbahce',name:'Fenerbahçe',short:'FB',color:'#142844',color2:'#ffff00'}];
 w.TAKTIK_CATALOGUE_RUNTIME={canonical:true,selectXI:squad=>squad.players.slice(0,11)};
 // Canonical-style fixture IDs; never edit the actual catalogue.
 w.TAKTIK_ROSTERS={teams:Object.fromEntries(w.TAKTIK_TEAMS.map(t=>[t.name,{players:json(old[t.name].players).map((p,i)=>({...p,id:t.id+'-player-'+i}))}]))};
 return f;
}
function board(f,options={}){
 const b=f.create({tacticalWorkspace:true,...options}),pitch=control(b.root,'pitch'),panel=control(b.root,'tacticalToolsPanel');
 const choose=(kind,value)=>nodes(panel).find(n=>n.dataset[kind]===value).listeners.click();
 const input=pitch.children.find(n=>n.className==='match-drawing-input');
 const event=(type,x=.2,y=.3)=>({type,button:0,pointerId:1,clientX:x*400,clientY:y*520,preventDefault(){this.defaultPrevented=true;}});
 const draw=type=>{choose('tool',type);input.listeners.pointerdown(event('pointerdown'));input.listeners.pointermove(event('pointermove',.4,.5));input.listeners.pointerup(event('pointerup',.6,.7));};
 const players=()=>control(b.root,'players').children.filter(n=>n.className?.split(' ').includes('player'));
 b.root.querySelectorAll=q=>q==='.player'?players():[];
 const move=(id,delta='ArrowLeft')=>{choose('tool','select');const player=players()[id];player.listeners.keydown({key:delta,currentTarget:player,preventDefault(){}});};
 const substitute=id=>{choose('tool','select');control(b.root,'players').children.find(n=>Number(n.dataset.slotId)===id).onclick();const d=b.root.children.find(n=>n.className==='substitution-dialog'),choice=d.children[3].children[0],incoming=choice.dataset.athleteId;choice.onclick();return incoming;};
 return {...b,pitch,input,panel,choose,draw,move,substitute,players,event,objects:()=>json(b.board.getState().tactical?.drawings||[])};
}
test('TB2.1 every drawing tool and Undo/Redo/Clear are isolated through A → B → A',()=>{
 const f=environment(),b=board(f);for(const type of ['movement-arrow','movement-arrow','movement-arrow','pass-arrow','line','freehand','zone','circle'])b.draw(type);
 const a=b.objects();b.board.selectTeam('fenerbahce');assert.deepEqual(b.objects(),[]);
 b.draw('circle');b.draw('circle');const two=b.objects();b.choose('action','undo');assert.equal(b.objects().length,1);
 b.board.selectTeam('galatasaray');assert.deepEqual(b.objects(),a);b.choose('action','undo');assert.equal(b.objects().length,7);
 b.board.selectTeam('fenerbahce');assert.equal(b.objects().length,1);b.choose('action','redo');assert.deepEqual(b.objects(),two);b.choose('action','clear');assert.deepEqual(b.objects(),[]);
 b.board.selectTeam('galatasaray');assert.equal(b.objects().length,7);b.choose('action','redo');assert.deepEqual(b.objects(),a);
 b.board.selectTeam('fenerbahce');assert.deepEqual(b.objects(),[]);b.choose('action','undo');assert.deepEqual(b.objects(),two);
 const svg=b.pitch.children.find(n=>n.viewBox==='0 0 1000 625');assert.equal(svg.children[0].children.length,2);
});
test('TB2.1 exact player coordinates, XI, slot roles, formation and derived bench survive switches',()=>{
 const f=environment(),catalogue=json(f.context.window.TAKTIK_ROSTERS),b=board(f),before=b.board.getState(),outgoing=before.players[10].athleteId;
 b.move(10);b.move(6,'ArrowDown');const incoming=b.substitute(10);b.board.applyFormation('4-4-2');b.move(10);b.move(6,'ArrowDown');const a=json(b.board.getState());
 b.board.selectTeam('fenerbahce');const untouched=json(b.board.getState().players);b.move(1);const moved=json(b.board.getState().players);
 b.board.selectTeam('galatasaray');assert.deepEqual(json(b.board.getState().players),a.players);assert.equal(b.board.getState().formation,'4-4-2');assert.equal(b.board.getState().players[10].athleteId,incoming);
 b.choose('tool','select');control(b.root,'players').children.find(n=>Number(n.dataset.slotId)===10).onclick();const dialog=b.root.children.find(n=>n.className==='substitution-dialog'),bench=dialog.children[3].children.map(n=>n.dataset.athleteId);
 assert(bench.includes(outgoing));assert(!bench.includes(incoming));assert.equal(new Set(b.board.getState().players.map(p=>p.athleteId)).size,11);
 dialog.children[4].onclick();b.board.selectTeam('fenerbahce');assert.deepEqual(json(b.board.getState().players),moved);control(b.root,'undo').onclick();assert.deepEqual(json(b.board.getState().players),untouched);
 b.board.selectTeam('galatasaray');assert.deepEqual(json(b.board.getState().players),a.players);assert.deepEqual(json(f.context.window.TAKTIK_ROSTERS),catalogue);
});
test('TB2.1 canonical IDs survive display-name changes and no mutable references are shared',()=>{
 const f=environment(),b=board(f);b.draw('zone');b.move(10);const a=json(b.board.getState());b.board.selectTeam('fenerbahce');
 const team=f.context.window.TAKTIK_TEAMS[0];team.name='Renamed team';f.context.window.TAKTIK_ROSTERS.teams[team.name]=f.context.window.TAKTIK_ROSTERS.teams.Galatasaray;
 b.board.selectTeam('galatasaray');assert.deepEqual(json(b.board.getState().players),a.players);assert.deepEqual(b.objects(),a.tactical.drawings);assert.equal(b.board.getState().team.name,'Renamed team');
 const exported=b.board.exportDraft();assert.deepEqual(json(exported.workspace.teams.map(e=>e.teamId)),['galatasaray','fenerbahce']);exported.workspace.teams[0].state.players[0].x=0;
 assert.notEqual(b.board.getState().players[0].x,0);b.board.selectTeam('fenerbahce');assert.equal(b.objects().length,0);
});
test('TB2.1 pointer movement retains fractional coordinates after switching; stale picker choices cannot touch the destination',()=>{
 const f=environment(),b=board(f),marker=b.players()[10],before=b.board.getState().players[10];
 const start={...b.event('pointerdown'),currentTarget:marker};marker.listeners.pointerdown(start);
 marker.listeners.pointerup({...start,type:'pointerup',clientX:start.clientX+17.25,clientY:start.clientY+9.125});
 const moved=json(b.board.getState().players[10]);assert.equal(moved.x,before.x+17.25/400*100);assert.equal(moved.y,before.y+9.125/520*100);
 control(b.root,'players').children.find(n=>Number(n.dataset.slotId)===10).onclick();const dialog=b.root.children.find(n=>n.className==='substitution-dialog'),staleChoice=dialog.children[3].children[0];
 b.board.selectTeam('fenerbahce');assert.equal(dialog.open,false);const destination=json(b.board.getState());staleChoice.onclick();assert.deepEqual(json(b.board.getState()),destination);
 b.board.selectTeam('galatasaray');assert.deepEqual(json(b.board.getState().players[10]),moved);
});
test('TB2.1 existing scoped autosave writes both teams and restores drawings, movement, substitutions and global pitch',()=>{
 const f=environment(),map=new Map(),timers=new Map();let next=0;
 const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},scope=createUserDraftScope({userId:owner,storage});
 const context=scope.context('main'),wrapped={...context,createWriter:options=>context.createWriter({...options,setTimer:fn=>{timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)})};
 const initialState=f.create().board.getState();initialState.tactical={drawings:[],legacy:initialState.drawings,pitch:{width:1200,height:800,color:'#285b3b'}};
 const b=board(f,{draftContext:wrapped,initialState});b.draw('movement-arrow');b.draw('movement-arrow');b.draw('movement-arrow');b.move(10);const a=json(b.board.getState());
 b.board.selectTeam('fenerbahce');b.draw('circle');const incoming=b.substitute(4),bf=json(b.board.getState());
 for(const fn of [...timers.values()])fn();const saved=readDraft(storage,userDraftKey(owner,'main'));assert(saved);assert.equal(saved.workspace.teams.length,2);
 b.board.dispose();const reopened=board(f,{draftContext:context});assert.equal(reopened.board.getState().team.id,'fenerbahce');assert.deepEqual(json(reopened.board.getState().players),bf.players);assert.equal(reopened.board.getState().players[4].athleteId,incoming);assert.equal(reopened.objects().length,1);
 reopened.board.selectTeam('galatasaray');assert.deepEqual(json(reopened.board.getState().players),a.players);assert.deepEqual(reopened.objects(),a.tactical.drawings);assert.equal(reopened.board.getState().tactical.pitch.height,800);assert.equal(reopened.pitch['data-custom-height'],'true');
 reopened.board.selectTeam('fenerbahce');assert.equal(reopened.objects().length,1);assert.equal(reopened.board.getState().players[4].athleteId,incoming);reopened.board.dispose();scope.dispose();
});
test('TB2.1 legacy single-board snapshots upgrade on save; malformed recursive/duplicate/mismatched team states are rejected',()=>{
 const f=environment(),old=f.create().board.getState();old.players[10].x=42.125;const b=board(f,{initialState:old});b.board.selectTeam('fenerbahce');b.board.selectTeam('galatasaray');assert.equal(b.board.getState().players[10].x,42.125);
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},saved=b.board.exportDraft();assert(writeDraft(storage,'draft',saved));assert(readDraft(storage,'draft'));
 for(const mutate of [s=>s.workspace.teams.push(s.workspace.teams[0]),s=>s.workspace.activeTeamId='missing',s=>s.workspace.teams[0].state.workspace={},s=>s.workspace.teams[0].teamId='wrong']){const bad=json(saved);mutate(bad);assert.equal(writeDraft(storage,'bad',bad),false);}
});
test('TB2.1 switching cancels an unfinished draw and closes stale picker; late editor completion cannot overwrite B or reselected A UI',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve),overrides={key:id=>id,ready:()=>true,has:()=>false,subscribe:()=>()=>{},effective:(_id,p)=>p,save:()=>pending};
 const f=environment(),b=board(f,{playerOverrides:overrides});b.choose('tool','line');b.input.listeners.pointerdown(b.event('pointerdown'));const lateEnd=b.input.listeners.pointerup;
 b.board.selectTeam('fenerbahce');lateEnd(b.event('pointerup',.6,.7));assert.equal(b.objects().length,0);b.board.selectTeam('galatasaray');assert.equal(b.objects().length,0);
 b.players()[3].listeners.click();control(b.root,'playerName').value='Edited';control(b.root,'playerForm').onsubmit({preventDefault(){}});
 b.board.selectTeam('fenerbahce');const before=json(b.board.getState());b.board.selectTeam('galatasaray');const message=control(b.root,'playerEditStatus').textContent;finish({ok:true});await pending;await Promise.resolve();assert.equal(control(b.root,'playerEditStatus').textContent,message);
 b.board.selectTeam('fenerbahce');assert.deepEqual(json(b.board.getState()),before);
});
test('TB2.1 default pitch caps match pre-TB2, sidebar cannot stretch board, saved custom height survives reload',()=>{
 const css=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');
 for(const expected of ['max-height:642px','@media(min-width:1450px){.pitch.tactical-pitch{max-height:700px}}','@media(max-width:950px){.pitch.tactical-pitch{max-height:620px}}','@media(max-width:620px){.pitch.tactical-pitch{max-height:none;min-height:430px}}','.studio-lineup:has(.tactics-panel){align-items:start}'])assert(css.includes(expected));
 const f=environment(),b=board(f);assert.equal(b.pitch['data-custom-height'],'false');assert.equal(Number(b.pitch.style['--board-pitch-ratio']),680/880);
 const initialState=b.board.getState(),players=json(initialState.players);initialState.tactical={drawings:[],legacy:initialState.drawings,pitch:{width:1200,height:780,color:'#285b3b'}};
 const custom=board(f,{initialState});assert.equal(custom.pitch['data-custom-height'],'true');assert.equal(Number(custom.pitch.style['--board-pitch-ratio']),680/880/(780/650));assert.deepEqual(json(custom.board.getState().players),players);
 const reopened=board(f,{initialState:custom.board.exportDraft()});assert.equal(reopened.pitch.style['--match-pitch-height'],'780px');assert.equal(reopened.pitch['data-custom-height'],'true');
 nodes(reopened.panel).find(n=>n.textContent==='Varsayılana Dön').listeners.click();assert.equal(reopened.pitch['data-custom-height'],'false');assert.equal(reopened.pitch.style['--match-pitch-height'],'650px');
});
