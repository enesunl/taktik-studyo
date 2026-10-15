import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {legacyRosterScript} from './helpers/legacy-shape-roster.cjs';
import {matchBoardDocument,fire,BoardNode} from './helpers/match-board-fixture.mjs';
import {allNodes,textOf,tick,deferred} from './helpers/matches-fixture.mjs';
import {snapshot,row,id,copyId,owner,memory} from './helpers/studio-project-fixture.mjs';
import {detail} from './helpers/match-detail-fixture.mjs';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {mountStudioProjects} from '../src/lib/studio-projects-ui.js';
import {createMatchBoard} from '../src/lib/match-board.js';
import {projectBoardState,serializeStudioProject} from '../src/lib/studio-project-snapshot.js';
import {PITCH_COLOR_KEY} from '../src/lib/pitch-preference.js';
import {SIZE_KEY} from '../src/lib/studio-preferences.js';
import {mountStudioSave} from '../src/lib/studio-save-ui.js';
import {startPage} from '../src/lib/page-bootstrap.js';
import {createProjectRecovery} from '../src/lib/studio-autosave.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const node=(root,cls)=>allNodes(root).find(n=>(n.className||'').split(' ').includes(cls));
const button=(root,label)=>allNodes(root).find(n=>n.tagName==='button'&&(n.attrs['aria-label']===label||n.textContent===label));
const markers=root=>allNodes(root).filter(n=>n.dataset.slotKey);
function fixture(path){const f=matchBoardDocument(path);vm.runInNewContext(legacyRosterScript({withTeams:true}),{window:f.window});return f;}
function draw(root,type){fire(allNodes(root).find(n=>n.dataset.tool===type),'click');const input=node(root,'match-drawing-input');fire(input,'pointerdown',{clientX:230,clientY:200});fire(input,'pointerup',{clientX:600,clientY:450});}
function appearance(root){return node(root,'match-pitch').attrs;}
function people(root){return markers(root).map(n=>({key:n.dataset.slotKey,style:[n.style.left,n.style.top].map(v=>Number(parseFloat(v).toFixed(8))),text:textOf(n)}));}
function apiMemory(){
 const data=new Map(),calls=[];return{data,calls,
  async createProject(p){calls.push('create');const r=row({...p,revision:1,studio_mode:p.snapshot.source.mode});data.set(p.id,structuredClone(r));return{ok:true,project:r};},
  async updateProject(p){calls.push('update');const r=row({...p,revision:p.revision+1});data.set(p.id,structuredClone(r));return{ok:true,project:r};},
  async getProject(key){calls.push('get');return data.has(key)?{ok:true,project:structuredClone(data.get(key))}:{ok:false,error:{code:'project_unavailable'}};},
  async listProjects(){calls.push('list');return{ok:true,projects:[...data.values()].map(({snapshot,...r})=>r),more:false,nextOffset:20};},
  async renameProject(p){calls.push('rename');Object.assign(data.get(p.id),{title:p.title,revision:p.revision+1});return{ok:true};},
  async duplicateProject(key,newId){calls.push('duplicate');data.set(newId,row({...structuredClone(data.get(key)),id:newId,revision:1,title:data.get(key).title+' - Kopya'}));return{ok:true};},
  async deleteProject(p){calls.push('delete');data.delete(p.id);return{ok:true};}
 };
}
test('Free Studio UI smoke: two teams, movement, reserve, drawings, appearance, autosave and exact reopen with ZERO BSD',async()=>{
 const f=fixture('/mac-studyosu'),projects=apiMemory();let bsd=0;
 const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,userId:owner,projects,api:{load(){bsd++;throw Error();}}});await page.ready;
 const root=f.nodes.matchStudioContent;assert.equal(projects.calls.length,0);
 fire(button(root,'Ev sahibi takımı seç'),'click');let options=allNodes(root).filter(n=>n.className==='studio-team-option');fire(options[0],'click');
 fire(button(root,'Deplasman takımı seç'),'click');fire(options[1],'click');assert.equal(markers(root).length,22);
 fire(markers(root)[1],'keydown',{key:'ArrowDown'});fire(markers(root)[1],'click');const reserve=node(root,'match-reserve');assert.ok(reserve);const reserveText=textOf(reserve);fire(reserve,'click');
 draw(root,'movement-arrow');draw(root,'zone');const picker=allNodes(root).find(n=>n.type==='color');picker.value='#154070';fire(picker,'input');
 const sliders=allNodes(root).filter(n=>n.type==='range');sliders[0].value='1300';fire(sliders[0],'input');sliders[1].value='700';fire(sliders[1],'input');
 assert.equal(projects.calls.length,0);assert.match(textOf(root),/Kaydedilmedi/);
 // This integration checks the actual 2s timer; deterministic timer behavior is covered separately.
 await new Promise(r=>setTimeout(r,2100));await tick();assert.equal(projects.calls.filter(x=>x==='create').length,1);assert.match(textOf(root),/Kaydedildi ✓/);
 const saved=[...projects.data.values()][0],expected=people(root),colors=appearance(root);assert.equal(saved.snapshot.teams.home.name,'Galatasaray');assert.match(JSON.stringify(saved.snapshot),/movement-arrow/);
 const title=allNodes(root).find(n=>n.attrs['aria-label']==='Çalışma adı');title.value='Pres Planı';fire(title,'input');fire(button(root,'Kaydet'),'click');await tick();assert.equal(projects.data.get(saved.id).title,'Pres Planı');page.dispose();
 const g=fixture('/mac-studyosu?project='+saved.id+'&id=215997'),reopen=mountMatchStudio({document:g.document,window:g.window,current:()=>true,userId:owner,projects,api:{load(){bsd++;throw Error();}}});await reopen.ready;
 assert.deepEqual(people(g.nodes.matchStudioContent),expected);assert.equal(colors['--match-pitch-background'],'#154070');assert.equal(appearance(g.nodes.matchStudioContent)['--match-pitch-background'],'#154070');assert.equal(appearance(g.nodes.matchStudioContent)['--match-pitch-width'],'1300px');
 assert.equal(node(g.nodes.matchStudioContent,'match-drawings').children[0].children.length,2);assert.ok(textOf(g.nodes.matchStudioContent).includes(reserveText.split(' ')[0]));
 assert.equal(allNodes(g.nodes.matchStudioContent).find(n=>n.dataset.action==='undo').disabled,true);assert.equal(bsd,0);reopen.dispose();
});
test('match215997 viewing creates nothing; saved reopening never invokes provider or regenerates XI',async()=>{
 const projects=apiMemory(),f=fixture('/mac-studyosu?id=215997&hafta=6');let bsd=0;
 const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,userId:owner,projects,api:{load:async()=>{bsd++;return{ok:true,match:detail()};}}});await page.ready;
 assert.equal(projects.calls.length,0);fire(markers(f.nodes.matchStudioContent)[1],'keydown',{key:'ArrowDown'});fire(button(f.nodes.matchStudioContent,'Kaydet'),'click');await tick();
 const saved=[...projects.data.values()][0];assert.equal(saved.snapshot.source.matchId,'215997');assert.equal(saved.snapshot.source.week,6);const positions=people(f.nodes.matchStudioContent);page.dispose();
 const g=fixture('/mac-studyosu?project='+saved.id),p=mountMatchStudio({document:g.document,window:g.window,current:()=>true,userId:owner,projects,api:{load(){bsd++;throw Error();}}});await p.ready;
 assert.deepEqual(people(g.nodes.matchStudioContent),positions);assert.equal(bsd,1);assert.match(textOf(g.nodes.matchStudioContent),/Maç Stüdyosu/);p.dispose();
});
test('saved project loading has no blank free flash; invalid/missing inaccessible project never fetches BSD',async()=>{
 const d=deferred(),f=fixture('/mac-studyosu?project='+id);let calls=0;
 const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,userId:owner,projects:{getProject:()=>d.promise},api:{load(){calls++;}}});
 assert.equal(markers(f.nodes.matchStudioContent).length,0);assert.match(textOf(f.nodes.matchStudioContent),/Çalışma yükleniyor/);assert.doesNotMatch(textOf(f.nodes.matchStudioContent),/Serbest Stüdyo/);
 d.resolve({ok:false,error:{code:'project_unavailable'}});await page.ready;assert.match(textOf(f.nodes.matchStudioContent),/Çalışma bulunamadı/);assert.equal(calls,0);page.dispose();
 const g=fixture('/mac-studyosu?project=invalid'),p=mountMatchStudio({document:g.document,window:g.window,current:()=>true,projects:{getProject(){throw Error();}},api:{load(){throw Error();}}});await p.ready;assert.match(textOf(g.nodes.matchStudioContent),/Çalışma bulunamadı/);p.dispose();
});
test('board commit notifications ignore selection/tools/previews, fire at pointerup and restore saved source/history safely',()=>{
 const f=fixture('/mac-studyosu'),s=snapshot(),initial=projectBoardState(s);let changes=0;
 const storage=memory();storage.setItem(PITCH_COLOR_KEY,'#abcdef');storage.setItem(SIZE_KEY,JSON.stringify({width:900,height:500}));const before=[...storage.data];
 const board=createMatchBoard({root:f.nodes.matchStudioContent,document:f.document,utils:f.utils,model:initial.model,initial,onChange(){changes++;},getPreferenceStorage:()=>storage});const root=f.nodes.matchStudioContent;
 assert.equal(changes,0);assert.deepEqual([...storage.data],before);fire(markers(root)[1],'click');fire(allNodes(root).find(n=>n.dataset.tool==='line'),'click');assert.equal(changes,0);
 const input=node(root,'match-drawing-input');fire(input,'pointerdown',{clientX:230,clientY:200});for(let i=0;i<200;i++)fire(input,'pointermove',{clientX:300+i,clientY:300});assert.equal(changes,0);fire(input,'pointerup',{clientX:600,clientY:450});assert.equal(changes,1);
 const objects=board.getDrawings().objects;assert.equal(new Set(objects.map(o=>o.id)).size,7);fire(allNodes(root).find(n=>n.dataset.tool==='select'),'click');
 const player=markers(root)[1];fire(player,'pointerdown',{clientX:250,clientY:250});for(let i=0;i<100;i++)fire(player,'pointermove',{clientX:400+i,clientY:400});assert.equal(changes,1);fire(player,'pointerup',{clientX:650,clientY:450});assert.equal(changes,2);
 board.reset();assert.equal(changes,3);const restored=serializeStudioProject({source:s.source,...board.exportState()});assert.deepEqual(restored.working,s.working);assert.equal(restored.drawings.length,7);board.dispose();
});
test('Çalışmalarım UI empty state, pagination, open, branded rename/delete and duplicate',async()=>{
 const f=fixture('/calismalarim');f.nodes.studioProjectsContent=new BoardNode();const api=apiMemory(),page=mountStudioProjects({document:f.document,window:f.window,api,current:()=>true});await page.ready;const root=f.nodes.studioProjectsContent;
 assert.match(textOf(root),/Henüz kaydedilmiş/);assert.equal(allNodes(root).find(n=>n.textContent==='İlk Çalışmanı Oluştur').href,'/mac-studyosu');page.dispose();
 api.data.set(id,row());const p=mountStudioProjects({document:f.document,window:f.window,api,current:()=>true});await p.ready;assert.equal(allNodes(root).find(n=>n.textContent==='Aç').href,'/mac-studyosu?project='+id);
 fire(button(root,'Yeniden Adlandır'),'click');let dialog=node(root,'studio-project-dialog');assert.equal(dialog.open,true);const input=allNodes(dialog).find(n=>n.tagName==='input');assert.equal(input.focused,true);input.value='Yeni Plan';fire(allNodes(dialog).find(n=>n.tagName==='form'),'submit');await tick();assert.match(textOf(root),/Yeni Plan/);
 fire(button(root,'Kopyala'),'click');await tick();assert.equal(api.data.size,2);
 const cards=allNodes(root).filter(n=>n.className==='studio-project-card');fire(button(cards[1],'Sil'),'click');dialog=node(root,'studio-project-dialog');assert.match(textOf(dialog),/kalıcı olarak silinecek/);fire(button(dialog,'İptal'),'click');await tick();assert.equal(api.data.size,2);
 fire(button(cards[1],'Sil'),'click');dialog=node(root,'studio-project-dialog');fire(allNodes(dialog).find(n=>n.tagName==='form'),'submit');await tick();assert.equal(api.data.size,1);assert.ok(api.data.has(id));p.dispose();
});
test('new navigation is authenticated only; project CSS uses shared tokens and mobile layout',()=>{
 const index=read('dist/index.html');assert.doesNotMatch(index.split('<div id="sharedViewer" hidden>')[1],/calismalarim/);
 for(const name of ['studyo','mac','maclar','mac-studyosu','profil','calismalarim'])assert.doesNotMatch(read('dist/'+name+'.html').split('</header>')[0],/href="\/calismalarim"/);
 const css=read('dist/studio-projects.css');assert.match(css,/var\(--bg-surface\)/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/studio-project-dialog::backdrop/);
});
test('unsaved internal navigation is branded and cancellable, beforeunload only warns when dirty; cleanup removes listeners',async()=>{
 const f=fixture('/mac-studyosu');let value=snapshot(),warnings=0,navigations=0;
 f.window.location.assign=()=>navigations++;
 const ui=mountStudioSave({document:f.document,window:f.window,host:f.nodes.matchStudioContent,api:apiMemory(),current:()=>true,capture:()=>value,userId:owner,newId:()=>id,storage:memory()});
 const unload=()=>fire(f.window,'beforeunload',{preventDefault(){warnings++;}});
 unload();assert.equal(warnings,0);ui.controller.setAutosave(false);value={...value,pitch:{...value.pitch,width:1400}};ui.controller.changed();unload();assert.equal(warnings,1);
 const anchor={href:'http://localhost:4173/calismalarim',hasAttribute:()=>false,focus(){}};
 fire(f.document,'click',{target:{closest:()=>anchor}});let dialog=node(f.nodes.matchStudioContent,'studio-project-dialog');assert.equal(dialog.open,true);fire(button(dialog,'İptal'),'click');await tick();assert.equal(navigations,0);
 fire(f.document,'click',{target:{closest:()=>anchor}});dialog=node(f.nodes.matchStudioContent,'studio-project-dialog');fire(allNodes(dialog).find(n=>n.tagName==='form'),'submit');await tick();assert.equal(navigations,1);
 ui.dispose();assert.equal(f.window.listeners.get('beforeunload').size,0);assert.equal(f.document.listeners.get('click').size,0);
});
test('save status failure/retry and conflict controls prevent overwrite while retaining work',async()=>{
 const f=fixture('/mac-studyosu');let value=snapshot(),conflict=false;
 const api={updateProject:async()=>({ok:false,error:{code:conflict?'conflict':'project_request_failed'}})};
 const ui=mountStudioSave({document:f.document,window:f.window,host:f.nodes.matchStudioContent,api,current:()=>true,capture:()=>value,project:row(),userId:owner,newId:()=>copyId,storage:memory()});
 ui.controller.setAutosave(false);value={...value,pitch:{...value.pitch,width:1300}};ui.controller.changed();await ui.controller.save();assert.match(textOf(f.nodes.matchStudioContent),/Kaydetme hatası/);assert.ok(button(f.nodes.matchStudioContent,'Tekrar Dene'));
 conflict=true;await ui.controller.save();assert.match(textOf(f.nodes.matchStudioContent),/başka bir sekmede/);assert.equal(button(f.nodes.matchStudioContent,'Kaydet').disabled,true);assert.equal(button(f.nodes.matchStudioContent,'Kopya Olarak Kaydet').hidden,false);assert.equal(ui.controller.getState().dirty,true);ui.dispose();
});
test('recovery is explicit, user scoped, preserves revision and renders original snapshots without provider',async()=>{
 const f=fixture('/mac-studyosu'),storage=memory(),sessionStorage=memory(),s=snapshot('free');
 createProjectRecovery({storage,sessionStorage,userId:owner,newId:()=>id,current:()=>true}).write({id,revision:3,title:'Kurtarma Planı',snapshot:s});
 // The standard match fixture deliberately blocks storage. Supply a separate browser surface here.
 const window={...f.window,localStorage:storage,sessionStorage,addEventListener:f.window.addEventListener.bind(f.window),removeEventListener:f.window.removeEventListener.bind(f.window)};
 const page=mountMatchStudio({document:f.document,window,current:()=>true,userId:owner,projects:apiMemory(),api:{load(){throw Error('BSD');}}});await page.ready;
 assert.equal(markers(f.nodes.matchStudioContent).length,0);assert.ok(button(f.nodes.matchStudioContent,'Yerel Çalışmayı Kurtar'));
 fire(button(f.nodes.matchStudioContent,'Yerel Çalışmayı Kurtar'),'click');await tick();assert.equal(markers(f.nodes.matchStudioContent).length,22);
 assert.equal(allNodes(f.nodes.matchStudioContent).find(n=>n.attrs['aria-label']==='Çalışma adı').value,'Kurtarma Planı');page.dispose();assert.ok(storage.data.size);
});
test('projects guard validates login and rejects signed-out/recovery; list uses existing client only after validation',async()=>{
 for(const status of ['signed_in','signed_out','password_recovery']){
  const f=fixture('/calismalarim'),state={status,user:{id:owner}};f.nodes.studioProjectsContent=new BoardNode();let lists=0;
  const q={select(){return q;},eq(){return q;},order(){return q;},range(){lists++;return Promise.resolve({data:[]});}};
  const auth={initialize:async()=>({ok:true}),getState:()=>state,subscribe:()=>()=>{},validateUser:async()=>({ok:true,user:{id:owner}})};
  const page=startPage({auth,document:f.document,window:f.window,client:{from:()=>q},backend:{loadCatalogue(){throw Error();}}});await page.ready;await tick();assert.equal(lists,status==='signed_in'?1:0);assert.equal(f.nodes.protectedContent.hidden,status!=='signed_in');page.dispose();
 }
});
test('project list Daha Fazla requests next offset and preserves existing cards',async()=>{
 const f=fixture('/calismalarim');f.nodes.studioProjectsContent=new BoardNode();const offsets=[];
 const page=mountStudioProjects({document:f.document,window:f.window,current:()=>true,api:{listProjects:async offset=>{offsets.push(offset);return{ok:true,projects:[row({id:offset?copyId:id})],more:!offset,nextOffset:offset+20};}}});await page.ready;
 await button(f.nodes.studioProjectsContent,'Daha Fazla').emit('click');await tick();assert.deepEqual(offsets,[0,20]);assert.equal(allNodes(f.nodes.studioProjectsContent).filter(n=>n.className==='studio-project-card').length,2);page.dispose();
});

