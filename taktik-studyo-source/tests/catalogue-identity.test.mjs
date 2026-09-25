import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditInput} from '../scripts/catalogue/audit-input.mjs';
import {planSync,emptyState,fetchBsdCatalogue} from '../scripts/catalogue/sync.mjs';
import {generateFallback} from '../scripts/catalogue/fallback.mjs';
import {positionCompatibility,SPECIFIC_POSITIONS} from '../src/lib/bsd-specific-position.js';
import {identityResolver,resolveProjectIdentities,createInternalProjectSnapshot,planOverrideAliases} from '../src/lib/catalogue-identity.js';
import {defaultXI,squadFallback,formationSlots} from '../src/lib/catalogue-default-xi.js';
import {snapshot} from './helpers/studio-project-fixture.mjs';
import {normalizeStudioProjectSnapshot,projectBoardState} from '../src/lib/studio-project-snapshot.js';
import {readDraft,writeDraft} from '../src/lib/drafts.js';
import {shareValid,toShare} from '../src/lib/validation.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/bsd-catalogue-audit.json',import.meta.url),'utf8'));
const input={...fixture,provider:'bsd',complete:true};
const plan=planSync(input),state={...emptyState(),...plan,
 teamAliases:fixture.teams.map(t=>({namespace:'taktik-v1',legacy_id:t.legacyId,team_id:t.id})),
 playerAliases:fixture.aliases.map(a=>({namespace:'taktik-v1',legacy_id:a.legacy_id,player_id:plan.playerMappings.find(p=>p.provider_id===a.provider_id).player_id}))};
