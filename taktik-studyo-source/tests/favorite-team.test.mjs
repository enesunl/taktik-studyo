import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mountProfileFavorite} from '../src/lib/profile-favorite-ui.js';
import {mountProfile} from '../src/lib/profile-ui.js';
import {loadFavoriteTeam,resolveFavoriteTeam,promoteFavoriteMatch} from '../src/lib/favorite-team.js';
import {teamColors} from '../src/lib/team-choice.js';
import {mountMatches} from '../src/lib/matches-ui.js';
import {ProfileNode,profileDocument,row,A,deferred} from './helpers/profile-fixture.mjs';
import {matchesDocument,matchesWindow,allNodes,textOf,match} from './helpers/matches-fixture.mjs';

const teams=[{id:'galatasaray',name:'Galatasaray',color:'#a00028',color2:'#ffcc00',catalogueActive:true},{id:'besiktas',name:'Beşiktaş',color:'#000000',color2:'#ffffff',catalogueActive:true}];
const result=slug=>({ok:true,profile:{favorite_team_slug:slug,onboarding_completed_at:'2026-10-05T00:00:00Z',onboarding_version:1}});
function fixture({slug='galatasaray',load=async()=>result(slug),catalogue=async()=>teams,write=async s=>result(s)}={}){
 const root=new ProfileNode('section'),initials=new ProfileNode('span'),writes=[];let active=true;
 const document={createElement:tag=>new ProfileNode(tag)};
 const api={loadPreferences:load,setFavoriteTeam:s=>{writes.push(['set',s]);return write(s);},clearFavoriteTeam:()=>{writes.push(['clear']);return write(null);}};
 const page=mountProfileFavorite({document,root,initials,api,catalogue:{loadTeams:catalogue},current:()=>active});
 const find=(tag,text)=>allNodes(root).find(n=>n.tagName===tag&&(text===undefined||n.textContent===text));
 return {root,initials,page,writes,find,choose:async slug=>allNodes(root).find(n=>n.tagName==='input'&&n.value===slug).emit('change'),invalidate(){active=false;}};
}

