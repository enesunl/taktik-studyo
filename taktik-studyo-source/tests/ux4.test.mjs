import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createWeeklyLineups,canonicalWeeklySnapshot,weeklyGroup,weeklySeason} from '../src/lib/weekly-lineups.js';
import {mountWeeklyCollection} from '../src/lib/weekly-lineups-ui.js';
import {emptyWeeklyXI,pickWeeklyPlayer,createWeeklyStore} from '../src/lib/weekly-xi.js';
import {mountWeeklyXI} from '../src/lib/weekly-xi-ui.js';
import {createWeeklyPitch,weeklyNameLines} from '../src/lib/weekly-xi-pitch.js';
import {createWeeklyGraphic,weeklyPalette} from '../src/lib/weekly-xi-export.js';
import {resolvePage} from '../src/lib/page-routes.js';
import {safeInternalRedirect,loginUrl,loginDestination} from '../src/lib/auth-redirects.js';
import {owner,other,id,copyId,memory,queryMock} from './helpers/studio-project-fixture.mjs';
import {exportFixture,ExportNode,serialize} from './helpers/weekly-export-fixture.mjs';
import {allNodes,deferred,tick} from './helpers/matches-fixture.mjs';
import {fire} from './helpers/match-board-fixture.mjs';
import {mountProfile} from '../src/lib/profile-ui.js';
import {profileDocument} from './helpers/profile-fixture.mjs';
const player={id:other,teamId:'galatasaray',name:'Alexandru Maxim Long Name',teamName:'Galatasaray',number:10,positionGroup:'M',specificPosition:'AM',color:'#a61931',color2:'#f5bd28'};
const snapshot=()=>pickWeeklyPlayer(emptyWeeklyXI(),1,player);
const record=(extra={})=>({id,user_id:owner,title:'My XI',season:'2026/27',week:8,formation:'4-3-3',revision:1,created_at:'2026-10-13T12:00:00Z',updated_at:'2026-10-13T12:00:00Z',snapshot:snapshot(),...extra});

test('Weekly repository confirms server create/update, pins owner, validates canonical snapshots and returns controlled errors',async()=>{
 const q=queryMock([{data:record()},{data:record({revision:2})},{data:record()},{data:[record(),record({id:copyId})]}]);let current=true;
 const api=createWeeklyLineups({client:q.client,validatedUser:{id:owner},current:()=>current});
 assert.equal((await api.save({id,title:'My XI',season:'2026/27',week:8,snapshot:snapshot()})).ok,true);
 assert.equal((await api.save({id,revision:1,title:'Edit',snapshot:snapshot()})).record.revision,2);
 assert.deepEqual((await api.get(id)).record.snapshot,snapshot());assert.equal((await api.list()).records.length,2);
 assert.equal(q.calls[0].find(c=>c[0]==='insert')[1].user_id,owner);assert(q.calls[1].some(c=>c[0]==='eq'&&c[1]==='revision'&&c[2]===1));
 for(const call of q.calls.slice(1))assert(call.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]===owner));
 assert.equal(canonicalWeeklySnapshot(pickWeeklyPlayer(emptyWeeklyXI(),1,{...player,id:'fotmob-player'})),null);
 current=false;assert.equal((await api.save({id,title:'stale',snapshot:snapshot()})).error.code,'state_changed');assert.equal(q.calls.length,4);
 const foreign=createWeeklyLineups({client:queryMock([{data:record({user_id:other})}]).client,validatedUser:{id:owner},current:()=>true});assert.equal((await foreign.get(id)).ok,false);
});

test('Weekly save ambiguity keeps one ID; revision conflicts and switched accounts never report success',async()=>{
 const q=queryMock([{error:{code:'23505'}},{data:record({season:null,week:null})},{data:null}]);const api=createWeeklyLineups({client:q.client,validatedUser:{id:owner},current:()=>true});
 assert.equal((await api.save({id,title:'My XI',snapshot:snapshot()})).ok,true);assert.equal((await api.save({id,revision:1,title:'changed',snapshot:snapshot()})).error.code,'conflict');
 const pending=deferred();let active=true;const race=createWeeklyLineups({client:queryMock([pending.promise]).client,validatedUser:{id:owner},current:()=>active});const result=race.get(id);active=false;pending.resolve({data:record()});assert.equal((await result).error.code,'state_changed');
});

