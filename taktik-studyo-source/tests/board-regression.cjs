const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{
 constructor(){this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){},remove(){},toggle(){}};this.value='';this.listeners={};this.nodes={};this.offsetHeight=84;}
 append(...args){this.children.push(...args)}replaceChildren(...args){this.children=args}setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}addEventListener(k,fn){this.listeners[k]=fn}removeEventListener(k,fn){if(this.listeners[k]===fn)delete this.listeners[k]}querySelector(q){return this.nodes[q]??=new Element()}querySelectorAll(){return []}getBoundingClientRect(){return {left:0,top:0,width:400,height:520}}focus(){}getContext(){return this.ctx??={setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}}}setPointerCapture(){}showModal(){this.open=true}close(){this.open=false}before(node){this.placeholder=node;node.origin=this}replaceWith(node){this.replacement=node}cloneNode(){return new Element()}remove(){this.removed=true}
}
const document={body:{dataset:{page:'comparison'},style:{overflow:''},append(){}},createElement:()=>new Element(),createComment:()=>new Element(),documentElement:new Element(),querySelectorAll:()=>[],addEventListener(){}};
const context=vm.createContext({window:{addEventListener(){},scrollBy(){},innerHeight:900},document,setTimeout(){},clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},URLSearchParams});
const dir=require('path').join(__dirname,'../dist/');vm.runInContext(fs.readFileSync(dir+'rosters.js','utf8'),context);
if(process.env.LIVE_CATALOGUE_FILE){const live=JSON.parse(fs.readFileSync(process.env.LIVE_CATALOGUE_FILE,'utf8'));context.window.TAKTIK_TEAMS=live.teams;context.window.TAKTIK_ROSTERS.teams=live.rosters;}
vm.runInContext(fs.readFileSync(dir+'app.js','utf8'),context);
const leftRoot=new Element(),rightRoot=new Element();const left=context.window.createTacticsBoard(leftRoot,{team:'Galatasaray',benchOnly:true}),right=context.window.createTacticsBoard(rightRoot,{team:'Fenerbahçe',benchOnly:true});
const control=(root,id)=>root.querySelector('[data-control="'+id+'"]');
function assertJerseys(board,root){
 const state=board.getState();
 assert.equal(root.style['--team'],state.team.color);assert.equal(root.style['--team2'],state.team.color2);
 assert.equal(root.style['--jersey-number'],context.jerseyNumberColor(state.team.color));
 control(root,'players').children.forEach((marker,i)=>{
  assert.deepEqual(marker.children.map(n=>n.className),['player-jersey','player-name','player-role']);
  assert.equal(marker.children[0].children[0].textContent,state.players[i].number??'–');
  assert.equal(marker.querySelector('.player-name').textContent,state.players[i].name);
  assert.equal(marker.querySelector('.player-role').textContent,state.players[i].role);
  assert.equal(marker.title,state.players[i].name);
  assert.match(marker.children[0].innerHTML,/aria-hidden="true"/);assert.doesNotMatch(marker.children[0].innerHTML,/<img/);
 });
}
assertJerseys(left,leftRoot);assertJerseys(right,rightRoot);
const originalRight=JSON.stringify(right.getState());left.selectTeam('Beşiktaş');left.applyFormation('3-5-2');assert.equal(JSON.stringify(right.getState()),originalRight);
const originalLeft=JSON.stringify(left.getState());right.selectTeam('Trabzonspor');right.applyFormation('4-2-3-1');assert.equal(JSON.stringify(left.getState()),originalLeft);
assertJerseys(left,leftRoot);assertJerseys(right,rightRoot);
control(leftRoot,'players').children[0].listeners.click();
const initial=left.getState(),replacement=context.window.TAKTIK_ROSTERS.teams['Beşiktaş'].players.find(a=>!initial.players.some(p=>p.athleteId===a.id));
control(leftRoot,'rosterSelect').onchange({target:{value:replacement.id}});assert.equal(left.getState().players[0].athleteId,replacement.id);assert.equal(new Set(left.getState().players.map(p=>p.athleteId)).size,11);
const rightAfter=JSON.stringify(right.getState());control(leftRoot,'undo').onclick();assert.equal(left.getState().players[0].athleteId,initial.players[0].athleteId);assert.equal(JSON.stringify(right.getState()),rightAfter);
const beforeDrag=right.getState();const player=control(rightRoot,'players').children[0];player.listeners.pointerdown({button:0,currentTarget:player,clientX:100,clientY:100,pointerId:1});player.listeners.pointermove({clientX:120,clientY:90});assert.notEqual(right.getState().players[0].x,beforeDrag.players[0].x);player.listeners.pointerup({type:'pointerup',clientX:120,clientY:90});assert.equal(left.getState().players[0].x,initial.players[0].x);
assert.throws(()=>left.selectTeam('invalid'));assert.throws(()=>right.applyFormation('99-1'));assert.equal(left.getState().players.length,11);assert.equal(right.getState().players.length,11);
console.log('PASS: independent team and formation changes, roster substitution, undo, drag movement, invalid inputs and two complete squads.');