test('free workspace keeps compact save controls beside identity; source reset lives last in tools and restores silently',async()=>{
 const f=fixture('/mac-studyosu'),projects=apiMemory();
 const page=mountMatchStudio({document:f.document,window:f.window,current:()=>true,userId:owner,projects,api:{load(){throw Error('Free must not fetch matches');}}});await page.ready;
 const root=f.nodes.matchStudioContent,topbar=node(root,'match-studio-topbar'),tools=node(root,'match-tactical-host');
 assert.equal(node(root,'match-studio-back'),undefined);assert.doesNotMatch(textOf(topbar),/Maçlara dön/);
 assert.deepEqual(topbar.children.map(n=>n.className),['match-workspace-identity','match-workspace-save']);
 const reset=button(root,'Başlangıç Yerleşimine Dön');assert.ok(reset);assert.ok(allNodes(tools.children.at(-1)).includes(reset));assert.ok(!allNodes(topbar).includes(reset));
 fire(button(root,'Otomatik kaydet'),'click');
 fire(button(root,'Ev sahibi takımı seç'),'click');let options=allNodes(root).filter(n=>n.className==='studio-team-option');fire(options[0],'click');
 fire(button(root,'Deplasman takımı seç'),'click');fire(options[1],'click');
 const original=people(root),player=markers(root)[1];fire(player,'keydown',{key:'ArrowDown'});fire(player,'click');fire(node(root,'match-reserve'),'click');assert.notDeepEqual(people(root),original);
 fire(reset,'click');assert.deepEqual(people(root),original);assert.equal(node(root,'match-studio-status').textContent,'');assert.doesNotMatch(textOf(root),/Başlangıç yerleşimi geri yüklendi/);
 assert.equal(projects.calls.length,0);page.dispose();
});

