import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DRAWING_TYPES,DRAWING_COLORS,DRAWING_WIDTHS,HISTORY_LIMIT,OBJECT_LIMIT,POINT_LIMIT,createDrawingHistory,drawingObject,hitDrawing,renderDrawing} from '../src/lib/tactical-drawings.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {createMatchLayout} from '../src/lib/match-layout.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {detail} from './helpers/match-detail-fixture.mjs';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';

function fixture(){
  const f=matchBoardDocument(),root=f.nodes.matchStudioContent,source=detail(),model=createMatchLayout(source);let current=true;
  const toolbarHost=f.document.createElement('div'),board=createMatchBoard({root,document:f.document,model,utils:f.utils,toolbarHost,current:()=>current});
  const nodes=()=>[...allNodes(root),...allNodes(toolbarHost)];
  const find=cls=>nodes().find(n=>n.className===cls),input=find('match-drawing-input'),pitch=find('match-pitch');
  const button=(kind,value)=>nodes().find(n=>n.dataset[kind]===value),choose=(kind,value)=>fire(button(kind,value),'click');
  const at=(x,y)=>{const r=pitch.getBoundingClientRect();return {clientX:r.left+x*r.width,clientY:r.top+y*r.height};};
  const draw=(type,start=[.2,.3],end=[.6,.7])=>{choose('tool',type);fire(input,'pointerdown',at(...start));fire(input,'pointermove',at(...end));fire(input,'pointerup',at(...end));};
  return {...f,root,source,model,toolbarHost,board,nodes,find,input,pitch,button,choose,at,draw,objects:()=>board.getDrawings().objects,stop:()=>{current=false;},markers:nodes().filter(n=>n.className==='match-player')};
}
const make=(type='line',overrides={})=>drawingObject({id:'d1',type,color:'yellow',width:'medium',start:{x:.2,y:.3},end:{x:.6,y:.7},points:[{x:.2,y:.3},{x:.4,y:.5}],...overrides});