const mainControls=new Element();document.getElementById=id=>mainControls.querySelector('[data-control="'+id+'"]');const main=context.window.createTacticsBoard(document);main.selectTeam('Samsunspor');main.applyFormation('4-4-2');assert.equal(main.getState().team.name,'Samsunspor');assert.equal(main.getState().players.length,11);console.log('PASS: original single-board editor still initializes and changes team/formation.');

// Dropping on another player exchanges positions and roles without changing identities.
const swapBefore=left.getState(),from=swapBefore.players[1],to=swapBefore.players[2],drag=control(leftRoot,'players').children[1];
const sx=from.x*4,sy=from.y*5.2,tx=to.x*4,ty=to.y*5.2;
drag.listeners.pointerdown({button:0,currentTarget:drag,clientX:sx,clientY:sy,pointerId:2});drag.listeners.pointermove({clientX:tx,clientY:ty,pointerId:2});drag.listeners.pointerup({type:'pointerup',clientX:tx,clientY:ty,pointerId:2});
const swapped=left.getState();assert.equal(swapped.players[1].x,to.x);assert.equal(swapped.players[1].y,to.y);assert.equal(swapped.players[2].x,from.x);assert.equal(swapped.players[2].y,from.y);assert.equal(swapped.players[1].athleteId,from.athleteId);assert.equal(swapped.players[1].role,to.role);
control(leftRoot,'undo').onclick();assert.equal(JSON.stringify(left.getState()),JSON.stringify(swapBefore));
const canceled=control(leftRoot,'players').children[1];canceled.listeners.pointerdown({button:0,currentTarget:canceled,clientX:sx,clientY:sy,pointerId:3});canceled.listeners.pointermove({clientX:sx+20,clientY:sy-20,pointerId:3});canceled.listeners.pointercancel({type:'pointercancel'});assert.equal(JSON.stringify(left.getState()),JSON.stringify(swapBefore));
// Drawing, erasing, cancellation and undo are local to each pitch.
const canvas=control(leftRoot,'drawingCanvas');control(leftRoot,'drawingToggle').onclick();control(leftRoot,'drawingColor').listeners.input({target:{value:'#ff3322'}});
const draw=(id)=>{canvas.listeners.pointerdown({button:0,pointerId:id,clientX:100,clientY:100,preventDefault(){}});canvas.listeners.pointermove({pointerId:id,clientX:160,clientY:160});canvas.listeners.pointerup({type:'pointerup',pointerId:id,clientX:180,clientY:180});};
draw(4);assert.equal(left.getState().drawings.length,1);assert.equal(left.getState().drawings[0].color,'#ff3322');assert.equal(left.getState().drawings[0].points[0].x,.25);assert.equal(right.getState().drawings.length,0);
control(leftRoot,'eraserTool').onclick();draw(5);assert.equal(left.getState().drawings[1].tool,'eraser');assert.equal(left.getState().drawings[1].width,24);assert.equal(left.getState().players[1].athleteId,from.athleteId);
control(leftRoot,'undo').onclick();assert.equal(left.getState().drawings.length,1);control(leftRoot,'undo').onclick();assert.equal(left.getState().drawings.length,0);
control(leftRoot,'penTool').onclick();canvas.listeners.pointerdown({button:0,pointerId:6,clientX:10,clientY:10,preventDefault(){}});canvas.listeners.pointercancel({type:'pointercancel'});assert.equal(left.getState().drawings.length,0);
control(leftRoot,'finishDrawing').onclick();assert.equal(control(leftRoot,'drawingTools').hidden,true);
console.log('PASS: drop swaps positions/roles, identities preserved, drag cancellation, pen color, normalized strokes, eraser, drawing undo/cancel and board isolation.');