test('collection paginates all real records, groups same week, distinct weeks and unassigned, and links exact IDs',async()=>{
 const f=exportFixture();f.nodes.weeklyCollection=new ExportNode();const calls=[];
 const rows=[record(),record({id:copyId}),record({id:other,week:9}),record({id:owner,season:null,week:null})];
 const page=mountWeeklyCollection({...f,current:()=>true,api:{list:async offset=>{calls.push(offset);return offset===0?{ok:true,records:rows.slice(0,2),more:true,nextOffset:2}:{ok:true,records:rows.slice(2),more:false};}}});await page.ready;
 assert.deepEqual(calls,[0,2]);const nodes=allNodes(f.nodes.weeklyCollection);assert.equal(nodes.filter(n=>n.tagName==='section').length,3);assert.equal(nodes.filter(n=>n.tagName==='a').length,4);assert.equal(nodes.find(n=>n.tagName==='a').href,'/haftanin-ilk-11i?id='+id);assert.equal(weeklyGroup(rows[3]),'Hafta atanmamış');page.dispose();
 for(const path of ['/ilk-11lerim','/ilk-11lerim.html'])assert.equal(resolvePage({pathname:path}).page,'weekly-collection');
 assert.equal(weeklyGroup(record({season:'2026/27'})),weeklyGroup(record({season:'2026/2027'})));
 const route=resolvePage({pathname:'/haftanin-ilk-11i',search:'?id='+id});assert.equal(route.path,'/haftanin-ilk-11i.html?id='+id);
 assert.equal(loginDestination(new URL(loginUrl(route.path),'http://localhost').search),route.path);
 for(const suffix of ['&next=https://evil.test','#external','&id='+id])assert.equal(safeInternalRedirect(route.path+suffix),null);
});

test('server Weekly editor requires explicit legacy import, confirms save, reuses ID, and never deletes local source',async()=>{
 const f=exportFixture(),storage=memory(),store=createWeeklyStore({userId:owner,source:'canonical',storage,current:()=>true});store.write(snapshot());const before=new Map(storage.data);
 f.window=Object.create(f.window);Object.defineProperty(f.window,'localStorage',{value:storage});f.nodes.weeklyXIContent=new ExportNode();const saves=[],pending=deferred();
 const page=mountWeeklyXI({...f,current:()=>true,userId:owner,catalogue:{source:'canonical',model:{teams:[],players:[]}},records:{save:input=>{saves.push(input);return saves.length===1?pending.promise:Promise.resolve({ok:true,record:record({id:input.id,revision:2})});}}});await page.ready;
 const find=cls=>allNodes(f.nodes.weeklyXIContent).find(n=>n.className===cls),filled=()=>allNodes(f.nodes.weeklyXIContent).filter(n=>n.className==='weekly-slot'&&n.dataset.filled==='true');
 assert.equal(filled().length,0);assert.equal(saves.length,0);fire(find('weekly-import'),'click');assert.equal(filled().length,1);assert.equal(saves.length,0);
 fire(find('weekly-save'),'click');assert.equal(find('weekly-save').disabled,true);assert.notEqual(find('weekly-save-state').textContent,'Kaydedildi');assert.equal(saves.length,1);
 pending.resolve({ok:true,record:record({id:saves[0].id})});await tick();assert.equal(find('weekly-save-state').textContent,'Kaydedildi');
 fire(find('weekly-save'),'click');await tick();assert.equal(saves[0].id,saves[1].id);assert.equal(saves[1].revision,1);assert.deepEqual(storage.data,before);page.dispose();
});