test('icon save retains accessible retry/busy behavior and autosave switch is directly available outside options',async()=>{
 const f=fixture('/mac-studyosu'),pending=deferred();let creates=0;
 const ui=mountStudioSave({document:f.document,window:f.window,host:f.nodes.matchStudioContent,current:()=>true,capture:()=>snapshot(),userId:owner,newId:()=>id,storage:memory(),api:{createProject(){creates++;return pending.promise;}}});
 const root=f.nodes.matchStudioContent,save=button(root,'Kaydet'),toggle=button(root,'Otomatik kaydet'),options=allNodes(root).find(n=>n.tagName==='details');
 assert.equal(save.textContent,'');assert.equal(save.children[0].tagName,'svg');assert.equal(save.children[0].attrs['aria-hidden'],'true');assert.equal(save.title,'Kaydet');
 assert.equal(toggle.attrs.role,'switch');assert.equal(toggle.attrs['aria-checked'],'true');assert.ok(!allNodes(options).includes(toggle));assert.equal(options.hidden,true);
 fire(toggle,'click');assert.equal(toggle.attrs['aria-checked'],'false');assert.equal(ui.controller.getState().autosave,false);assert.equal(creates,0);
 fire(save,'click');await tick();assert.equal(creates,1);assert.equal(save.disabled,true);assert.equal(save.attrs['aria-busy'],'true');assert.equal(save.attrs['aria-label'],'Kaydediliyor…');assert.equal(save.children[0].tagName,'svg');
 pending.resolve({ok:true,project:row()});await tick();assert.equal(save.disabled,false);assert.equal(save.attrs['aria-busy'],'false');assert.equal(save.attrs['aria-label'],'Kaydet');assert.match(textOf(root),/Kaydedildi ✓/);ui.dispose();
});