const resolver=identityResolver(state);
test('D2 audit extraction reproduces frozen 543-player fixture and exact safe cohorts',()=>{
 assert.deepEqual(auditInput(),fixture);
 assert.deepEqual(fixture.summary,{teams:18,players:543,high:359,safeVariants:29,safeAliases:388,unresolved:151});
 for(const [reason,n] of [['MEDIUM',88],['NO_SAFE_MATCH',61],['AMBIGUOUS',2]])assert.equal(fixture.unresolved.filter(r=>r.reason===reason).length,n);
 assert.equal(resolver.player('1011932'),null);assert.equal(resolver.player('1415502'),null);
});
test('D2 position facts preserved, all 15 values recognized, 81 lossy and 13 conflicts explicit',()=>{
 const all=fixture.players.map(p=>positionCompatibility(p.position_group,p.specific_position));
 assert.equal(all.filter(p=>p.lossy).length,81);assert.equal(all.filter(p=>p.conflict).length,13);
 assert.deepEqual(new Set(fixture.players.map(p=>p.specific_position)),new Set(SPECIFIC_POSITIONS));
 for(const code of ['LM','RM','DEF','MID','FWD'])assert.equal(positionCompatibility({LM:'M',RM:'M',DEF:'D',MID:'M',FWD:'F'}[code],code).preferredSlot,null);
 assert.deepEqual(positionCompatibility('F','AM'),{position_group:'F',specific_position:'AM',conflict:true,lossy:false,slots:['SLK','SĞK','SF'],preferredSlot:null});
 assert.throws(()=>positionCompatibility('D','SURPRISE'),/invalid_position/);
});
test('D2 provider-independent UUIDs reused across updates/provider changes; metadata protected',()=>{
 assert(plan.players.every(p=>/^[a-f0-9-]{36}$/.test(p.id)&&!('roles' in p)&&!('photo_url' in p)));
 const second=planSync(input,state);assert.deepEqual(second.players,plan.players);assert.equal(second.summary.newPlayers,0);
 const changed=structuredClone(input);changed.teams[0].short_name='BAD';changed.teams[0].color_primary='#000000';changed.teams[0].display_name='Provider new name';
 assert.deepEqual(planSync(changed,state).teams,plan.teams);
 const p=plan.players[0],r=identityResolver({...state,playerMappings:[...state.playerMappings,{provider:'next',provider_id:'foreign-123',player_id:p.id}]});
 assert.equal(r.player('foreign-123','next'),p.id);assert.equal(r.player(p.id,'internal'),p.id);
 const added={...input,players:[...input.players,{...input.players[0],provider_id:'999999991'}]};
 const newPlan=planSync(added,state);assert.equal(newPlan.summary.newPlayers,1);assert(!state.players.some(p=>p.id===newPlan.players.at(-1).id));
 const absent={...input,players:input.players.slice(1)};assert.deepEqual(planSync(absent,state).inactive,[p.id]);
 const transfer=structuredClone(input);transfer.players[0].team_id=input.teams[1].id;
 const moved=planSync(transfer,state).players[0];assert.equal(moved.id,p.id);assert.equal(moved.team_id,input.teams[1].id);
 assert.throws(()=>planSync({...input,complete:false},state));assert.throws(()=>planSync({...input,players:[...input.players,input.players[0]]},state),/duplicate/);
});
test('D2 legacy/team/BSD identity lookup never guesses unresolved players or edits embedded fields',()=>{
 assert.equal(resolver.team('fotmob-8637'),'galatasaray');assert.equal(resolver.team('125','bsd'),'galatasaray');
 const a=fixture.aliases[0],target=state.playerAliases[0].player_id;assert.equal(resolver.player(a.legacy_id),target);assert.equal(resolver.player(a.provider_id,'bsd'),target);
 const p={athleteId:'1011932',name:'Historical',number:6,role:'ÖL'};assert.deepEqual(resolver.historicalPlayer(p),{embedded:p,internalId:null});
 assert.equal(resolver.player('unrecognized','bsd'),null);assert.deepEqual(p,{athleteId:'1011932',name:'Historical',number:6,role:'ÖL'});
});
test('D2 override migration keeps owner values, unresolved rows, and conflicting local/BSD rows',()=>{
 const a=fixture.aliases[0],owner='owner',base={user_id:owner,name:'Custom',number:4,role:'MO'};
 const rows=[{...base,player_key:'local:'+a.legacy_id},{...base,player_key:'local:1011932'}];
 const result=planOverrideAliases(rows,owner,resolver);assert.equal(result.mapped[0].player_key,'internal:'+resolver.player(a.legacy_id));assert.equal(result.mapped[0].name,'Custom');assert.equal(result.unresolved.length,1);
 const collision=planOverrideAliases([...rows,{...base,player_key:'bsd:'+a.provider_id,name:'Other'}],owner,resolver);
 assert.equal(collision.mapped.length,0);assert.equal(collision.collisions.length,1);assert.equal(rows[0].player_key,'local:'+a.legacy_id);
 assert.throws(()=>planOverrideAliases(rows,'other',resolver),/owner_mismatch/);
});
test('D2 historical draft/share render without catalogue; new internal draft/share stays v1-compatible',()=>{
 const a=fixture.aliases[0];
 const old={team:{id:'fotmob-8637',name:'Historical GS',short:'GS',color:'#a51935',color2:'#efb62a'},formation:'4-3-3',customized:true,
  players:Array.from({length:11},(_,id)=>({id,x:50,y:5+id*8,name:'Embedded '+id,number:id+1,role:id===0?'KL':'MO',renamed:false,athleteId:id===0?a.legacy_id:String(9900000+id)})),drawings:[]};
 const raw=JSON.stringify(old),data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert(writeDraft(storage,'taktik:draft:shared:example:v1',old));assert.deepEqual(readDraft(storage,'taktik:draft:shared:example:v1'),old);assert(shareValid(toShare(old)));
 const resolved=old.players.map(p=>resolver.historicalPlayer(p));assert.equal(resolved[0].internalId,resolver.player(a.legacy_id));assert.equal(resolved[1].embedded.name,'Embedded 1');assert.equal(JSON.stringify(old),raw);
 const next=structuredClone(old);next.team.id='galatasaray';next.players.forEach((p,i)=>{p.athleteId=plan.players[i].id;});
 assert(writeDraft(storage,'taktik:draft:user:owner:studio:v1',next));assert.deepEqual(readDraft(storage,'taktik:draft:user:owner:studio:v1'),next);assert(shareValid(toShare(next)));
 assert.equal(readDraft(storage,'taktik:draft:shared:example:v1').team.id,'fotmob-8637');
});
test('D2 old project bench/swaps/drawings remain intact; new project remaps all joins atomically',()=>{
 const s=snapshot(),before=JSON.stringify(s),old=projectBoardState(s);assert(old);
 const sidecar=resolveProjectIdentities(s,resolver);assert.equal(JSON.stringify(s),before);assert(sidecar.home.people.length>=11);
 // This synthetic historic fixture has IDs not in the audit. Resolving fails closed.
 assert.throws(()=>createInternalProjectSnapshot(s,resolver),/unresolved/);assert.equal(JSON.stringify(s),before);
 const mappings=[],teams=[],players=[];
 for(const side of ['home','away']){
  const t=s.teams[side];teams.push({id:side});
  t.teamId=side;[...t.players,...t.bench].forEach((p,i)=>{
   const id=`${side==='home'?'a':'b'}0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
   players.push({id});mappings.push({provider:'bsd',provider_id:p.playerId,player_id:id});
  });
 }
 // Fixture IDs can overlap across sides: use a per-side namespace-free unique source ID.
 mappings.length=0;for(const side of ['home','away'])[...s.teams[side].players,...s.teams[side].bench].forEach((p,i)=>{
  p.playerId=String((side==='home'?1000:2000)+i);mappings.push({provider:'bsd',provider_id:p.playerId,player_id:`${side==='home'?'a':'b'}0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`});
 });
 // Persisted substitution: a bench person occupies a starter's original slot.
 const bench=s.teams.home.bench[0];assert(bench);
 const slot=s.working.find(w=>w.slotKey===s.teams.home.players[1].key);slot.personKey=bench.key;slot.x=.42;slot.y=.61;
 const r=identityResolver({teams,players,playerMappings:mappings}),n=createInternalProjectSnapshot(s,r);
 assert(normalizeStudioProjectSnapshot(n));assert(projectBoardState(n));assert.deepEqual(n.drawings,s.drawings);assert.deepEqual(n.pitch,s.pitch);
 assert(n.teams.home.players.every(p=>p.key.startsWith('internal:')&&p.playerId.length===36));assert(n.working.every(p=>p.slotKey.startsWith('internal:')&&p.personKey.startsWith('internal:')));
 assert.equal(n.working.find(w=>w.x===.42&&w.y===.61).personKey,n.teams.home.bench[0].key);
 assert.deepEqual(resolveProjectIdentities(n,r).home.people.map(p=>p.internalId),[...n.teams.home.players,...n.teams.home.bench].map(p=>p.playerId));
});
test('D2 default XI uses latest completed same-season confirmed XI or deterministic squad fallback',()=>{
 const teamId='galatasaray',squad=plan.players.filter(p=>p.team_id===teamId),arrangement=squadFallback(squad);
 assert.deepEqual(squadFallback([...squad].reverse()),arrangement);assert.equal(new Set(arrangement.starters.map(p=>p.playerId)).size,11);
 const ids=[...arrangement.starters.map(p=>p.playerId),...arrangement.bench];
 const lineup={startersValid:true,formation:'4-3-3',starters:[],substitutes:[]};
 ids.forEach((id,i)=>{const p=squad.find(p=>p.id===id),m=state.playerMappings.find(m=>m.player_id===id);const row={id:m.provider_id,name:p.display_name,number:p.shirt_number,position:{G:'goalkeeper',D:'defender',M:'midfielder',F:'forward'}[p.position_group]};(i<11?lineup.starters:lineup.substitutes).push(row);});
 const match={id:'1',teamId,seasonId:'1539',status:'finished',kind:'confirmed',kickoff:'2026-09-20T15:00:00Z',lineup};
 const run=matches=>defaultXI({teamId,seasonId:'1539',players:plan.players,matches,resolver});
 const chosen=run([match]);assert.equal(chosen.kind,'recent-confirmed');assert.equal(chosen.bench.length,lineup.substitutes.length);
 for(const f of ['3-4-3','4-1-4-1','3-4-2-1','5-3-2'])assert.equal(formationSlots(f).length,11);
 assert.equal(run([{...match,lineup:{...lineup,formation:'3-4-3'}}]).kind,'recent-confirmed');
 assert.equal(run([{...match,kind:'predicted'}]).kind,'default-arrangement');assert.equal(run([{...match,seasonId:'old'}]).kind,'default-arrangement');
 assert.equal(run([match,{...match,id:'2',kickoff:'2026-09-21T15:00:00Z',lineup:null}]).kind,'default-arrangement');
});
test('D2 replacement fallback is deterministic provider-independent inert JSON with no forbidden fields',()=>{
 const json=generateFallback(plan),data=JSON.parse(json);assert.equal(data.players.length,543);assert.equal(data.teams.length,18);
 assert.equal(generateFallback({...plan,players:[...plan.players].reverse()}),json);
 for(const text of ['fotmob-','photo_url','source_url','selection_rank','starts','provider_id','faces/'])assert(!json.includes(text));
 assert.equal(data.teams.find(t=>t.id==='galatasaray').short_name,'GS');
 assert.throws(()=>generateFallback({...plan,players:[{...plan.players[0],id:'603669'}]}),/internal_identity_required/);
});
test('D2 fetch module constructs only bounded GET endpoints, whitelists data, rejects incomplete runs',async()=>{
 const reg=input.teams[0],squad=input.players.filter(p=>p.team_id===reg.id),calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push([url,options]);let data;
  if(url.includes('?'))data={count:1,next:null,results:[{id:Number(reg.bsdId)}]};
  else if(url.includes('/squad/'))data={team_id:Number(reg.bsdId),count:squad.length,players:squad.map(p=>({id:Number(p.provider_id),name:p.display_name,position:p.position_group,jersey_number:p.shirt_number}))};
  else{const p=squad.find(p=>url.endsWith('/'+p.provider_id+'/'));data={id:Number(p.provider_id),name:p.display_name,current_team_id:Number(reg.bsdId),position:p.position_group,jersey_number:p.shirt_number,specific_position:p.specific_position,photo:'never copy'};}
  return {ok:true,text:async()=>JSON.stringify(data)};
 };
 const got=await fetchBsdCatalogue({token:'test-fixture-only',registrations:[reg],fetchImpl});assert.equal(got.players.length,squad.length);assert(!JSON.stringify(got).includes('photo'));
 assert(calls.every(([url,o])=>url.startsWith('https://sports.bzzoiro.com/api/v2/')&&o.method==='GET'&&o.redirect==='error'));
 await assert.rejects(fetchBsdCatalogue({token:'test-fixture-only',registrations:[reg],fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({count:1,next:'https://evil.test',results:[{id:Number(reg.bsdId)}]})})}),/team_scope_changed/);
 await assert.rejects(fetchBsdCatalogue({token:'test-fixture-only',registrations:[reg],fetchImpl:async()=>{throw Error('secret raw response');}}),/provider_unavailable/);
});