test('shared pitch renderer preserves exact jerseys, numbers, two-line names and coordinates in editor/preview/PNG model',()=>{
 const f=exportFixture(),state=snapshot();const pitch=createWeeklyPitch({...f,state}),graphic=createWeeklyGraphic({...f,state,palette:weeklyPalette(f.document,f.window)});
 const projected=allNodes(graphic).find(n=>n.attrs.viewBox==='0 0 736 750');assert(projected);
 assert.equal(pitch.children.map(serialize).join(''),projected.children.map(serialize).join(''));
 assert(Math.abs(projected.attrs.width/projected.attrs.height-736/750)<1e-12);
 assert.deepEqual(weeklyNameLines('Alexandru Maxim',70,t=>t.length*6),['Alexandru','Maxim']);
 assert.equal(weeklyNameLines('A very exceptionally long surname',45,t=>t.length*6).length,2);
 assert.match(serialize(pitch),/Alexandru Maxim Long Name/);assert.match(serialize(pitch),/>10</);
});

test('Profile uses real recent account records and ignores local drafts as its primary list',async()=>{
 const f=profileDocument(),calls=[];const page=mountProfile({...f,current:()=>true,validatedUser:{id:owner},api:{load:async()=>({ok:true,profile:null})},weeklyRecords:{list:async(...args)=>{calls.push(args);return {ok:true,records:[record()]};}},weeklyStores:[{read(){throw Error('No browser records in account list');}}]});
 await page.ready;assert.deepEqual(calls,[[0,4]]);const list=f.mounts[0].fields['#profileWeeklySaved'];assert.equal(list.children.length,1);assert.equal(list.children[0].href,'/haftanin-ilk-11i?id='+id);assert.equal(list.children[0].children[0].children[0].textContent,'My XI');page.dispose();
});

test('account editor reopens exact record then updates it, keeps unknown metadata and reports failure without local success',async()=>{
 const f=exportFixture();f.window.location=new URL('/haftanin-ilk-11i?id='+id,'http://localhost:4173');f.nodes.weeklyXIContent=new ExportNode();const calls=[];
 const state=snapshot();state.slots[1].x=33;state.slots[1].y=40;
 const page=mountWeeklyXI({...f,userId:owner,current:()=>true,catalogue:{source:'canonical',model:{teams:[],players:[]}},records:{get:async key=>{assert.equal(key,id);return {ok:true,record:record({snapshot:state,week:null,season:null})};},save:async value=>{calls.push(value);return {ok:false,error:{code:'weekly_request_failed'}};}}});await page.ready;
 const find=cls=>allNodes(f.nodes.weeklyXIContent).find(n=>n.className===cls),slot=allNodes(f.nodes.weeklyXIContent).find(n=>n.className==='weekly-slot'&&n.dataset.slotId==='1');assert.equal(slot.style.left,'33%');assert.equal(slot.style.top,'40%');assert.equal(find('weekly-save-state').textContent,'Kaydedildi');
 fire(find('weekly-save'),'click');await tick();assert.equal(calls[0].id,id);assert.equal(calls[0].revision,1);assert.equal(calls[0].week,null);assert.equal(calls[0].season,null);assert.deepEqual(calls[0].snapshot,state);assert.equal(find('weekly-save-state').textContent,'Kaydedilemedi');page.dispose();
});

test('FIX1 season input accepts 2026/27, 2026/2027 and 26/27, rejects invalid or inconsistent seasons',()=>{
 for(const [input,stored] of [['2026/27','2026/27'],[' 2026/2027 ','2026/2027'],['26/27','2026/27'],['26/2027','2026/2027'],['1999/00','1999/00'],['',null],['   ',null],[null,null]])assert.equal(weeklySeason(input),stored,String(input));
 for(const input of ['2026/28','26/28','2026/2028','2026/26','2026-27','26-27','2026','26','2026/027','026/27','2026/27/28','abcd/ef','2026 /27','٢٠٢٦/٢٧'])assert.equal(weeklySeason(input),undefined,input);
 for(const input of ['2026/27','26/27','2026/2027'])assert.match(weeklySeason(input),/^\d{4}\/\d{2,4}$/);
});