// Drag a substitute directly onto a starter, without selecting the starter first.
const beforeBench=left.getState(),slot=beforeBench.players[5];const benchAthlete=context.window.TAKTIK_ROSTERS.teams[beforeBench.team.name].players.find(a=>!beforeBench.players.some(p=>p.athleteId===a.id));
const rosterButton=control(leftRoot,'squadList').children.find(b=>b.dataset.athleteId===benchAthlete.id);
rosterButton.listeners.pointerdown({button:0,currentTarget:rosterButton,clientX:200,clientY:700,pointerId:7,pointerType:'mouse'});
rosterButton.listeners.pointermove({clientX:slot.x*4,clientY:slot.y*5.2,pointerId:7,preventDefault(){}});
rosterButton.listeners.pointerup({type:'pointerup',clientX:slot.x*4,clientY:slot.y*5.2,pointerId:7});
assert.equal(left.getState().players[5].athleteId,benchAthlete.id);assert.equal(left.getState().players[5].x,slot.x);assert.equal(new Set(left.getState().players.map(p=>p.athleteId)).size,11);
assert(!left.getState().players.some(p=>p.athleteId===slot.athleteId));control(leftRoot,'undo').onclick();assert.equal(JSON.stringify(left.getState()),JSON.stringify(beforeBench));
// A canceled/outside drop makes no changes.
const badButton=control(leftRoot,'squadList').children.find(b=>b.dataset.athleteId===benchAthlete.id);badButton.listeners.pointerdown({button:0,currentTarget:badButton,clientX:200,clientY:700,pointerId:8});badButton.listeners.pointermove({clientX:700,clientY:700,pointerId:8});badButton.listeners.pointerup({type:'pointerup',clientX:700,clientY:700,pointerId:8});assert.equal(JSON.stringify(left.getState()),JSON.stringify(beforeBench));
// Expanding uses the live board and filters the side list to reserves only.
const otherBoard=JSON.stringify(right.getState());control(leftRoot,'expandBoard').onclick();assert.equal(control(leftRoot,'expandedDialog').open,true);assert.equal(document.body.style.overflow,'hidden');assert(control(leftRoot,'expandedCenter').children.includes(control(leftRoot,'boardPanel')));
assert(control(leftRoot,'squadList').children.every(b=>!left.getState().players.some(p=>p.athleteId===b.dataset.athleteId)));
const expandedButton=control(leftRoot,'squadList').children.find(b=>b.dataset.athleteId===benchAthlete.id);expandedButton.listeners.pointerdown({button:0,currentTarget:expandedButton,clientX:600,clientY:200,pointerId:9});expandedButton.listeners.pointermove({clientX:slot.x*4,clientY:slot.y*5.2,pointerId:9});expandedButton.listeners.pointerup({type:'pointerup',clientX:slot.x*4,clientY:slot.y*5.2,pointerId:9});
assert.equal(left.getState().players[5].athleteId,benchAthlete.id);assert(control(leftRoot,'squadList').children.some(b=>b.dataset.athleteId===slot.athleteId));
const expandedState=JSON.stringify(left.getState());control(leftRoot,'closeExpanded').onclick();assert.equal(control(leftRoot,'expandedDialog').open,false);assert.equal(document.body.style.overflow,'');assert.equal(JSON.stringify(left.getState()),expandedState);assert.equal(JSON.stringify(right.getState()),otherBoard);assert.equal(control(leftRoot,'boardPanel').placeholder.replacement,control(leftRoot,'boardPanel'));
console.log('PASS: bench drop substitutes at target slot, invalid drops do nothing, undo restores XI, expanded view reuses board and shows only reserves, outgoing player returns to bench, closing preserves state and other board stays unchanged.');

