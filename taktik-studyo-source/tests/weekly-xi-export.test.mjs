import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {createWeeklyGraphic,weeklyPalette,WEEKLY_EXPORT,renderWeeklyPNG,downloadWeeklyPNG,fitWeeklyLabel,weeklyWeekText} from '../src/lib/weekly-xi-export.js';
import {mountWeeklyPreview} from '../src/lib/weekly-xi-preview.js';
import {mountWeeklyXI} from '../src/lib/weekly-xi-ui.js';
import {emptyWeeklyXI,pickWeeklyPlayer,changeWeeklyFormation,moveWeeklySlot} from '../src/lib/weekly-xi.js';
import {exportFixture,serialize,ExportNode} from './helpers/weekly-export-fixture.mjs';
import {allNodes,textOf,deferred,tick} from './helpers/matches-fixture.mjs';
import {fire} from './helpers/match-board-fixture.mjs';
const player={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',teamId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Çağlar Söyüncü — çok uzun oyuncu ismi',teamName:'Fenerbahçe',number:4,positionGroup:'D',specificPosition:'CB',color:'#19294d',color2:'#f3d233'};
const filled=()=>pickWeeklyPlayer(emptyWeeklyXI(),1,player);
const graphic=(f,state=filled())=>createWeeklyGraphic({document:f.document,utils:f.utils,state,palette:weeklyPalette(f.document,f.window)});
const find=(root,cls)=>allNodes(root).find(n=>n.className===cls||n.attrs.class===cls);
const button=(root,text)=>allNodes(root).find(n=>n.tagName==='button'&&n.textContent===text);

test('editor, preview and encoded PNG share identical poster artwork, including gradients, texture and late week data',async()=>{
 for(const background of ['#101713','#f5f6f3']){
  const f=exportFixture(),pending=deferred();f.palette['--bg-page']=background;f.window=Object.create(f.window);
  Object.defineProperty(f.window,'localStorage',{value:{getItem:()=>null,setItem(){}}});f.nodes.weeklyXIContent=new ExportNode();
  const page=mountWeeklyXI({...f,current:()=>true,userId:player.id,matchesApi:{load:()=>pending.promise},now:()=>Date.parse('2026-10-04T00:00:00Z'),catalogue:{source:'canonical',model:{teams:[{id:player.teamId,name:player.teamName,color:player.color,color2:player.color2}],players:[player]}}});
  const root=f.nodes.weeklyXIContent;
  const content=poster=>poster.children.map(serialize).join('').replaceAll('weekly-page-','weekly-art-').replaceAll('weekly-export-','weekly-art-');
  const compare=()=>{
   const editor=find(root,'weekly-poster-art'),surface=find(root,'week-xi-export-surface').firstElementChild,preview=find(surface,'weekly-poster-art');
   assert.equal(content(editor),content(preview));assert.equal(editor.attrs.viewBox,preview.attrs.viewBox);assert.equal(preview.attrs.preserveAspectRatio,'xMidYMid meet');
   assert.equal(allNodes(preview).filter(n=>n.tagName==='ellipse').length,0);
   const ids=new Set(allNodes(preview).map(n=>n.attrs.id).filter(Boolean));
   for(const n of allNodes(preview))for(const value of Object.values(n.attrs))for(const match of String(value).matchAll(/url\(#([^)]*)\)/g))assert(ids.has(match[1]),'every paint reference resolves inside the exported poster');
   return surface;
  };
  fire(find(root,'weekly-preview-trigger'),'click');compare();
  fire(button(root,'Geri Dön'),'click');fire(find(root,'weekly-slot'),'click');fire(find(root,'weekly-result'),'click');fire(find(root,'weekly-preview-trigger'),'click');compare();
  pending.resolve({ok:true,matches:[{round:6,status:'finished',kickoff:'2026-10-01T18:00:00Z'}]});await page.ready;
  const surface=compare();assert.equal(find(root,'weekly-week-number').textContent,'6');
  await renderWeeklyPNG({...f,svg:surface});assert.equal(await f.created.at(-1).text(),serialize(surface));page.dispose();
 }
});

test('preview CSS parses cleanly and its full-screen artwork rules apply outside mobile media queries',async()=>{
 const source=await readFile(new URL('../dist/weekly-xi.css',import.meta.url),'utf8');
 const {code,warnings}=await transform(source,{loader:'css',logLevel:'silent'});
 assert.deepEqual(warnings,[]);
 // esbuild indents nested media rules: these selectors must remain at root level.
 assert.match(code,/^\.weekly-preview \{[^}]*width: 100vw;[^}]*height: 100svh;/m);
 assert.match(code,/^\.week-xi-export-surface > svg \{[^}]*width: 100%;[^}]*height: auto;/m);
 assert.match(code,/^\.weekly-save,\s*\.weekly-preview-trigger \{[^}]*background: none;[^}]*color: var\(--text-primary\);/m);
});