test('FIX1 editor saves shortened season normalized and blocks invalid season with a field message, without a request',async()=>{
 const f=exportFixture();f.nodes.weeklyXIContent=new ExportNode();const calls=[];
 const page=mountWeeklyXI({...f,userId:owner,current:()=>true,catalogue:{source:'canonical',model:{teams:[],players:[]}},records:{save:async value=>{calls.push(value);return {ok:true,record:record({id:value.id,season:value.season})};}}});await page.ready;
 const nodes=()=>allNodes(f.nodes.weeklyXIContent),find=cls=>nodes().find(n=>n.className===cls),season=nodes().find(n=>n.placeholder==='2026/27');
 season.value='26/28';fire(find('weekly-save'),'click');await tick();
 assert.equal(calls.length,0);assert.equal(season.attrs['aria-invalid'],'true');assert.equal(season.focused,true);
 assert.match(find('weekly-status').textContent,/Sezon 2026\/27 veya 26\/27/);assert.equal(find('weekly-save').disabled,false);
 season.value=' 26/27 ';fire(find('weekly-save'),'click');await tick();
 assert.equal(calls.length,1);assert.equal(calls[0].season,'2026/27');assert.equal(season.value,'2026/27');assert.equal(season.attrs['aria-invalid'],undefined);
 season.value='';fire(find('weekly-save'),'click');await tick();assert.equal(calls[1].season,null);page.dispose();
});

test('PROD5 poster week follows the week field: matches unavailable, typed week, reopened record and signed-out fallback',async()=>{
 const played={ok:true,matches:[{status:'finished',round:8,season:'2026-2027',kickoff:'2026-10-10T18:00:00Z'}]};
 const mount=(extra,url='/haftanin-ilk-11i')=>{const f=exportFixture();f.window.location=new URL(url,'http://localhost:4173');f.nodes.weeklyXIContent=new ExportNode();
  const page=mountWeeklyXI({...f,userId:owner,current:()=>true,catalogue:{source:'canonical',model:{teams:[],players:[]}},now:()=>Date.parse('2026-10-14'),...extra});
  const nodes=()=>allNodes(f.nodes.weeklyXIContent);return {page,nodes,shown:()=>nodes().find(n=>n.attrs?.class==='weekly-week-number').textContent,week:()=>nodes().find(n=>n.type==='number')};};
 const calls=[],save=async value=>{calls.push(value);return {ok:true,record:record({id:value.id,week:value.week})};};
 // matches not deployed: no week is invented; a typed week is shown and saved.
 const a=mount({matchesApi:{load:async()=>({ok:false,error:{code:'matches_unavailable'}})},records:{save}});await a.page.ready;
 assert.ok(!a.week().value);assert.equal(a.shown(),'—');
 a.week().value='8';fire(a.week(),'input');assert.equal(a.shown(),'8');
 // preview/PNG surface (same graphic the PNG download renders) shows the typed week and follows edits.
 const exported=()=>allNodes(a.nodes().find(n=>n.className==='week-xi-export-surface')).filter(n=>n.attrs?.class==='weekly-week-number').map(n=>n.textContent);
 fire(a.nodes().find(n=>n.className==='weekly-preview-trigger'),'click');assert.deepEqual(exported(),['8']);
 a.week().value='9';fire(a.week(),'input');assert.deepEqual(exported(),['9']);assert.equal(a.shown(),'9');
 fire(a.nodes().find(n=>n.tagName==='button'&&n.textContent==='Geri Dön'),'click');a.week().value='8';fire(a.week(),'input');
 fire(a.nodes().find(n=>n.className==='weekly-save'),'click');await tick();assert.equal(calls[0].week,8);a.page.dispose();
 // a reopened record keeps its own week even when a later round has been played.
 const b=mount({matchesApi:{load:async()=>played},records:{get:async()=>({ok:true,record:record({week:5})}),save}},'/haftanin-ilk-11i?id='+id);await b.page.ready;
 assert.equal(b.week().value,'5');assert.equal(b.shown(),'5');b.page.dispose();
 // a new lineup the user already touched is never overwritten by late match data.
 const late=deferred(),d=mount({matchesApi:{load:()=>late.promise},records:{save}});
 d.week().value='3';fire(d.week(),'input');late.resolve(played);await d.page.ready;assert.equal(d.week().value,'3');assert.equal(d.shown(),'3');d.page.dispose();
 // signed out (no account records, no week field): the detected played week is still shown.
 const c=mount({matchesApi:{load:async()=>played}});await c.page.ready;assert.equal(c.shown(),'8');c.page.dispose();
});