(async()=>{
 const {readDraft,writeDraft}=await import('../src/lib/drafts.js');
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 const pending=new Map();let nextTimer=0;
 context.setTimeout=fn=>{pending.set(++nextTimer,fn);return nextTimer;};context.clearTimeout=id=>pending.delete(id);
 context.window.TAKTIK_DRAFTS={read:k=>readDraft(storage,k),write:(k,s)=>writeDraft(storage,k,s)};
 const flush=()=>{const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn());};
 const aRoot=new Element(),a=context.window.createTacticsBoard(aRoot,{team:'Galatasaray',storageKey:'test:a'});
 const bRoot=new Element(),b=context.window.createTacticsBoard(bRoot,{team:'Fenerbahçe',storageKey:'test:b'});
 a.applyFormation('3-5-2');flush();
 const p=control(aRoot,'players').children[0];p.listeners.keydown({key:'ArrowRight',currentTarget:p,preventDefault(){},repeat:false});flush();
 const canvas=control(aRoot,'drawingCanvas');control(aRoot,'penTool').onclick();canvas.listeners.pointerdown({button:0,pointerId:10,clientX:100,clientY:100,preventDefault(){}});canvas.listeners.pointerup({type:'pointerup',pointerId:10,clientX:110,clientY:110});flush();
 const reloaded=context.window.createTacticsBoard(new Element(),{team:'Beşiktaş',storageKey:'test:a'});
 assert.equal(JSON.stringify(reloaded.getState()),JSON.stringify(a.getState()));
 assert.equal(readDraft(storage,'test:b').team.name,'Fenerbahçe');
 assert.equal(b.getState().formation,'4-3-3');
 const sharedState=a.getState();sharedState.formation='3-2-2-3';
 const shared=context.window.createTacticsBoard(new Element(),{initialState:sharedState,storageKey:'test:shared'});flush();
 assert.equal(shared.getState().formation,'3-2-2-3');assert.equal(readDraft(storage,'test:a').formation,'3-5-2');assert.equal(readDraft(storage,'test:b').team.name,'Fenerbahçe');
 const unusual=structuredClone(sharedState);unusual.team.name='__proto__';
 const unusualBoard=context.window.createTacticsBoard(new Element(),{initialState:unusual,storageKey:'test:unusual'});
 assert.equal(unusualBoard.getState().team.name,'__proto__');
 console.log('PASS: real board state saves and reloads formation, player movement and drawings; comparison drafts remain independent.');

 // Studio and Comparison derive reserves from their own live XI.
 const benchRoot=new Element(),benchBoard=context.window.createTacticsBoard(benchRoot,{benchOnly:true,storageKey:'test:bench'});
 const rosterSnapshot=JSON.stringify(context.window.TAKTIK_ROSTERS);
 function assertReserves(board,root){
  const state=board.getState(),roster=context.window.TAKTIK_ROSTERS.teams[state.team.name].players;
  const expected=roster.filter(a=>!state.players.some(p=>p.athleteId===a.id)).map(a=>a.id);
  assert.equal(JSON.stringify(control(root,'squadList').children.map(b=>b.dataset.athleteId)),JSON.stringify(expected));
  assert.equal(control(root,'squadTitle').textContent,'Yedek Oyuncular');
 }
 assertReserves(benchBoard,benchRoot);
 assertJerseys(benchBoard,benchRoot);
 for(const item of control(benchRoot,'squadList').children){assert.equal(item.children[0].className,'player-jersey');assert.match(item['aria-label'],/numara/);}
 const starter=benchBoard.getState().players[0];
 control(benchRoot,'players').children[0].listeners.click();
 assert.equal(control(benchRoot,'playerName').value,starter.name);
 const reserveButton=control(benchRoot,'squadList').children[0],reserveId=reserveButton.dataset.athleteId;
 reserveButton.onclick();assert.equal(benchBoard.getState().players[0].athleteId,reserveId);assertReserves(benchBoard,benchRoot);
 assert(control(benchRoot,'squadList').children.some(b=>b.dataset.athleteId===starter.athleteId));
 control(benchRoot,'undo').onclick();assert.equal(benchBoard.getState().players[0].athleteId,starter.athleteId);assertReserves(benchBoard,benchRoot);
 benchBoard.applyFormation('3-5-2');assertReserves(benchBoard,benchRoot);
 control(benchRoot,'rosterSelect').onchange({target:{value:reserveId}});assertReserves(benchBoard,benchRoot);
 control(benchRoot,'playerName').value='Edited starter';control(benchRoot,'playerForm').onsubmit({preventDefault(){}});
 assert.equal(benchBoard.getState().players[0].name,'Edited starter');assertReserves(benchBoard,benchRoot);
 flush();const restoredBenchRoot=new Element(),restoredBench=context.window.createTacticsBoard(restoredBenchRoot,{benchOnly:true,storageKey:'test:bench'});
 assert.equal(JSON.stringify(restoredBench.getState()),JSON.stringify(benchBoard.getState()));assertReserves(restoredBench,restoredBenchRoot);
 assertJerseys(restoredBench,restoredBenchRoot);
 benchBoard.selectTeam('Fenerbahçe');assertReserves(benchBoard,benchRoot);
 assert.equal(JSON.stringify(context.window.TAKTIK_ROSTERS),rosterSnapshot);
 assertReserves(left,leftRoot);assertReserves(right,rightRoot);
 console.log('PASS: Studio reserves follow XI swaps, roster replacement, edits, formation, team, undo and draft restore while Comparison sides stay independent and canonical roster data remains unchanged.');

 const {createUserDraftScope,userDraftKey}=await import('../src/lib/draft-scope.js');
 const userA='11111111-1111-4111-8111-111111111111',userB='22222222-2222-4222-8222-222222222222';
 const windowEvents=new Map();
 context.window.addEventListener=(name,fn)=>{if(!windowEvents.has(name))windowEvents.set(name,new Set());windowEvents.get(name).add(fn);};
 context.window.removeEventListener=(name,fn)=>windowEvents.get(name)?.delete(fn);
 const pagehide=()=>{for(const fn of [...(windowEvents.get('pagehide')||[])])fn();};
 const scopedContext=(scope,slot)=>{
  const base=scope.context(slot);
  return {...base,createWriter:options=>base.createWriter({...options,setTimer:context.setTimeout,clearTimer:context.clearTimeout})};
 };
 // Public snapshots ignore legacy shared drafts and install no mutation paths.
 const sharedKey='taktik:draft:shared:'+userA+':v1';
 writeDraft(storage,sharedKey,{...sharedState,formation:'4-4-2'});
 flush(); // Finish unrelated editable-board timers before observing the viewer.
 const oldDraft=saved.get(sharedKey),drafts=context.window.TAKTIK_DRAFTS;
 let reads=0,writes=0,changes=0;
 context.window.TAKTIK_DRAFTS={read(){reads++;return {...sharedState,formation:'4-4-2'};},write(){writes++;}};
 const publicRoot=new Element(),snapshot=JSON.parse(JSON.stringify(sharedState));
 snapshot.players[0].x=37;snapshot.drawings=[{tool:'pen',color:'#ff3322',width:4,points:[{x:.25,y:.3},{x:.75,y:.8}]}];
 const original=JSON.stringify(snapshot),eventsBefore=windowEvents.get('pagehide')?.size||0;
 const publicBoard=context.window.createTacticsBoard(publicRoot,{mode:'readonly',initialState:snapshot,onChange(){changes++;}});
 assert.equal(publicBoard.mode,'readonly');assert.equal(JSON.stringify(publicBoard.getState()),original);
 assertJerseys(publicBoard,publicRoot);
 assert.equal(publicBoard.selectTeam,undefined);assert.equal(publicBoard.applyFormation,undefined);
 assert.equal(publicRoot.listeners.keydown,undefined);
 const viewPlayer=control(publicRoot,'players').children[0],viewCanvas=control(publicRoot,'drawingCanvas');
 assert.equal(viewPlayer.style.left,'37%');assert.equal(viewPlayer['aria-pressed'],undefined);
 for(const target of [viewPlayer,viewCanvas,publicRoot]){
  assert.deepEqual(Object.keys(target.listeners),[]);
  for(const event of ['pointerdown','pointermove','pointerup','touchstart','keydown','click'])
   target.listeners[event]?.({key:'ArrowRight',button:0,pointerId:90,currentTarget:target,clientX:180,clientY:180,preventDefault(){}});
 }
 for(const id of ['teamSearch','squadList','rosterSelect','playerForm','undo','reset','drawingToggle','shareLineup']){
  const node=control(publicRoot,id);assert.equal(node.onclick,undefined);assert.equal(node.onchange,undefined);assert.equal(node.onsubmit,undefined);
 }
 assert.equal(windowEvents.get('pagehide')?.size||0,eventsBefore);
 snapshot.players[0].x=80;publicBoard.getState().players[0].x=90;
 flush();pagehide();assert.equal(JSON.stringify(publicBoard.getState()),original);
 const publicReload=context.window.createTacticsBoard(new Element(),{mode:'readonly',initialState:JSON.parse(original)});
 assert.equal(JSON.stringify(publicReload.getState()),original);
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(changes,0);assert.equal(saved.get(sharedKey),oldDraft);
 publicBoard.dispose();publicReload.dispose();assert.equal(publicRoot.removed,undefined);
 assert.throws(()=>publicBoard.getState(),/Inactive/);
 context.window.TAKTIK_DRAFTS=drafts;
 console.log('PASS: readonly shared snapshots preserve positions/drawings, ignore legacy drafts, expose no mutation APIs/listeners and never persist on pagehide.');
 const pagehideBefore=windowEvents.get('pagehide')?.size||0,resizeBefore=windowEvents.get('resize')?.size||0;
 const scopeA=createUserDraftScope({userId:userA,storage});
 let scopedChanges=0,scopedSchedules=0;
 const draftContextA=scopedContext(scopeA,'main'),createScopedWriter=draftContextA.createWriter;
 draftContextA.createWriter=options=>{
  const writer=createScopedWriter(options);
  return {...writer,schedule(){scopedSchedules++;writer.schedule();}};
 };
 const scopedRootA=new Element(),scopedA=context.window.createTacticsBoard(scopedRootA,{draftContext:draftContextA,onChange:()=>scopedChanges++});
 scopedA.applyFormation('4-4-2');flush();
 const savedA=saved.get(userDraftKey(userA,'main'));
 scopedA.applyFormation('3-5-2');const staleCallbacks=[...pending.values()];
 // Account disposal also cancels an active gesture and restores expanded layout.
 control(scopedRootA,'expandBoard').onclick();
 const dragging=control(scopedRootA,'players').children[0];
 dragging.listeners.pointerdown({button:0,currentTarget:dragging,clientX:100,clientY:100,pointerId:30});
 dragging.listeners.pointermove({clientX:120,clientY:90,pointerId:30});
 const changesBeforeDispose=scopedChanges,schedulesBeforeDispose=scopedSchedules;
 scopeA.dispose();
 assert.notEqual(scopedRootA.removed,true);assert.equal(scopedRootA.children.length,0);
 assert.equal(scopedChanges,changesBeforeDispose);assert.equal(scopedSchedules,schedulesBeforeDispose);
 assert.equal(scopedRootA.listeners.keydown,undefined);
 for(const event of ['pointermove','pointerup','pointercancel','lostpointercapture'])assert.equal(dragging.listeners[event],undefined);
 assert.equal(control(scopedRootA,'expandedDialog').open,false);assert.equal(document.body.style.overflow,'');
 assert.equal(windowEvents.get('pagehide').size,pagehideBefore);assert.equal(windowEvents.get('resize').size,resizeBefore);
 assert.throws(()=>scopedA.getState());assert.throws(()=>scopedA.applyFormation('4-3-3'));
 const scopeB=createUserDraftScope({userId:userB,storage});
 const scopedB=context.window.createTacticsBoard(new Element(),{draftContext:scopedContext(scopeB,'main')});
 assert.equal(scopedB.getState().formation,'4-3-3');
 scopedB.applyFormation('5-3-2');staleCallbacks.forEach(fn=>fn());flush();pagehide();
 assert.equal(saved.get(userDraftKey(userA,'main')),savedA);
 assert.equal(readDraft(storage,userDraftKey(userB,'main')).formation,'5-3-2');
 const leftScoped=context.window.createTacticsBoard(new Element(),{draftContext:scopedContext(scopeB,'left')});
 const rightScoped=context.window.createTacticsBoard(new Element(),{draftContext:scopedContext(scopeB,'right')});
 leftScoped.applyFormation('3-4-3');rightScoped.applyFormation('4-2-3-1');flush();
 assert.equal(readDraft(storage,userDraftKey(userB,'left')).formation,'3-4-3');
 assert.equal(readDraft(storage,userDraftKey(userB,'right')).formation,'4-2-3-1');
 scopeB.dispose();assert.equal(windowEvents.get('pagehide').size,pagehideBefore);
 assert.equal(windowEvents.get('resize').size,resizeBefore);
 assert.throws(()=>context.window.createTacticsBoard(new Element(),{draftContext:null}));
 assert.throws(()=>context.window.createTacticsBoard(document,{draftContext:scopeB.context('main')}));
 assert.equal(saved.has('taktik:draft:anonymous:main:v2'),false);
 console.log('PASS: scoped real boards isolate accounts/slots and dispose timers, pagehide, root/resize listeners, gestures and expanded UI.');

 // Exercise the actual new route mount APIs with the real board engine.
 const createBoard=context.window.createTacticsBoard,editorModes=[],benchModes=[];
 context.window.createTacticsBoard=(root,options)=>{editorModes.push(options.mode);benchModes.push(!!options.benchOnly);return createBoard(root,options);};
 const nodes=new Map();document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
 document.getElementById('studioTemplate').content=new Element();
 const routedRoot=new Element(),routedScope=createUserDraftScope({userId:userA,storage});
 const stopStudio=context.window.TAKTIK_APP.mountStudio(routedRoot,{context:slot=>scopedContext(routedScope,slot)});
 assert.deepEqual(editorModes,['edit']);
 assert.deepEqual(benchModes,[true]);
 assert.equal(control(routedRoot,'activeTeam').textContent,readDraft(storage,userDraftKey(userA,'main')).team.name);
 control(routedRoot,'resetPositions').onclick?.();
 stopStudio();assert.equal(routedRoot.children.length,0);routedScope.dispose();
 context.window.createTacticsBoard=createBoard;
 console.log('PASS: Studio route mount API restores user drafts, preserves controls and clean up without automatic bootstrap.');

})().catch(error=>{console.error(error);process.exitCode=1;});