test('profile resolves stored canonical slug, edits with radios, saves and clears without reload',async()=>{
 const f=fixture();await f.page.ready;assert.match(textOf(f.root),/Galatasaray/);assert.equal(f.initials.attrs['--favorite-primary'],teams[0].color);
 const edit=f.find('button','Değiştir →');await edit.emit('click');assert.equal(edit.attrs['aria-expanded'],'true');
 await f.choose('besiktas');const radio=allNodes(f.root).find(n=>n.value==='besiktas');assert(radio.checked);assert.match(textOf(f.root),/✓ Seçildi/);
 await f.find('form').emit('submit');assert.deepEqual(f.writes,[['set','besiktas']]);assert.match(textOf(f.root),/Beşiktaş/);assert(f.find('form').hidden);assert(edit.focused);assert.equal(f.initials.attrs['--favorite-secondary'],'#ffffff');
 await edit.emit('click');await f.find('button','Favori takımı kaldır').emit('click');assert.deepEqual(f.writes,[['set','besiktas'],['clear']]);assert.match(textOf(f.root),/Seçilmedi/);assert.equal(f.initials.attrs['data-team-accent'],'false');f.page.dispose();
});
test('no favorite remains neutral and can open the picker',async()=>{
 const f=fixture({slug:null});await f.page.ready;assert.match(textOf(f.root),/Seçilmedi/);assert.equal(f.initials.attrs['data-team-accent'],'false');await f.find('button','Takım seç →').emit('click');assert(!f.find('form').hidden);f.page.dispose();
});
test('failed save preserves selected value and picker; duplicate submits and cancellation are blocked while saving',async()=>{
 const wait=deferred();const f=fixture({write:()=>wait.promise});await f.page.ready;await f.find('button','Değiştir →').emit('click');await f.choose('besiktas');
 const pending=f.find('form').emit('submit');await f.find('form').emit('submit');await f.find('button','Vazgeç').emit('click');assert.equal(f.writes.length,1);assert(!f.find('form').hidden);
 wait.resolve({ok:false,error:{message:'private SQL'}});await pending;
 assert(!f.find('form').hidden);assert(allNodes(f.root).find(n=>n.value==='besiktas').checked);assert.match(textOf(f.root),/Tercihin kaydedilemedi/);assert.doesNotMatch(textOf(f.root),/private/);assert.equal(f.initials.attrs['--favorite-primary'],teams[0].color);f.page.dispose();
});
test('cancel and Escape restore focus without writing',async()=>{
 const f=fixture();await f.page.ready;const edit=f.find('button','Değiştir →');await edit.emit('click');await f.choose('besiktas');await f.find('button','Vazgeç').emit('click');assert(edit.focused);assert(f.find('form').hidden);
 await edit.emit('click');assert(allNodes(f.root).find(n=>n.value==='galatasaray').checked);f.find('form').listeners.get('keydown')({key:'Escape',preventDefault(){}});assert(f.find('form').hidden);assert.deepEqual(f.writes,[]);f.page.dispose();
});
test('stale slug is neutral, never rewritten, and repairable with active catalogue',async()=>{
 const f=fixture({slug:'retired-club'});await f.page.ready;assert.match(textOf(f.root),/Takım bilgisi yüklenemedi/);assert.equal(f.initials.attrs['data-team-accent'],'false');assert.deepEqual(f.writes,[]);await f.find('button','Değiştir →').emit('click');await f.choose('besiktas');await f.find('form').emit('submit');assert.deepEqual(f.writes,[['set','besiktas']]);f.page.dispose();
});
test('invalid colors stay neutral, never becoming CSS, with readable existing avatar text treatment',async()=>{
 for(const color of [null,undefined,'red','url(https://invalid.test)','<script>','#fff'])assert.equal(teamColors({...teams[0],color}),null);
 const f=fixture({catalogue:async()=>[{...teams[0],color2:'bad'}]});await f.page.ready;assert.match(textOf(f.root),/Galatasaray/);assert.equal(f.initials.attrs['data-team-accent'],'false');f.page.dispose();
 const css=readFileSync(new URL('../dist/profile.css',import.meta.url),'utf8');const rule=css.match(/\.profile-initials\[data-team-accent="true"\]\{([^}]+)\}/)[1];assert.match(rule,/box-shadow/);assert.doesNotMatch(rule,/background|color\s*:/);
});
test('catalogue failure preserves stored preference and explicit removal remains available',async()=>{
 const f=fixture({catalogue:async()=>{throw Error('private');}});await f.page.ready;assert.match(textOf(f.root),/Takım bilgisi yüklenemedi/);assert.deepEqual(f.writes,[]);await f.find('button','Değiştir →').emit('click');assert(f.find('button','Kaydet').disabled);await f.find('button','Favori takımı kaldır').emit('click');assert.deepEqual(f.writes,[['clear']]);f.page.dispose();
});
test('late preference/save results after identity change or disposal never update the UI',async()=>{
 const wait=deferred(),f=fixture({write:()=>wait.promise});await f.page.ready;await f.find('button','Değiştir →').emit('click');await f.choose('besiktas');const pending=f.find('form').emit('submit');f.invalidate();wait.resolve(result('besiktas'));await pending;assert.equal(f.initials.attrs['--favorite-primary'],teams[0].color);assert.doesNotMatch(f.find('p').textContent,/güncellendi/);f.page.dispose();
 const read=deferred(),g=fixture({load:()=>read.promise});g.page.dispose();read.resolve(result('galatasaray'));await g.page.ready;assert.equal(g.root.children.length,0);assert.equal(g.initials.attrs['data-team-accent'],'false');
});
for(const failure of ['preference','catalogue','pending'])test(failure+' does not block core profile editing, projects or logout',async()=>{
 const f=profileDocument();const clone=f.document.getElementById('profileTemplate').content.cloneNode;
 f.document.getElementById('profileTemplate').content.cloneNode=()=>{const fragment=clone();fragment.fields['#profileFavorite']=new ProfileNode('section');return fragment;};
 const pending=deferred();let writes=0,logout=0,projectReads=0;
 const api={load:async()=>({ok:true,profile:row()}),save:async()=>{writes++;return {ok:true,profile:row()};},loadPreferences:()=>failure==='pending'?pending.promise:Promise.resolve(failure==='preference'?{ok:false,error:{code:'onboarding_unavailable'}}:result('galatasaray'))};
 const page=mountProfile({document:f.document,api,validatedUser:{id:A,email:'local@example.test'},current:()=>true,catalogue:{loadTeams:async()=>{if(failure==='catalogue')throw Error('offline');return teams;}},projects:{getWorkspaceSummary:async()=>{projectReads++;return {ok:true,counts:{total:0,free:0,match:0},projects:[]};}},onSignOut:()=>logout++});
 await page.ready;if(failure!=='pending')await page.favoriteReady;
 const fields=f.mounts[0].fields;assert.equal(fields['#profileName'].textContent,'Görünen ad');assert.equal(fields['#profileReadEmail'].textContent,'local@example.test');assert.equal(projectReads,1);assert(!fields['#profileStats'].hidden);
 await fields['#profileEdit'].emit('click');await fields.form.emit('submit');assert.equal(writes,1);await fields['#profileSignOut'].emit('click');assert.equal(logout,1);
 page.dispose();pending.resolve(result('galatasaray'));await page.favoriteReady;
});