test('new account lineup takes real played season/week only, not URL week, and safe shell keeps protected content hidden',async()=>{
 const f=exportFixture();f.window.location=new URL('/haftanin-ilk-11i?hafta=30','http://localhost:4173');f.nodes.weeklyXIContent=new ExportNode();const calls=[];
 const page=mountWeeklyXI({...f,userId:owner,current:()=>true,catalogue:{source:'canonical',model:{teams:[],players:[]}},now:()=>Date.parse('2026-10-14'),matchesApi:{load:async()=>({ok:true,matches:[{status:'finished',round:8,season:'2026-2027',kickoff:'2026-10-10T18:00:00Z'}]})},records:{save:async value=>{calls.push(value);return {ok:true,record:record({id:value.id})};}}});await page.ready;
 fire(allNodes(f.nodes.weeklyXIContent).find(n=>n.className==='weekly-save'),'click');await tick();assert.equal(calls[0].week,8);assert.equal(calls[0].season,'2026/2027');page.dispose();
 const html=readFileSync(new URL('../dist/mac-studyosu.html',import.meta.url),'utf8');assert.match(html,/id="protectedContent"[^>]*hidden inert/);assert.match(html,/id="guardStatus"[^>]*data-state="pending"/);assert.doesNotMatch(html,/Oturum doğrulanıyor/);
 const css=readFileSync(new URL('../dist/styles.css',import.meta.url),'utf8');assert.match(css,/\.player \.player-name[^}]*-webkit-line-clamp:2/);
});

test('Weekly real Postgres SQL enforces A/B/anon ownership, immutable metadata, multiple records and snapshot contract',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema tactics_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261013165455_weekly_lineups.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../supabase/migrations/20261014074114_weekly_snapshot_validation.sql',import.meta.url),'utf8'));
 for(const field of ['version','slots']){const invalid={...snapshot(),[field]:null};assert.equal((await db.query('select tactics_private.weekly_snapshot_valid($1) valid',[JSON.stringify(invalid)])).rows[0].valid,false);}
 const invalid=snapshot();invalid.slots[1].role=null;assert.equal((await db.query('select tactics_private.weekly_snapshot_valid($1) valid',[JSON.stringify(invalid)])).rows[0].valid,false);
 await db.query('insert into auth.users values($1),($2)',[owner,other]);
 const as=async(uid,fn,role='authenticated')=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
 const insert=(pid,uid=owner,s=snapshot(),week=8)=>db.query('insert into public.weekly_lineups(id,user_id,title,season,week,formation,snapshot) values($1,$2,$3,$4,$5,$6,$7) returning *',[pid,uid,'My XI','2026/27',week,s.formation,JSON.stringify(s)]);
 await as(owner,async()=>{await insert(id);await insert(copyId);await insert(owner,owner,snapshot(),9);assert.equal((await db.query('select * from public.weekly_lineups')).rows.length,3);const updated=await db.query('update public.weekly_lineups set title=$1,snapshot=$2 where id=$3 returning revision',['Edited',JSON.stringify(snapshot()),id]);assert.equal(Number(updated.rows[0].revision),2);});
 await as(other,async()=>{assert.equal((await db.query('select * from public.weekly_lineups')).rows.length,0);assert.equal((await db.query("update public.weekly_lineups set title='Forbidden' returning id")).rows.length,0);assert.equal((await db.query('delete from public.weekly_lineups returning id')).rows.length,0);await assert.rejects(insert(other),e=>e.code==='42501');});
 await as('',async()=>{await assert.rejects(db.query('select * from public.weekly_lineups'),e=>e.code==='42501');await assert.rejects(insert(other),e=>e.code==='42501');},'anon');
 await as(owner,async()=>{await assert.rejects(db.query('update public.weekly_lineups set user_id=$1',[other]),e=>e.code==='42501');await assert.rejects(db.query('update public.weekly_lineups set revision=99'),e=>e.code==='42501');await assert.rejects(insert(other,owner,pickWeeklyPlayer(emptyWeeklyXI(),1,{...player,id:'old-provider-id'})),e=>e.code==='23514');assert.equal((await db.query('delete from public.weekly_lineups where id=$1 returning id',[id])).rows.length,1);});
 }finally{await db.close();}
});
