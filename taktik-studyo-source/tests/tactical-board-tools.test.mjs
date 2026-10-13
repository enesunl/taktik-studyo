import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classicFixture,control} from './helpers/classic-board-fixture.mjs';
import {readDraft,writeDraft} from '../src/lib/drafts.js';
import {shareValid,toShare} from '../src/lib/validation.js';
import {createUserDraftScope} from '../src/lib/draft-scope.js';
const json=v=>JSON.parse(JSON.stringify(v)),nodes=n=>[n,...n.children.flatMap(nodes)];
function fixture(options={}){
 const f=classicFixture(),a=f.create({tacticalWorkspace:true,...options}),pitch=control(a.root,'pitch'),panel=control(a.root,'tacticalToolsPanel');
 const button=(kind,value)=>nodes(panel).find(n=>n.dataset[kind]===value),choose=(kind,value)=>button(kind,value).listeners.click();
 const input=pitch.children.find(n=>n.className==='match-drawing-input');
 const event=(type,x=.2,y=.3)=>({type,button:0,pointerId:1,clientX:x*400,clientY:y*520,preventDefault(){this.defaultPrevented=true;}});
 const draw=(type='line')=>{choose('tool',type);input.listeners.pointerdown(event('pointerdown'));input.listeners.pointermove(event('pointermove',.4,.5));input.listeners.pointerup(event('pointerup',.6,.7));};
 return {...f,...a,pitch,panel,input,button,choose,event,draw,objects:()=>a.board.getState().tactical?.drawings||[],players:()=>json(a.board.getState().players)};
}
test('TB2 directly mounts shared Studio tools and all five groups, colors and widths',()=>{
 const f=fixture();assert.deepEqual(nodes(f.panel).filter(n=>n.dataset.tool).map(n=>n.textContent),['Seç','Koşu','Pas','Çizgi','Kalem','Alan','Çember','Sil']);
 assert.deepEqual(f.panel.children[0].children[0].children.map(n=>n.children[0].textContent),['Araçlar','Çizim rengi','Çizgi kalınlığı','Saha','Geçmiş']);
 assert.deepEqual(nodes(f.panel).filter(n=>n.dataset.color).map(n=>n.textContent),['Beyaz','Sarı','Kırmızı','Mavi']);
 assert.deepEqual(nodes(f.panel).filter(n=>n.dataset.width).map(n=>n.textContent),['İnce','Orta','Kalın']);
 assert.equal(f.button('tool','select')['aria-pressed'],'true');f.choose('color','blue');f.choose('width','thick');f.draw();
 assert.equal(f.objects()[0].color,'blue');assert.equal(f.objects()[0].width,'thick');
});
for(const tool of ['movement-arrow','pass-arrow','line','freehand','zone','circle'])test('TB2 '+tool+' uses normalized Studio objects and drawing-only undo/redo/clear',()=>{
 const f=fixture(),players=f.players();f.draw(tool);assert.equal(f.objects().length,1);assert.equal(f.objects()[0].type,tool);
 const saved=json(f.objects());f.choose('action','undo');assert.equal(f.objects().length,0);f.choose('action','redo');assert.deepEqual(json(f.objects()),saved);
 f.choose('action','clear');assert.equal(f.objects().length,0);assert.deepEqual(f.players(),players);f.choose('action','undo');assert.deepEqual(json(f.objects()),saved);
 f.board.applyFormation('4-4-2');assert.deepEqual(json(f.objects()),saved);assert.notDeepEqual(f.players(),players);
 f.choose('action','clear');control(f.root,'undo').onclick();assert.equal(f.objects().length,0);assert.deepEqual(f.players(),players);
});
test('TB2 eraser removes a hit object and history restores it',()=>{
 const f=fixture();f.draw();f.choose('tool','eraser');f.input.listeners.pointerdown(f.event('pointerdown',.4,.5));f.input.listeners.pointerup(f.event('pointerup',.4,.5));
 assert.equal(f.objects().length,0);f.choose('action','undo');assert.equal(f.objects().length,1);
});
test('TB2 drawing priority blocks player click, keyboard, drag and substitution; Select restores them',()=>{
 const f=fixture(),players=control(f.root,'players'),marker=players.children[2],action=players.children[3],before=f.players();
 f.choose('tool','zone');marker.listeners.click();marker.listeners.keydown({key:'ArrowRight',currentTarget:marker,preventDefault(){}});marker.listeners.pointerdown({...f.event('pointerdown'),currentTarget:marker});action.onclick();
 assert.deepEqual(f.players(),before);const dialog=f.root.children.find(n=>n.className==='substitution-dialog');assert(!dialog.open);assert.equal(control(f.root,'playerForm').hidden,true);
 f.choose('tool','select');marker.listeners.click();assert.equal(control(f.root,'playerForm').hidden,false);action.onclick();assert(dialog.open);
 f.choose('tool','line');assert.equal(f.button('tool','select')['aria-pressed'],'true');f.input.listeners.pointerdown(f.event('pointerdown'));assert.equal(f.input.listeners.pointermove,undefined);assert.equal(f.objects().length,0); // modal owns interaction
 dialog.children[4].onclick();f.draw();assert.equal(f.objects().length,1);
 f.root.listeners.keydown({key:'Escape',preventDefault(){this.defaultPrevented=true;}});assert.equal(f.button('tool','select')['aria-pressed'],'true');
});
test('TB2 hides pitch size controls but preserves saved dimensions, color, reset and XI/drawings',()=>{
 const base=classicFixture().create().board.getState();base.tactical={drawings:[],legacy:base.drawings,pitch:{width:1000,height:800,color:'#285b3b'}};
 const f=fixture({initialState:base});f.draw();const players=f.players(),objects=json(f.objects()),all=nodes(f.panel),color=all.find(n=>n.className==='match-pitch-color');
 assert.equal(all.some(n=>n.type==='range'||n.className==='match-size-label'||['Saha genişliği','Saha yüksekliği'].includes(n['aria-label'])),false);
 color.value='#123456';color.listeners.input();
 assert.deepEqual(json(f.board.getState().tactical.pitch),{width:1000,height:800,color:'#123456'});assert.equal(f.pitch.style['--match-pitch-width'],'1000px');assert.equal(f.pitch.style['--match-pitch-height'],'800px');assert.equal(f.pitch.style['--match-pitch-background'],'#123456');assert(Number(f.pitch.style['--board-pitch-ratio'])>0);
 all.find(n=>n.textContent==='Varsayılana Dön').listeners.click();assert.deepEqual(json(f.board.getState().tactical.pitch),{width:1200,height:650,color:'#285b3b'});assert.deepEqual(f.players(),players);assert.deepEqual(json(f.objects()),objects);
});
test('TB2 old canvas draft is retained exactly; clear/undo covers legacy + new drawings; local reload retains exact objects',()=>{
 const base=classicFixture().create().board.getState();base.drawings=[{tool:'pen',color:'#123456',width:4,points:[{x:.1,y:.1},{x:.7,y:.5}]},{tool:'eraser',color:'#ffffff',width:24,points:[{x:.2,y:.2}]}];
 const f=fixture({initialState:base});f.draw('pass-arrow');assert.deepEqual(json(f.board.getState().tactical.legacy),json(base.drawings));
 f.choose('action','clear');assert.equal(f.board.getState().drawings.length,0);f.choose('action','undo');assert.equal(f.objects().length,1);assert.deepEqual(json(f.board.getState().tactical.legacy),json(base.drawings));
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};assert(writeDraft(storage,'test',f.board.getState()));
 const saved=readDraft(storage,'test'),reopened=fixture({initialState:saved});assert.deepEqual(json(reopened.board.getState()),json(saved));assert(shareValid(toShare(saved)));
 for(const mutate of [s=>s.tactical.pitch.width=0,s=>s.tactical.pitch.color='url(x)',s=>s.tactical.drawings[0].geometry.start.x=Infinity,s=>s.tactical.legacy[0].points[0].x=-1]){const bad=json(saved);mutate(bad);assert.equal(writeDraft(storage,'bad',bad),false);}
});
test('TB2 scoped disposal cancels active drawing and removes listeners without writing or player mutation',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)},scope=createUserDraftScope({userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',storage});
 const f=fixture({draftContext:scope.context('main')});f.choose('tool','line');f.input.listeners.pointerdown(f.event('pointerdown'));assert(f.input.listeners.pointermove);
 f.board.dispose();assert.equal(f.input.listeners.pointermove,undefined);assert.equal(f.input.listeners.pointerdown,undefined);assert.equal(f.root.children.length,0);assert.throws(()=>f.board.getState());scope.dispose();
});
test('TB2 stylesheet sharing and portrait sizing are scoped, theme-aware and avoid viewport overflow',()=>{
 const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert.match(read('dist/studyo.html'),/href="tactical-tools.css"/);assert.match(read('dist/match-studio.css'),/@import url\("tactical-tools.css"\)/);
 assert.match(read('dist/tactical-tools.css'),/repeat\(2,minmax\(0,1fr\)\)/);assert.match(read('dist/tactical-tools.css'),/var\(--control-bg\)/);
 assert.match(read('dist/styles.css'),/\.pitch\.tactical-pitch\{width:min\(100%,var\(--board-pitch-width/);
});