test('default Select, one pressed tool, accessible controls and Escape return player control',()=>{
  const f=fixture();assert.equal(f.board.getDrawings().tool,'select');assert.equal(f.input.tabIndex,-1);
  fire(f.input,'pointerdown',f.at(.2,.3));fire(f.input,'pointerup',f.at(.6,.7));assert.equal(f.objects().length,0);
  assert.equal(f.find('match-tactical-trigger'),undefined);assert.equal(f.find('match-tactical-tray').hidden,false);
  for(const tool of ['movement-arrow','pass-arrow','zone']){
    f.choose('tool',tool);assert.equal(f.board.getDrawings().tool,tool);
    assert.equal(f.nodes().filter(n=>n.dataset.tool&&n.attrs['aria-pressed']==='true').length,1);
  }
  assert.equal(f.find('match-tactical-tray').dataset.activeLabel,'Alan');
  f.nodes().filter(n=>n.dataset.tool||n.dataset.color||n.dataset.width).forEach(n=>{assert.ok(n.attrs['aria-label']);assert.ok(n.title);assert.ok(['true','false'].includes(n.attrs['aria-pressed']));});
  fire(f.root,'keydown',{key:'Escape'});assert.equal(f.board.getDrawings().tool,'select');assert.equal(f.find('match-tactical-tray').hidden,false);assert.equal(f.button('tool','select').focused,true);f.board.dispose();
});
for(const type of DRAWING_TYPES)test(type+' gesture commits one normalized object only at completion',()=>{
  const f=fixture();f.choose('tool',type);fire(f.input,'pointerdown',f.at(.2,.3));fire(f.input,'pointermove',f.at(.6,.7));
  assert.equal(f.objects().length,0);assert.equal(f.board.getDrawings().undoCount,0);assert.equal(f.find('match-drawings').children[1].children.length,1);
  fire(f.input,'pointerup',f.at(.6,.7));const o=f.objects()[0];assert.equal(o.type,type);assert.equal(o.color,'yellow');assert.equal(o.width,'medium');assert.equal(f.objects().length,1);
  if(['zone','circle'].includes(type)){assert.ok(o.geometry.width>0);assert.ok(o.geometry.height>0);}else if(type==='freehand')assert.ok(o.geometry.points.length>=2);else assert.deepEqual(o.geometry,{start:{x:.2,y:.3},end:{x:.6,y:.7}});
  assert.equal(f.find('match-drawings').children[1].children.length,0);assert.equal(f.input.capture,null);f.board.dispose();
});
test('pass is dashed with solid arrowhead; movement solid; line has no arrowhead',()=>{
  const f=fixture(),pass=renderDrawing(f.document,make('pass-arrow')),run=renderDrawing(f.document,make('movement-arrow')),line=renderDrawing(f.document,make('line'));
  assert.equal(pass.children.length,2);assert.equal(pass.children[0].attrs['stroke-dasharray'],'12 9');assert.equal(pass.children[1].attrs['stroke-dasharray'],undefined);
  assert.equal(run.children.length,2);assert.equal(run.children[0].attrs['stroke-dasharray'],undefined);assert.equal(line.children.length,1);f.board.dispose();
});
test('reverse zone/circle gestures normalize positive geometry; zone translucent and circle unfilled',()=>{
  const f=fixture();for(const type of ['zone','circle']){
    f.draw(type);const before=f.objects().at(-1).geometry;f.draw(type,[.6,.7],[.2,.3]);assert.deepEqual(f.objects().at(-1).geometry,before);
    const svg=renderDrawing(f.document,f.objects().at(-1));assert.equal(svg.children[0].tagName,type==='zone'?'rect':'ellipse');assert.equal(svg.attrs.fill,'none');
    if(type==='zone')assert.equal(svg.children[0].attrs['fill-opacity'],'0.16');
  }f.board.dispose();
});
test('tiny click, pointercancel, lost capture, Escape, tool switch and reset discard preview',()=>{
  const f=fixture();for(const type of DRAWING_TYPES){f.draw(type,[.2,.3],[.2001,.3001]);assert.equal(f.objects().length,0);}
  for(const cancel of [()=>fire(f.input,'pointercancel'),()=>fire(f.input,'lostpointercapture'),()=>fire(f.root,'keydown',{key:'Escape'}),()=>f.choose('tool','select'),()=>f.board.reset()]){
    f.choose('tool','movement-arrow');fire(f.input,'pointerdown',f.at(.2,.3));fire(f.input,'pointermove',f.at(.6,.7));cancel();
    assert.equal(f.objects().length,0);assert.equal(f.board.getDrawings().undoCount,0);assert.equal(f.input.capture,null);assert.equal(f.find('match-drawings').children[1].children.length,0);
    for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])assert.equal(f.input.listeners.get(type).size,0);
  }f.board.dispose();
});
test('freehand samples thousands of pointer events, stays bounded and retains endpoints',()=>{
  const f=fixture();f.choose('tool','freehand');fire(f.input,'pointerdown',f.at(.1,.2));
  for(let i=1;i<=3000;i++)fire(f.input,'pointermove',f.at(.1+i*.0002,.4+Math.sin(i/10)*.2));
  fire(f.input,'pointerup',f.at(.9,.8));const points=f.objects()[0].geometry.points;assert.ok(points.length<=POINT_LIMIT);assert.ok(points.length>2);assert.deepEqual(points[0],{x:.1,y:.2});assert.deepEqual(points.at(-1),{x:.9,y:.8});assert.equal(f.objects().length,1);f.board.dispose();
});
test('eraser hit tests every object type, ellipse outline, arrowhead and topmost overlap',()=>{
  for(const type of DRAWING_TYPES){const o=make(type),p=type==='circle'?{x:.6,y:.5}:{x:.4,y:.5};assert.equal(hitDrawing([o],p),o.id);assert.equal(hitDrawing([o],{x:.99,y:.99}),null);}
  assert.equal(hitDrawing([make('circle')],{x:.4,y:.5}),null);
  const f=fixture(),arrow=make('movement-arrow'),svg=renderDrawing(f.document,arrow),[head]=svg.children[1].attrs.points.split(' '),[x,y]=head.split(',').map(Number);assert.equal(hitDrawing([arrow],{x:x/1000,y:y/625},1),arrow.id);f.board.dispose();
  const older=make('zone',{id:'older'}),newer=make('zone',{id:'newer'});assert.equal(hitDrawing([older,newer],{x:.4,y:.5}),'newer');
});
test('erase only zone preserves players, arrow/circle; undo/redo/clear are drawing-only',()=>{
  const f=fixture(),initial=f.board.getState().players;
  f.draw('movement-arrow',[.05,.05],[.15,.15]);f.draw('zone',[.3,.3],[.5,.5]);f.draw('circle',[.7,.7],[.9,.9]);
  const originals=f.objects();f.choose('tool','eraser');fire(f.input,'pointerdown',f.at(.4,.4));fire(f.input,'pointerup',f.at(.4,.4));assert.deepEqual(f.objects().map(o=>o.type),['movement-arrow','circle']);assert.deepEqual(f.board.getState().players,initial);
  f.choose('action','undo');assert.deepEqual(f.objects(),originals);f.choose('action','redo');assert.equal(f.objects().length,2);
  f.choose('action','clear');assert.equal(f.objects().length,0);f.choose('action','undo');assert.equal(f.objects().length,2);assert.deepEqual(f.board.getState().players,initial);f.board.dispose();
});
test('add arrow, add zone, erase arrow, undo, undo, redo and new branch have stable ids',()=>{
  const h=createDrawingHistory(),arrow=make('movement-arrow',{id:'a'}),zone=make('zone',{id:'z'});h.add(arrow);h.add(zone);h.erase('a');
  h.undo();assert.deepEqual(h.snapshot().objects,[arrow,zone]);h.undo();assert.deepEqual(h.snapshot().objects,[arrow]);h.redo();assert.deepEqual(h.snapshot().objects,[arrow,zone]);
  h.undo();h.add(make('line',{id:'new'}));assert.equal(h.redo(),false);const snapshot=h.snapshot();snapshot.objects[0].geometry.start.x=999;assert.equal(h.snapshot().objects[0].geometry.start.x,.2);
});
test('history, object count and freehand memory are bounded; caller mutation never changes history',()=>{
  const h=createDrawingHistory();for(let i=0;i<OBJECT_LIMIT;i++)assert.equal(h.add(make('line',{id:String(i)})),true);
  assert.equal(h.add(make()),false);assert.equal(h.snapshot().undoCount,HISTORY_LIMIT);
  for(let i=0;i<HISTORY_LIMIT+2;i++)h.undo();assert.equal(h.snapshot().redoCount,HISTORY_LIMIT);assert.equal(h.snapshot().objects.length,OBJECT_LIMIT-HISTORY_LIMIT);
  for(let i=0;i<HISTORY_LIMIT+2;i++)h.redo();assert.equal(h.snapshot().undoCount,HISTORY_LIMIT);assert.equal(h.snapshot().objects.length,OBJECT_LIMIT);
});
test('all four colors and three widths render semantically and never mutate old objects',()=>{
  const f=fixture();for(const color of Object.keys(DRAWING_COLORS))for(const width of Object.keys(DRAWING_WIDTHS)){
    const old=f.objects();f.choose('color',color);f.choose('width',width);f.draw('line');const o=f.objects().at(-1),svg=renderDrawing(f.document,o);
    assert.equal(o.color,color);assert.equal(o.width,width);assert.equal(svg.attrs.stroke,DRAWING_COLORS[color]);assert.equal(svg.attrs['stroke-width'],String(DRAWING_WIDTHS[width]));assert.deepEqual(f.objects().slice(0,-1),old);
  }assert.equal(f.objects().length,12);f.board.dispose();
});
test('coordinates use actual pitch bounds at origin, page offset, scrolled mobile and resized layout',()=>{
  const f=fixture();for(const rect of [{left:0,top:0,width:1440,height:900},{left:150,top:350,width:1024,height:640},{left:-410,top:120,width:800,height:500}]){
    f.pitch.getBoundingClientRect=()=>rect;f.draw('line',[.7,.2],[.9,.8]);const o=f.objects().at(-1);assert.ok(Math.abs(o.geometry.start.x-.7)<1e-12);assert.ok(Math.abs(o.geometry.end.x-.9)<1e-12);
    const svg=renderDrawing(f.document,o),coords=svg.children[0].attrs.points.split(/[ ,]/).map(Number);[700,125,900,500].forEach((expected,i)=>assert.ok(Math.abs(coords[i]-expected)<1e-9));
  }
  const before=f.objects();f.pitch.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:750});assert.deepEqual(f.objects(),before);
  f.draw('line',[-1,-1],[2,2]);assert.deepEqual(f.objects().at(-1).geometry,{start:{x:0,y:0},end:{x:1,y:1}});f.board.dispose();
});
test('drawing blocks player click, keyboard, drag and stale reserve controls; Select restores swaps/bench',()=>{
  const f=fixture(),initial=f.board.getState().players;fire(f.markers[0],'click');const reserve=f.find('match-reserve');
  f.choose('tool','line');assert.equal(f.find('match-bench').hidden,true);
  for(const type of ['click','pointerdown','keydown'])fire(f.markers[0],type,{key:'ArrowRight'});fire(f.markers[0],'pointerup',{clientX:800});fire(reserve,'click');
  assert.equal(f.board.getState().selected,null);assert.deepEqual(f.board.getState().players,initial);
  f.draw('line');f.choose('tool','select');fire(f.markers[0],'keydown',{key:'ArrowRight'});assert.equal(f.board.getState().players[0].x,initial[0].x+1);
  const b=initial[1];fire(f.markers[0],'pointerdown',f.at((initial[0].x+1)/100,initial[0].y/100));fire(f.markers[0],'pointerup',f.at(b.x/100,b.y/100));assert.equal(f.board.getState().players[0].y,b.y);
  fire(f.markers[1],'click');assert.equal(f.find('match-bench').hidden,false);const incoming=f.find('match-reserve'),key=incoming.dataset.playerKey;fire(incoming,'click');assert.equal(f.board.getState().players[1].key,key);assert.equal(f.objects().length,1);f.board.dispose();
});
test('switch to drawing cancels active player gesture; formation reset preserves drawings and clear preserves replacement',()=>{
  const f=fixture(),initial=f.board.getState();fire(f.markers[0],'pointerdown');fire(f.markers[0],'pointermove',{clientX:800,clientY:300});f.choose('tool','zone');assert.deepEqual(f.board.getState().players,initial.players);assert.equal(f.markers[0].capture,null);
  f.draw('zone');const drawings=f.objects();f.choose('tool','select');fire(f.markers[1],'click');fire(f.find('match-reserve'),'click');const replaced=f.board.getState().players;
  f.choose('action','clear');assert.deepEqual(f.board.getState().players,replaced);f.choose('action','undo');f.board.reset();assert.deepEqual(f.objects(),drawings);assert.deepEqual(f.board.getState(),initial);f.board.dispose();
});
test('Select restores reserve drag and keyboard swap; switching to drawing cancels an active reserve drag',()=>{
  const f=fixture();f.draw('line');f.choose('tool','select');const initial=f.board.getState().players;
  fire(f.markers[0],'click');let reserve=f.find('match-reserve');fire(reserve,'pointerdown',{clientX:50,clientY:900});fire(reserve,'pointermove',f.at(.3,.4));f.choose('tool','circle');
  assert.equal(reserve.capture,null);assert.deepEqual(f.board.getState().players,initial);assert.equal(f.find('match-bench').hidden,true);
  f.choose('tool','select');fire(f.markers[0],'click');reserve=f.find('match-reserve');const incoming=reserve.dataset.playerKey;
  fire(reserve,'pointerdown',{clientX:50,clientY:900});fire(reserve,'pointerup',f.at(initial[1].x/100,initial[1].y/100));assert.equal(f.board.getState().players[1].key,incoming);
  fire(f.markers[0],'click');fire(f.markers[1],'keydown',{key:'Enter',shiftKey:true});assert.equal(f.board.getState().players[0].x,initial[1].x);assert.equal(f.objects().length,1);f.board.dispose();
});
test('eraser cancel changes nothing, outside hit changes nothing and object IDs are not reused after undo',()=>{
  const f=fixture();f.draw('zone');const before=f.objects();f.choose('tool','eraser');fire(f.input,'pointerdown',f.at(.4,.5));fire(f.input,'pointercancel');assert.deepEqual(f.objects(),before);
  fire(f.input,'pointerdown',f.at(.95,.95));fire(f.input,'pointerup',f.at(.95,.95));assert.deepEqual(f.objects(),before);
  f.choose('action','undo');f.draw('line');assert.notEqual(f.objects()[0].id,before[0].id);assert.equal(f.board.getDrawings().redoCount,0);f.board.dispose();
});
test('shortcuts local to board/toolbar ignore editing fields, Delete and Backspace',()=>{
  const f=fixture();f.draw('zone');
  for(const target of [{tagName:'INPUT'},{tagName:'textarea'},{tagName:'select'},{tagName:'div',isContentEditable:true}])fire(f.root,'keydown',{key:'z',ctrlKey:true,target});
  for(const key of ['Delete','Backspace'])fire(f.root,'keydown',{key});assert.equal(f.objects().length,1);assert.equal(f.window.listeners.get('keydown'),undefined);
  fire(f.root,'keydown',{key:'z',ctrlKey:true});assert.equal(f.objects().length,0);fire(f.toolbarHost,'keydown',{key:'Z',metaKey:true,shiftKey:true});assert.equal(f.objects().length,1);
  fire(f.root,'keydown',{key:'z',metaKey:true});fire(f.root,'keydown',{key:'y',ctrlKey:true});assert.equal(f.objects().length,1);f.board.dispose();
});
test('unrelated pointers ignored, stale account/dispose cancels preview and removes all listeners/capture',()=>{
  const f=fixture();f.choose('tool','line');fire(f.input,'pointerdown',f.at(.2,.3));fire(f.input,'pointerup',{...f.at(.6,.7),pointerId:2});assert.equal(f.objects().length,0);assert.equal(f.input.capture,1);
  f.stop();fire(f.input,'pointermove',f.at(.6,.7));assert.equal(f.input.capture,null);assert.equal(f.objects().length,0);
  const nodes=f.nodes();f.board.dispose();assert.equal(f.root.children.length,0);assert.equal(f.toolbarHost.children.length,0);
  for(const n of nodes)for(const handlers of n.listeners.values())assert.equal(handlers.size,0);
});
test('mobile input/pan is mode-local, SVG layers clipped and tools have an independent workspace row',()=>{
  const css=readFileSync(new URL('../dist/match-studio.css',import.meta.url),'utf8'),f=fixture();
  assert.match(css,/\.match-drawing-input\{[^}]*pointer-events:none;touch-action:auto/);assert.match(css,/\.match-pitch.is-drawing \.match-drawing-input\{[^}]*touch-action:none/);
  assert.match(css,/grid-template-columns:204px minmax\(0,1fr\)/);assert.match(css,/max-height:160px;overflow:auto/);assert.match(css,/overflow-x:auto/);assert.match(css,/min-height:44px/);
  assert.match(css,/\.match-pitch-lines\{z-index:0\}/);assert.match(css,/\.match-drawings\{[^}]*z-index:1/);assert.match(css,/\.match-pitch-players\{z-index:2\}/);assert.match(css,/\.match-drawing-input\{[^}]*z-index:4/);
  let prevented=false;fire(f.input,'pointerdown',{...f.at(.2,.3),pointerType:'touch',preventDefault(){prevented=true;}});assert.equal(prevented,false);
  f.choose('tool','line');fire(f.input,'pointerdown',{...f.at(.2,.3),pointerType:'touch',preventDefault(){prevented=true;}});assert.equal(prevented,true);fire(f.input,'pointercancel');f.choose('tool','select');assert.doesNotMatch(f.pitch.className,/is-drawing/);f.board.dispose();
});
test('all mounted tactical interactions leave load count at one, never access storage or mutate source',async()=>{
  const f=matchBoardDocument(),full=detail(),before=JSON.stringify(full);let requests=0;
  const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,api:{load:async()=>{requests++;return{ok:true,match:full};}}});await page.ready;
  const root=f.nodes.matchStudioContent,nodes=allNodes(root),input=nodes.find(n=>n.className==='match-drawing-input');
  for(const type of DRAWING_TYPES){fire(nodes.find(n=>n.dataset.tool===type),'click');fire(input,'pointerdown',{clientX:200,clientY:200});fire(input,'pointerup',{clientX:600,clientY:500});}
  fire(nodes.find(n=>n.dataset.tool==='eraser'),'click');fire(input,'pointerdown',{clientX:400,clientY:350});fire(input,'pointerup',{clientX:400,clientY:350});
  for(const action of ['undo','redo','clear'])fire(nodes.find(n=>n.dataset.action===action),'click');fire(nodes.find(n=>n.textContent==='Kaynak Dizilişe Dön'),'click');
  assert.equal(requests,1);assert.equal(JSON.stringify(full),before);page.dispose();
});