test('vector surface contains only artwork, generic jerseys and filled slots, without provider identity or editor UI',()=>{
 const f=exportFixture(),state=filled(),before=JSON.stringify(state),svg=graphic(f,state),xml=serialize(svg);
 assert.equal(svg.attrs.viewBox,'0 0 1920 1080');assert.equal(svg.attrs.width,'1920');assert.equal(svg.attrs.height,'1080');
 assert.match(xml,/Çağlar Söyüncü/);assert.match(xml,/>LB</);assert.match(xml,/>4</);assert.match(xml,/#19294d/);assert.match(xml,/#f3d233/);
 assert.match(xml,/TEAM/);assert.match(xml,/11 OYUNCU • TEK KADRO/);assert.match(xml,/#101713/);
 assert.match(xml,/skewX\(-26\)/);assert.match(xml,/#09120e/);
 assert.doesNotMatch(xml,/button|input|select|foreignObject|<image|href=|url\((?!#weekly-export-)|https?:|fotmob|provider|aaaaaaaa|Kaydet|Değiştir|Kaldır|navbar/);
 assert.equal(allNodes(svg).filter(n=>n.tagName==='path').length,2);assert.equal(JSON.stringify(state),before);
 const empty=graphic(f,emptyWeeklyXI());assert.equal(allNodes(empty).filter(n=>n.tagName==='path').length,0);assert.doesNotMatch(serialize(empty),/>\+<|>GK</);assert.match(serialize(empty),/#284c40/);assert.match(serialize(empty),/#a68b4b/);
 const truncated=fitWeeklyLabel('Çok uzun isim 🏆',50,s=>Array.from(s).length*10);assert(truncated.endsWith('…'));assert(Array.from(truncated).length<=5);
});

test('all requested full-eleven formations project exact slot positions without modifying canonical data',()=>{
 const f=exportFixture();
 for(const shape of ['4-4-2','4-3-3','4-2-3-1','3-5-2','3-4-3']){
  let state=changeWeeklyFormation(emptyWeeklyXI(),shape);for(let i=0;i<11;i++)state=pickWeeklyPlayer(state,i,{...player,id:player.id.slice(0,-2)+String(i).padStart(2,'0'),name:'Oyuncu '+i});
  state=moveWeeklySlot(state,0,53.5,88);const before=JSON.stringify(state),svg=graphic(f,state);
  assert.equal(allNodes(svg).filter(n=>n.tagName==='path').length,22);
  assert(allNodes(svg).some(n=>n.tagName==='svg'&&n.attrs.x===String(510+53.5*9-32)));
  assert.equal(JSON.stringify(state),before);
 }
});

test('preview opens with incomplete unsaved lineup, returns focus, closes by Escape and excludes controls from surface',()=>{
 const f=exportFixture();let state=filled(),renders=0;
 const page=mountWeeklyPreview({...f,getState:()=>state,effective:p=>p,current:()=>true,renderer:async()=>{renders++;return new Blob();}});
 fire(f.trigger,'click');const dialog=find(f.root,'weekly-preview'),surface=find(f.root,'week-xi-export-surface');
 assert(dialog.open);assert(button(f.root,'Geri Dön').focused);assert.equal(renders,0);assert(surface.firstElementChild);
 assert.doesNotMatch(textOf(surface),/PNG İndir|Geri Dön|Kaydet|Önizle/);assert.equal(allNodes(surface).filter(n=>n.tagName==='button').length,0);
 const frozen=serialize(surface.firstElementChild);f.palette['--bg-page']='#ffffff';assert.equal(serialize(surface.firstElementChild),frozen);
 fire(dialog,'cancel');assert.equal(dialog.open,false);assert(f.trigger.focused);
 state=pickWeeklyPlayer(state,1,null);fire(f.trigger,'click');assert.equal(allNodes(surface).filter(n=>n.tagName==='path').length,0);assert.match(serialize(surface.firstElementChild),/#ffffff/);
 fire(button(f.root,'Geri Dön'),'click');assert.equal(dialog.open,false);page.dispose();
});

test('export loading state prevents duplicate downloads and stale completion after close or disposal',async()=>{
 for(const cancel of [false,'close','dispose']){
  const f=exportFixture(),pending=deferred();let calls=0,downloads=0;
  const page=mountWeeklyPreview({...f,getState:filled,current:()=>true,renderer:()=>{calls++;return pending.promise;},download:()=>downloads++});
  fire(f.trigger,'click');const png=button(f.root,'PNG İndir');fire(png,'click');fire(png,'click');assert.equal(calls,1);assert(png.disabled);assert.equal(png.textContent,'Görsel hazırlanıyor…');
  assert.equal(find(f.root,'weekly-preview-status').attrs['aria-live'],'polite');
  if(cancel==='close')fire(button(f.root,'Geri Dön'),'click');if(cancel==='dispose')page.dispose();
  pending.resolve(new Blob(['png'],{type:'image/png'}));await tick();assert.equal(downloads,cancel?0:1);if(!cancel)assert.equal(png.disabled,false);page.dispose();
 }
});

test('export error is controlled, retryable and never displays raw details',async()=>{
 const f=exportFixture(),page=mountWeeklyPreview({...f,getState:filled,current:()=>true,renderer:async()=>{throw Error('private provider payload');}});
 fire(f.trigger,'click');const png=button(f.root,'PNG İndir');fire(png,'click');await tick();
 assert.equal(find(f.root,'weekly-preview-status').textContent,'Görsel oluşturulamadı. Tekrar deneyin.');assert.equal(png.disabled,false);assert.doesNotMatch(textOf(f.root),/private provider/);page.dispose();
});

test('PNG renderer awaits fonts, freezes SVG, emits fixed opaque-size canvas and releases blob URLs',async()=>{
 const f=exportFixture(),fonts=deferred();f.document.fonts.ready=fonts.promise;const svg=graphic(f),pending=renderWeeklyPNG({...f,svg});
 svg.children[0].setAttribute('fill','#ffffff');await tick();assert.equal(f.urls.size,0);
 fonts.resolve();const png=await pending;assert.equal(png.type,'image/png');assert.equal(f.draws.length,1);
 const frozenXML=await f.created[0].text();assert.match(frozenXML,/<rect width="1920" height="1080" fill="#101713"/);assert.doesNotMatch(frozenXML,/<rect width="1920" height="1080" fill="#ffffff"/);
 assert.equal(f.draws[0].canvas.width,1920);assert.equal(f.draws[0].canvas.height,1080);assert.equal(f.draws[0].canvas.encodedType,'image/png');assert.equal(f.urls.size,0);assert.equal(f.revoked.length,1);
 downloadWeeklyPNG({...f,blob:png});assert.equal(f.downloads[0].filename,WEEKLY_EXPORT.filename);assert.equal(f.urls.size,1);f.flushTimers();assert.equal(f.urls.size,0);
});

test('failed image decode/PNG encode and stale font wait do not leak URLs or export',async()=>{
 for(const failure of ['imageFailure','encodeFailure']){const f=exportFixture();f.options[failure]=true;await assert.rejects(renderWeeklyPNG({...f,svg:graphic(f)}));assert.equal(f.urls.size,0);assert.equal(f.timers.size,0);}
 const f=exportFixture();await assert.rejects(renderWeeklyPNG({...f,svg:graphic(f),current:()=>false}));assert.equal(f.urls.size,0);assert.equal(f.draws.length,0);
});

test('actual weekly builder wires Önizle without a save and leaves the saved state untouched',()=>{
 const f=exportFixture(),storage=new Map();f.window=Object.create(f.window);Object.defineProperty(f.window,'localStorage',{value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}});
 f.nodes.weeklyXIContent=new ExportNode();const page=mountWeeklyXI({...f,current:()=>true,userId:player.id,catalogue:{source:'canonical',model:{teams:[{id:player.teamId,name:player.teamName,color:player.color,color2:player.color2}],players:[player]}}});
 const root=f.nodes.weeklyXIContent;fire(find(root,'weekly-slot'),'click');fire(find(root,'weekly-result'),'click');fire(find(root,'weekly-preview-trigger'),'click');
 assert(find(root,'weekly-preview').open);assert.match(serialize(find(root,'week-xi-export-surface').firstElementChild),/Çağlar Söyüncü/);assert.equal(storage.size,0);page.dispose();
});

test('account change and close/reopen cannot deliver an older export into the current preview',async()=>{
 const f=exportFixture(),pending=[deferred(),deferred()];let current=true,calls=0,downloads=0;
 const page=mountWeeklyPreview({...f,getState:filled,current:()=>current,renderer:()=>pending[calls++].promise,download:()=>downloads++});
 fire(f.trigger,'click');const png=button(f.root,'PNG İndir');fire(png,'click');fire(button(f.root,'Geri Dön'),'click');fire(f.trigger,'click');fire(png,'click');
 pending[0].resolve(new Blob());await tick();assert.equal(downloads,0);assert.equal(png.disabled,true);
 current=false;pending[1].resolve(new Blob());await tick();assert.equal(downloads,0);page.dispose();
});

test('personal labels render without changing canonical state and timeout releases image resources',async()=>{
 const f=exportFixture(),state=filled(),before=JSON.stringify(state);
 const svg=createWeeklyGraphic({...f,state,palette:weeklyPalette(f.document,f.window),effective:p=>({...p,name:'Kişisel ad',number:99,role:'ST'})});
 assert.match(serialize(svg),/Kişisel ad/);assert.match(serialize(svg),/>99</);assert.match(serialize(svg),/>LB</);assert.equal(JSON.stringify(state),before);
 f.window.Image=class{set src(value){this.url=value;}};
 const pending=renderWeeklyPNG({...f,svg});await tick();assert.equal(f.urls.size,1);f.flushTimers();await assert.rejects(pending);assert.equal(f.urls.size,0);assert.equal(f.timers.size,0);
});

test('week panel uses latest played match, ignores URL week and matches the PNG presentation',async()=>{
 for(const hasData of [true,false])for(const search of ['?hafta=8','?hafta=34','','?hafta=0','?hafta=35','?hafta=8&hafta=9','?hafta=%3Cimg%3E']){
  const number=hasData?'8':'—';
  const f=exportFixture();f.window=Object.create(f.window);f.window.location=new URL('/haftanin-ilk-11i'+search,'https://example.test');
  Object.defineProperty(f.window,'localStorage',{value:{getItem:()=>null,setItem(){throw Error('no automatic writes');}}});
  f.nodes.weeklyXIContent=new ExportNode();const page=mountWeeklyXI({...f,current:()=>true,userId:player.id,matchesApi:{load:async()=>({ok:hasData,matches:[{round:9,status:'upcoming',kickoff:'2026-09-25T18:00:00Z'},{round:8,status:'finished',kickoff:'2026-09-20T18:00:00Z'},{round:6,status:'finished',kickoff:'2026-09-10T18:00:00Z'}]})},now:()=>Date.parse('2026-09-21T00:00:00Z'),catalogue:{source:'canonical',model:{teams:[],players:[]}}});await page.ready;
  const root=f.nodes.weeklyXIContent;assert.equal(find(root,'weekly-week-number').textContent,number);assert.equal(find(root,'weekly-week-caption'),undefined);
  assert.equal(find(root,'weekly-week-label').textContent,'HAFTA');assert.equal(find(root,'weekly-monogram'),undefined);
  assert.equal(allNodes(root).filter(n=>n.className==='weekly-slot').length,11);
  assert(button(root,'Kaydet'));assert(button(root,'Önizle'));assert(allNodes(root).some(n=>n.tagName==='select'&&n.attrs['aria-label']==='Diziliş'));
  fire(find(root,'weekly-preview-trigger'),'click');const graphic=find(root,'week-xi-export-surface').firstElementChild;
  const webPoster=find(root,'weekly-poster-art'),pngPoster=find(graphic,'weekly-poster-art');
  for(const poster of [webPoster,pngPoster]){
   assert.deepEqual(allNodes(poster).filter(n=>n.tagName==='text').map(n=>n.textContent),['SÜPER','LİG','HAFTA',number,'11 OYUNCU • TEK KADRO','TAKIMLAR FARKLI. SAHNE AYNI.']);
   assert.equal(find(poster,'weekly-week-caption'),undefined);
   assert.doesNotMatch(serialize(poster),/SON OYNANAN HAFTA|HAFTA BİLGİSİ YOK/);
  }
  const artwork=poster=>poster.children.map(serialize).join('').replaceAll('weekly-page-','weekly-art-').replaceAll('weekly-export-','weekly-art-');
  assert.equal(artwork(webPoster),artwork(pngPoster));
  assert.equal(allNodes(graphic).some(n=>n.textContent==='XI'),false);page.dispose();
 }
 for(const invalid of ['8',0,35,NaN,undefined])assert.equal(weeklyWeekText(invalid).number,'—');
});