const fixtures=['A','B','Favorite','C'].map((id,i)=>({...match(),id,kickoff:`2026-09-${20+i}T17:00:00Z`,home:{...match().home,teamId:i===2?'galatasaray':'other'},away:{...match().away,teamId:'away'}}));
test('stable promotion moves exactly one match without mutation, names/provider IDs cannot impersonate canonical identity',()=>{
 assert.deepEqual(promoteFavoriteMatch(fixtures,teams[0]).matches.map(m=>m.id),['Favorite','A','B','C']);assert.deepEqual(fixtures.map(m=>m.id),['A','B','Favorite','C']);
 for(const team of [null,teams[1]])assert.equal(promoteFavoriteMatch(fixtures,team).matches,fixtures);
 const fake=[{...fixtures[0],home:{name:'Galatasaray',providerId:'galatasaray'}}];assert.equal(promoteFavoriteMatch(fake,teams[0]).favoriteMatchId,null);
 const two=[fixtures[2],{...fixtures[2],id:'second'}];assert.equal(promoteFavoriteMatch(two,teams[0]).favoriteMatchId,'Favorite');
});
test('favorite loader safely ignores missing, stale and failed preferences/catalogue',async()=>{
 for(const slug of [null,'retired-club','fotmob-123'])assert.equal(await loadFavoriteTeam({api:{loadPreferences:async()=>result(slug)},catalogue:{loadTeams:async()=>teams}}),null);
 assert.equal(resolveFavoriteTeam('galatasaray',[{...teams[0],catalogueActive:false}]),null);
 assert.equal(await loadFavoriteTeam({api:{loadPreferences:async()=>{throw Error('private');}},catalogue:{loadTeams(){throw Error('must not call');}}}),null);
 assert.equal(await loadFavoriteTeam({api:{loadPreferences:async()=>result('galatasaray')},catalogue:{loadTeams:async()=>{throw Error('offline');}}}),null);
 assert.deepEqual(await loadFavoriteTeam({api:{loadPreferences:async()=>result('galatasaray')},catalogue:{loadTeams:async()=>teams}}),teams[0]);
});
test('matches render independently, late favorite promotes within displayed round without changing URL or date headings',async()=>{
 const f=matchesDocument(),w=matchesWindow('/maclar?hafta=6'),wait=deferred();let loads=0;
 const page=mountMatches({document:f.document,window:w.window,current:()=>true,api:{load:async()=>{loads++;return {ok:true,matches:[...fixtures,{...fixtures[2],id:'another-week',round:7}]};}},loadFavorite:()=>wait.promise});
 await page.ready;const ids=()=>allNodes(f.nodes.matchesContent).filter(n=>n.dataset?.matchId).map(n=>n.dataset.matchId);assert.deepEqual(ids(),['A','B','Favorite','C']);
 wait.resolve(teams[0]);await page.favoriteReady;assert.deepEqual(ids(),['Favorite','A','B','C']);assert.equal(w.window.location.search,'?hafta=6');assert.equal(w.history.length,0);assert.equal(loads,1);
 assert.equal(allNodes(f.nodes.matchesContent).filter(n=>n.className==='match-favorite-label').length,1);
 assert.equal(allNodes(f.nodes.matchesContent).find(n=>n.className==='match-favorite-label').textContent,'Favori takımın');
 const groups=allNodes(f.nodes.matchesContent).filter(n=>n.className==='match-day');assert.match(groups[0].children[0].textContent,/22/);assert.match(groups[1].children[0].textContent,/20/);
 await allNodes(f.nodes.matchesContent).find(n=>n.attrs['aria-label']==='7. hafta').emit('click');assert.deepEqual(ids(),['another-week']);assert.equal(w.window.location.search,'?hafta=7');page.dispose();
});
for(const kind of ['none','absent','failure'])test('matches '+kind+' keeps original order and no empty favorite section',async()=>{
 const f=matchesDocument(),w=matchesWindow('/maclar?hafta=6');const page=mountMatches({document:f.document,window:w.window,current:()=>true,api:{load:async()=>({ok:true,matches:fixtures})},loadFavorite:async()=>{if(kind==='failure')throw Error('offline');return kind==='absent'?teams[1]:null;}});
 await Promise.all([page.ready,page.favoriteReady]);assert.deepEqual(allNodes(f.nodes.matchesContent).filter(n=>n.dataset?.matchId).map(n=>n.dataset.matchId),['A','B','Favorite','C']);assert(!allNodes(f.nodes.matchesContent).some(n=>n.className==='match-favorite-label'));page.dispose();
});
test('late favorite cannot resurrect disposed matches or replace a match API error',async()=>{
 for(const dispose of [false,true]){
 const f=matchesDocument(),w=matchesWindow(),wait=deferred();const page=mountMatches({document:f.document,window:w.window,current:()=>true,api:{load:async()=>({ok:false})},loadFavorite:()=>wait.promise});await page.ready;if(dispose)page.dispose();wait.resolve(teams[0]);await page.favoriteReady;
 if(dispose)assert.equal(f.nodes.matchesContent.children.length,0);else assert.match(textOf(f.nodes.matchesContent),/Maç verileri şu anda alınamıyor/);page.dispose();}
});
