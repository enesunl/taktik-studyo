// D1 read-only provider audit. Never import this file into a browser bundle.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import assert from 'node:assert/strict';
import {fetchSeason} from '../supabase/functions/matches/provider.js';
import {normalizeLineups} from '../supabase/functions/matches/detail.js';
import {teamMapping} from '../supabase/functions/matches/teams.js';
import {validXI} from '../src/lib/studio-lineups.js';
import {legacyRosterText} from './catalogue/legacy-snapshot.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const BASE='https://sports.bzzoiro.com/api/v2/';
const requests=[], cache=new Map();
// A newly opened terminal inherits the Windows user environment. Never read .env
// or pass credentials through command-line arguments, child stdout, or files.
const token=process.env.BSD_API_TOKEN?.trim();
if(!token&&!process.argv.includes('--self-test')){console.error('BSD_API_TOKEN is not available.');process.exit(1);}
function safe(value){const text=String(value??'');return (token?text.replaceAll(token,'[REDACTED]'):text).replace(/[\u0000-\u001f\u007f]/g,' ');}
async function request(path){
  if(cache.has(path))return cache.get(path);
  if(!/^(?:teams\/|events\/|players\/|leagues\/)/.test(path)||path.includes('://')||path.includes('..'))throw Error('Invalid audit endpoint');
  if(requests.length>=90)throw Error('Audit request budget reached');
  const job=(async()=>{
    const record={path,status:null};requests.push(record);
    try{
      const response=await fetch(BASE+path,{method:'GET',headers:{Authorization:'Token '+token},redirect:'error',signal:AbortSignal.timeout(25000)});
      record.status=response.status;
      if(!response.ok){await response.body?.cancel();return null;}
      const body=await response.text();if(body.length>4_000_000)throw Error('Oversize');
      return JSON.parse(body);
    }catch{record.failure='request_or_json_failed';return null;}
  })();cache.set(path,job);return job;
}
function schema(value,path='$',out=new Map()){
  const kind=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(!out.has(path))out.set(path,new Set());out.get(path).add(kind);
  if(Array.isArray(value)){for(const item of value)schema(item,path+'[]',out);}
  else if(value&&typeof value==='object'){for(const [key,item] of Object.entries(value))schema(item,path+'.'+key,out);}
  return out;
}
function schemaText(value){return [...schema(value)].map(([k,v])=>k+': '+[...v].sort().join('|')).join('\n');}
const norm=value=>String(value??'').normalize('NFKD').replace(/[ıİ]/g,'i').toLowerCase().replace(/\p{M}/gu,'').replace(/[’‘`´ʼ']/g,'').replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
const pct=(n,d)=>d?(100*n/d).toFixed(2)+'%':'n/a';
const cell=value=>safe(value).replaceAll('|','\\|').replaceAll('<','&lt;').replaceAll('>','&gt;');
const table=(headers,rows)=>'| '+headers.map(cell).join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(cell).join(' | ')+' |').join('\n')+'\n';
const countBy=(rows,key)=>rows.reduce((a,r)=>{const k=typeof key==='function'?key(r):r[key];a[k]=(a[k]||0)+1;return a;},{});
const aliases=new Map([['196',['Beşiktaş','Beşiktaş JK']],['194',['Başakşehir','Başakşehir FK','İstanbul Başakşehir']],['3380',['Amedspor','Amed Sportif Faaliyetler','Amed Sportif']],['3295',['Çorum FK','Çorum','Çorum Futbol Kulübü']]].map(([id,names])=>[id,names.map(norm)]));
async function pool(items,fn){let next=0;const out=new Array(items.length);await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{for(;;){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}));return out;}
function legacyCatalogue(){
  // This is JSON data assigned to a global, not arbitrary application execution.
  const text=legacyRosterText(); // removed from dist/ in SEC1.1; frozen evidence from Git history
  const match=text.match(/^\s*window\.TAKTIK_ROSTERS\s*=\s*([\s\S]*?);?\s*$/);
  assert(match,'Roster assignment missing');
  const roster=JSON.parse(match[1]);
  const teams=Object.entries(roster.teams).map(([name,r])=>({name,legacyTeamId:'fotmob-'+r.source.match(/\/teams\/(\d+)\//)[1],players:r.players.map(p=>({legacyPlayerId:p.id,name:p.name,number:p.number,position:p.position,roles:p.roles,starts:p.starts,value:p.value}))}));
  return {roster,teams,players:teams.flatMap(t=>t.players.map(p=>({...p,team:t.name,legacyTeamId:t.legacyTeamId})))};
}
async function teamSet(){
  const rows=[];let count=null;
  for(let page=0;page<3;page++){
    const path='teams/?league_id=11&season_id=1539&limit=200&offset='+page*200;
    const data=await request(path);assert(data&&Array.isArray(data.results),'Team list schema unavailable');
    assert(Number.isInteger(data.count)&&(count===null||count===data.count),'Team pagination count changed');count=data.count;
    rows.push(...data.results);
    if(data.next===null){assert.equal(rows.length,count);return {rows,shape:schemaText(data)};}
    const next=new URL(data.next);assert.equal(next.origin+next.pathname,BASE+'teams/');
    assert.equal(next.searchParams.get('offset'),String((page+1)*200));
    assert.equal(next.searchParams.get('league_id'),'11');assert.equal(next.searchParams.get('season_id'),'1539');
  }
  throw Error('Team pagination limit');
}
function comparePlayers(legacy,rows){
  const byName=new Map(),byId=new Map();
  for(const p of rows){const key=norm(p.name);if(!byName.has(key))byName.set(key,[]);byName.get(key).push(p);if(!byId.has(p.bsdPlayerId))byId.set(p.bsdPlayerId,[]);byId.get(p.bsdPlayerId).push(p);}
  const results=legacy.map(old=>{
    const all=byName.get(norm(old.name))||[],same=all.filter(p=>p.legacyTeamId===old.legacyTeamId),choices=same.length?same:all;
    const r={old,candidates:choices,category:'NO_MATCH',confidence:null,match:null,scope:null};
    if(!choices.length)return r;
    if(choices.length!==1||byId.get(choices[0].bsdPlayerId).length!==1){r.category='AMBIGUOUS';return r;}
    const p=choices[0],sameNumber=old.number!=null&&p.number!=null&&old.number===p.number,samePosition=old.position!=null&&p.position!=null&&old.position===p.position;
    r.match=p;r.scope=same.length?'same_team':'other_team';
    r.category=sameNumber&&samePosition?'NAME_POSITION_NUMBER':sameNumber?'NAME_AND_NUMBER':old.name===p.name?'EXACT_NAME':'NORMALIZED_NAME';
    r.confidence=same.length&&sameNumber&&samePosition?'HIGH':'MEDIUM';return r;
  });
  const claims=new Map();for(const r of results)if(r.match){const id=r.match.bsdPlayerId;if(!claims.has(id))claims.set(id,[]);claims.get(id).push(r);}
  for(const group of claims.values())if(group.length>1)for(const r of group){r.category='AMBIGUOUS';r.confidence=null;r.match=null;}
  const high=results.filter(r=>r.confidence==='HIGH'),medium=results.filter(r=>r.confidence==='MEDIUM');
  const proposed=high.map(r=>({legacyPlayerId:r.old.legacyPlayerId,bsdPlayerId:r.match.bsdPlayerId,confidence:'HIGH'}));
  assert.equal(new Set(proposed.map(p=>p.bsdPlayerId)).size,proposed.length);
  const oldNames=new Set(legacy.map(p=>norm(p.name))),unique=[...byId.values()].map(p=>p[0]);
  return {results,high,medium,proposed,unique,duplicates:[...byId].filter(([,r])=>r.length>1),bsdOnly:unique.filter(p=>!oldNames.has(norm(p.name)))};
}
function schemaTable(value){return table(['Observed field','Types'],[...schema(value)].map(([k,v])=>[k,[...v].sort().join(' / ')]));}
function colorFields(value,path='',out=[]){
  if(value&&typeof value==='object'&&!Array.isArray(value))for(const [k,v]of Object.entries(value)){
    if(/colou?r/i.test(k))out.push([path+k,typeof v==='string'&&/^#?[0-9a-f]{3,8}$/i.test(v)?v:v==null?'null':'present, non-hex']);
    else if(v&&typeof v==='object')colorFields(v,path+k+'.',out);
  }
  return out;
}
function mediaPresent(value){return [...schema(value).keys()].some(k=>/\.(?:image|image_url|photo|photo_url|logo|logo_url|media)(?:\.|$)/i.test(k));}
const productRoles=['KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF'];
const roleCodes={KL:['GK'],STP:['CB'],SLB:['LB','LWB'],SĞB:['RB','RWB'],ÖL:['DM','CDM'],MO:['CM'],OO:['AM','CAM'],SLK:['LW'],SĞK:['RW'],SF:['ST','CF']};
function profileTargets(bsd,local){
  const selected=new Map();
  const add=p=>{if(p)selected.set(p.bsdPlayerId,p);};
  for(const pos of ['G','D','M','F'])add(bsd.find(p=>p.bsdTeamId==='125'&&p.position===pos));
  // Legacy roles select a diverse sample only. Never use them as BSD role evidence.
  for(const role of productRoles){
    const old=local.players.find(p=>p.legacyTeamId==='fotmob-8637'&&p.roles.includes(role)&&bsd.some(b=>b.bsdTeamId==='125'&&norm(b.name)===norm(p.name)));
    if(old)add(bsd.find(b=>b.bsdTeamId==='125'&&norm(b.name)===norm(old.name)));
  }
  return [...selected.values()].slice(0,14);
}
function detailedRoles(profiles){
  const observed=new Set(profiles.map(p=>p.data?.specific_position).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.toUpperCase()));
  return productRoles.map(role=>{
    const codes=roleCodes[role].filter(code=>observed.has(code));
    return [role,codes.length?'DIRECTLY_AVAILABLE':role==='KL'?'DERIVABLE_FROM_BSD':'NOT_AVAILABLE',codes.length?'Observed specific_position='+codes.join('/')+'; translated to product label':role==='KL'?'G uniquely means goalkeeper':'No sufficiently specific code in the inspected sample; not an exhaustive provider-wide absence claim'];
  });
}
function roleSection(profiles){
  return 'Squad responses do not contain detailed roles. Player detail DOES expose `specific_position`; actual values must be inspected rather than treating an absent squad field as absent provider capability.\n\n'+
    table(['BSD player ID','Name','Broad position','specific_position','Detail status'],profiles.map(p=>[p.player.bsdPlayerId,p.player.name,p.data?.position??p.player.position,p.data?.specific_position??'null/missing',p.data?'observed':'failed']))+'\n'+
    table(['Product role','Classification','Evidence'],detailedRoles(profiles))+'\n'+
    'DIRECTLY_AVAILABLE denotes an explicit specific-position code with a mechanical label translation; no tactical role is inferred from a name or shirt number. Generic FWD is not proof of center-forward versus winger. Legacy roles only choose diverse probe subjects. This bounded sample is not 543-player detailed-role coverage and cannot reconstruct multi-role arrays for every player. Other codes may exist outside the sample.\n';
}
function selfTest(){
  assert.equal(norm('İSMAİL  YÜKSEK'),norm('Ismail Yuksek'));
  assert.equal(norm('N’Golo'),norm("N'Golo"));
  assert.equal(norm('Jean - Paul'),norm('Jean-Paul'));
  const old={legacyPlayerId:'1',legacyTeamId:'legacy-a',name:'İsmail Yüksek',number:5,position:'M'};
  const b={bsdPlayerId:'101',legacyTeamId:'legacy-a',name:'Ismail Yuksek',number:5,position:'M'};
  assert.equal(comparePlayers([old],[b]).high.length,1);
  assert.equal(comparePlayers([old],[{...b,number:6}]).medium.length,1);
  assert.equal(comparePlayers([old],[{...b,legacyTeamId:'legacy-b'}]).results[0].scope,'other_team');
  assert.equal(comparePlayers([old],[{...b,name:'Different Person'}]).results[0].category,'NO_MATCH');
  assert.equal(comparePlayers([old],[b,{...b,bsdPlayerId:'102'}]).results[0].category,'AMBIGUOUS');
  const collision=comparePlayers([old,{...old,legacyPlayerId:'2'}],[b]);
  assert.equal(collision.proposed.length,0);assert(collision.results.every(r=>r.category==='AMBIGUOUS'));
  assert.equal(detailedRoles([{data:{specific_position:'CB'}}]).find(r=>r[0]==='STP')[1],'DIRECTLY_AVAILABLE');
  assert.equal(detailedRoles([{data:{specific_position:'FWD'}}]).find(r=>r[0]==='SF')[1],'NOT_AVAILABLE');
  assert.equal(requests.length,0);
  console.log('Offline normalizer, matching, collision and role checks passed; 0 HTTP requests.');
}
function sourceRows(){return [
 ['Classic Taktik Tahtası','dist/app.js:31,72,76,84,98,112','Roster name-key lookup; athleteId === catalogue id; bench exclusion and overrides use identity equality. Photo/starts/value affect XI; source attribution is FotMob.'],
 ['Comparison','dist/comparison.js:24,28','Same board contract. Team select values are display names, so name changes also need compatibility.'],
 ['Free Studio','src/lib/match-layout.js:28,39,46','Derives fotmob-* from URL; source player ids pass isMatchId numeric validation; local:<side>:<team>:<player> keys.'],
 ['Match Studio','src/lib/studio-lineups.js:5; src/lib/match-layout.js:51,67','BSD team/provider ids and numeric player ids; probable-local may still contain legacy player ids. Preserve provenance namespace.'],
 ['Player overrides','src/lib/player-overrides.js:3,8; supabase/migrations/20260924094207_player_overrides.sql','local:<alphanumeric id> versus bsd:<numeric id>. Renaming catalogue IDs without mapping disconnects existing edits; do not merge collisions.'],
 ['Studio Projects','src/lib/studio-project-snapshot.js:27,31,35,46; supabase/migrations/20260923135716_studio_projects.sql','Self-contained snapshots carry teamId/playerId/key plus slotKey/personKey relationships and bench. Text IDs accepted here; rewriting must preserve all references.'],
 ['Drafts','src/lib/drafts.js; src/lib/draft-scope.js; src/lib/validation.js:18','User/shared scope keys do not encode provider; payloads retain athleteId and team names. Preserve isolation and old drafts.'],
 ['Shared lineups','src/lib/validation.js:18,39; supabase/schema/football.sql:55; supabase/functions/lineups/index.ts','Read-only snapshot display should stay independent. athleteId is bounded text, slot id is 0..10. No need to rewrite public historical snapshots merely to show them.'],
 ['Catalogue/SQL','src/lib/catalogue.js:27,31; supabase/schema/football.sql:13,25','DB IDs are text, not intrinsically FotMob/numeric. Name <=100, numbers 1..99 or NULL; roles whitelist; colors required. FotMob fallback source URL is explicit.'],
 ['Seed','scripts/prepare-seed.mjs:12,16','Derives FotMob IDs and legacy rank; separate future importer needed. Do not regenerate now.'],
 ['BSD team mapping','supabase/functions/matches/teams.js:4','All 18 mappings retain fotmob-* ID and local palette. Replace identity mapping without altering event IDs.'],
 ['Tests','tests/backend.test.mjs; tests/player-jersey.test.mjs; tests/matches-provider.test.mjs; tests/studio-projects.test.mjs; tests/player-overrides.test.mjs','Fixtures/validation/equality and seed-mapping assumptions require targeted regressions before migration.']
 ];}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  assert(process.argv.every((v,i)=>i<2||v==='--probe'),'Unsupported audit option');
  assert.equal(norm('İSMAİL  YÜKSEK'),norm('Ismail Yuksek'));assert.equal(norm('N’Golo'),norm("N'Golo"));assert.equal(norm('Jean - Paul'),norm('Jean-Paul'));
  const started=new Date().toISOString(),local=legacyCatalogue();
  const detail=await request('teams/125/'),squad=await request('teams/125/squad/');
  if(process.argv.includes('--probe')){
    console.log('Galatasaray team schema\n'+safe(schemaText(detail)));
    console.log('Galatasaray squad schema\n'+safe(schemaText(squad)));
    console.log('Request ledger: '+JSON.stringify(requests));return;
  }
  assert(detail?.id===125&&squad?.team_id===125&&Array.isArray(squad.players),'Probe schema changed');
  console.log('Probe complete; fetching scoped team set.');
  const live=await teamSet(),liveIds=new Set(live.rows.map(t=>String(t.id)));
  assert.equal(liveIds.size,live.rows.length,'Duplicate team IDs');
  const missing=[...teamMapping.keys()].filter(id=>!liveIds.has(id)),unexpected=live.rows.filter(t=>!teamMapping.has(String(t.id)));
  const verified=[],nameConflicts=[];
  for(const t of live.rows){const id=String(t.id),known=teamMapping.get(id);if(!known)continue;
    if(norm(t.name)!==norm(known.name)&&!aliases.get(id)?.includes(norm(t.name))){nameConflicts.push(t);continue;}
    verified.push({id,name:t.name,known});
  }
  const teamData=await pool(verified,async t=>{
    // Sequential inside each worker: global maximum four provider requests.
    const d=await request('teams/'+t.id+'/'),s=await request('teams/'+t.id+'/squad/');
    const ok=String(d?.id)===t.id&&norm(d.name)===norm(t.name)&&String(s?.team_id)===t.id&&Array.isArray(s.players)&&s.count===s.players.length;
    return {...t,detail:d,squad:s,ok};
  });
  console.log('Team details/squads collected: '+teamData.filter(t=>t.ok).length+'/'+verified.length);
  const bsd=teamData.filter(t=>t.ok).flatMap(t=>t.squad.players.map(p=>({bsdPlayerId:String(p.id),bsdTeamId:t.id,legacyTeamId:t.known.teamId,team:t.name,name:p.name,number:Number.isInteger(p.jersey_number)?p.jersey_number:null,position:['G','D','M','F'].includes(p.position)?p.position:null})));
  assert(bsd.every(p=>/^[1-9]\d*$/.test(p.bsdPlayerId)&&typeof p.name==='string'&&p.name.trim()),'Invalid BSD identity');
  const comparison=comparePlayers(local.players,bsd),matched=[...comparison.high,...comparison.medium];
  const numberStats=countBy(matched,r=>r.old.number==null&&r.match.number==null?'missing_both':r.old.number==null?'missing_legacy':r.match.number==null?'missing_BSD':r.old.number===r.match.number?'equal':'different');
  const positionStats=countBy(matched,r=>!r.old.position||!r.match.position?'missing':r.old.position===r.match.position?'same':'different');
  const transfers=matched.filter(r=>r.scope==='other_team');
  // Bounded, diverse player detail probes, not a 539-request biography crawl.
  const profileSamples=profileTargets(bsd,local);
  const profiles=await pool(profileSamples,async p=>({player:p,data:await request('players/'+p.bsdPlayerId+'/')}));
  const season=await fetchSeason({token,fetchImpl:async url=>{
    assert(String(url).startsWith(BASE));const data=await request(String(url).slice(BASE.length));
    return {ok:data!==null,status:data?200:503,text:async()=>JSON.stringify(data)};
  }});
  const fixtureIds=new Set(season.matches.flatMap(m=>[m.home.providerId,m.away.providerId]));
  const now=Date.now(),lineupCache=new Map();
  async function lineup(m){if(!lineupCache.has(m.id))lineupCache.set(m.id,(async()=>{const raw=await request('events/'+m.id+'/lineups/');return {raw,normalized:normalizeLineups(raw,m)};})());return lineupCache.get(m.id);}
  const xi=await pool(verified,async t=>{
    const has=m=>[m.home.providerId,m.away.providerId].includes(t.id);
    const prior=season.matches.filter(m=>has(m)&&m.status==='finished'&&Date.parse(m.kickoff)<now).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)).slice(0,2);
    const future=season.matches.filter(m=>has(m)&&m.status==='upcoming'&&Date.parse(m.kickoff)>now).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff)).slice(0,1);
    let confirmed=null,predicted=null;const checked=[];
    for(const m of prior){const l=await lineup(m),side=m.home.providerId===t.id?'home':'away';checked.push({id:m.id,status:l.normalized?.status||'missing'});
      if(l.normalized?.status==='confirmed'&&validXI(l.normalized[side])){confirmed={id:m.id,kickoff:m.kickoff,players:l.normalized[side].starters};break;}}
    for(const m of future){const l=await lineup(m),side=m.home.providerId===t.id?'home':'away';checked.push({id:m.id,status:l.normalized?.status||'missing'});
      if(l.normalized?.status==='predicted'&&validXI(l.normalized[side]))predicted={id:m.id,kickoff:m.kickoff};}
    const squadIds=new Set(bsd.filter(p=>p.bsdTeamId===t.id).map(p=>p.bsdPlayerId));
    return {...t,confirmed,predicted,checked,xiMissingFromSquad:confirmed?.players.filter(p=>!squadIds.has(p.id)).map(p=>p.id)||[]};
  });
  const confirmed=xi.filter(t=>t.confirmed).length,predicted=xi.filter(t=>t.predicted).length,neither=xi.filter(t=>!t.confirmed&&!t.predicted).length;
  const roles=teamData.flatMap(t=>t.ok?t.squad.players:[]),squadFields=new Set(roles.flatMap(Object.keys));
  const colors=teamData.map(t=>({team:t.name,old:t.known.color+' / '+t.known.color2,fields:colorFields(t.detail)}));
  const report=[];const section=(title,body)=>report.push('## '+title+'\n\n'+body+'\n');
  report.push('# BSD Catalogue Compatibility Audit — D1\n\nObserved: '+started+' (UTC). Read-only live BSD audit; no database calls or product changes.\n');
  section('1. Executive summary',`Live scoped team set: **${live.rows.length}**. Confirmed mappings: **${verified.length}/18**. Successful squad/detail pairs: **${teamData.filter(t=>t.ok).length}/18**. BSD unique players: **${comparison.unique.length}** (${bsd.length} squad rows). Legacy: **${local.players.length}**. High-confidence identity proposals: **${comparison.high.length} (${pct(comparison.high.length,local.players.length)})**; medium: **${comparison.medium.length} (${pct(comparison.medium.length,local.players.length)})**. This is compatibility evidence, not permission or implementation of migration.\n\nProvider IDs remain external mappings. Keep generic jersey rendering; no media downloaded.`);
  section('2. Actual BSD schemas observed','Galatasaray team detail (live; field names/types only):\n\n'+schemaTable(detail)+'\nGalatasaray squad (live):\n\n'+schemaTable(squad)+'\nAcross all successful squads, observed player fields: '+[...squadFields].sort().map(k=>'`'+k+'`').join(', ')+'.\n\n'+table(['Player detail sample','Broad position','Observed fields'],profiles.map(p=>[p.player.name,p.player.position,p.data?Object.keys(p.data).sort().join(', '):'request failed']))+'\nTeam detail union: '+[...new Set(teamData.flatMap(t=>Object.keys(t.detail||{})))].sort().join(', ')+'.\n\nTeam league/season association is established by the filtered team-set request and independently checked season fixtures, not invented per-detail fields.\n\nMedia field present: team '+(teamData.some(t=>mediaPresent(t.detail))?'yes':'no')+'; squad '+(teamData.some(t=>mediaPresent(t.squad))?'yes':'no')+'; sampled player details '+(profiles.some(t=>mediaPresent(t.data))?'yes':'no')+'. No media values/URLs retained in this report.');
  section('3. Süper Lig team coverage',`GET teams/?league_id=11&season_id=1539&limit=200&offset=0; count ${live.rows.length}. Same-scope season fixtures: ${season.matches.length}; unique fixture team IDs: ${fixtureIds.size}. Missing expected IDs: ${missing.join(', ')||'none'}. Unexpected IDs: ${unexpected.map(t=>t.id+' '+t.name).join(', ')||'none'}. Unresolved name conflicts: ${nameConflicts.map(t=>t.id+' '+t.name).join(', ')||'none'}.\n\n`+table(['Legacy team','legacyTeamId','BSD ID','Live BSD name','Short name','Fixture corroboration'],teamData.map(t=>[t.known.name,t.known.teamId,t.id,t.name,t.detail?.short_name??'missing',fixtureIds.has(t.id)?'yes':'NO']))+'\nName differences are shown explicitly. Exact normalized names or a reviewed ID-specific Turkish alias allowlist are accepted; ambiguous/unexpected teams are not silently merged.');
  section('4. Squad coverage',table(['Team','Legacy count','BSD rows','Detail/squad checked'],teamData.map(t=>[t.name,local.teams.find(l=>l.legacyTeamId===t.known.teamId)?.players.length??0,t.ok?t.squad.players.length:'unavailable',t.ok?'yes':'NO']))+`\nTotal BSD rows: ${bsd.length}; unique IDs: ${comparison.unique.length}; duplicate IDs across rows/squads: ${comparison.duplicates.length}.\n\n`+table(['Duplicate BSD ID','Memberships'],comparison.duplicates.map(([id,rows])=>[id,rows.map(p=>p.team).join(', ')])));
  section('5. Legacy vs BSD player matching','Normalizer: NFKD, case folding, Turkish dotted/dotless I folding, combining-mark removal, apostrophe unification/removal, hyphen-to-space and whitespace collapse. Display names unchanged. No fuzzy match is auto-mapped.\n\nPriority: unique same-team normalized name first, then same normalized name across all 18 squads. Ambiguous duplicate identities and many-legacy-to-one-BSD claims are rejected. HIGH requires same team + normalized name + equal known shirt number + equal known broad position. Other unique normalized-name candidates are MEDIUM, including cross-team transfer candidates.\n\n'+table(['Result','Count','% of legacy'],[['HIGH',comparison.high.length,pct(comparison.high.length,local.players.length)],['MEDIUM',comparison.medium.length,pct(comparison.medium.length,local.players.length)],['AMBIGUOUS',comparison.results.filter(r=>r.category==='AMBIGUOUS').length,pct(comparison.results.filter(r=>r.category==='AMBIGUOUS').length,local.players.length)],['NO_MATCH / legacy-only',comparison.results.filter(r=>r.category==='NO_MATCH').length,pct(comparison.results.filter(r=>r.category==='NO_MATCH').length,local.players.length)],['Any normalized-name candidate (includes ambiguity)',comparison.results.filter(r=>r.candidates.length).length,pct(comparison.results.filter(r=>r.candidates.length).length,local.players.length)]])+'\n'+table(['Evidence category (mutually exclusive)','Count'],['EXACT_NAME','NORMALIZED_NAME','NAME_AND_NUMBER','NAME_POSITION_NUMBER','AMBIGUOUS','NO_MATCH'].map(c=>[c,comparison.results.filter(r=>r.category===c).length]))+`\nBSD-only (no normalized-name candidate anywhere in legacy): ${comparison.bsdOnly.length}/${comparison.unique.length} = ${pct(comparison.bsdOnly.length,comparison.unique.length)}. This means name-unmatched, not proven newly signed players. Same-team unique candidates: ${matched.filter(r=>r.scope==='same_team').length}; cross-team candidates: ${transfers.length}. Full high-confidence mapping exists only in memory (${comparison.proposed.length} entries).`);
  const diffRows=items=>items.map(r=>[r.old.team,r.old.name,r.match.team,r.match.name,r.old.number??'missing',r.match.number??'missing',r.old.position,r.match.position??'missing',r.confidence]);
  section('6. Shirt-number comparison',`Denominator: ${matched.length} unique HIGH + MEDIUM candidate pairs (not ambiguous pairs). Missing buckets are exclusive; both-missing is separate.\n\n`+table(['Result','Count'],['equal','different','missing_legacy','missing_BSD','missing_both'].map(k=>[k,numberStats[k]||0]))+'\nDifferences (all):\n\n'+table(['Legacy team','Legacy name','BSD team','BSD name','Old #','BSD #','Old pos','BSD pos','Confidence'],diffRows(matched.filter(r=>r.old.number!=null&&r.match.number!=null&&r.old.number!==r.match.number)))+'\nA change can be a real update; it is not classified as provider error.');
  section('7. Position comparison',table(['Result','Count'],['same','different','missing'].map(k=>[k,positionStats[k]||0]))+'\nAll candidate position mismatches:\n\n'+table(['Legacy team','Legacy name','BSD team','BSD name','Old #','BSD #','Old pos','BSD pos','Confidence'],diffRows(matched.filter(r=>r.old.position&&r.match.position&&r.old.position!==r.match.position)))+'\nBSD squad observed position values: '+[...new Set(roles.map(p=>p.position))].sort().join(', ')+'. Missing/unknown positions across all BSD rows: '+bsd.filter(p=>!p.position).length+'.');
  section('8. Detailed role availability',roleSection(profiles));
  section('9. Team color availability',table(['Team','Current colors','Observed BSD color fields','Usable'],colors.map(c=>[c.team,c.old,c.fields.map(([k,v])=>k+'='+v).join('; ')||'none',c.fields.length?'requires field review':'no']))+'\nNo palette modified. No image/logo inspected or downloaded. Team short_name values longer than current 8-character schema limit: '+teamData.filter(t=>typeof t.detail?.short_name==='string'&&t.detail.short_name.length>8).map(t=>t.name).join(', ')+'.');
  section('10. Starting-XI feasibility',`Confirmed recent XI: **${confirmed}/18**; upcoming predicted XI: **${predicted}/18**; neither in bounded probe: **${neither}/18**.\n\nAt most two most-recent completed same-season matches before now per team, stopping at first valid confirmed XI; one nearest upcoming same-season fixture per team. Identical event requests share an in-memory promise cache. Uses existing normalizeLineups + validXI, including exact 11 unique starters and one goalkeeper. Does not fetch stats/incidents/media.\n\n`+table(['Team','Confirmed match/date','Predicted match/date','Probed event IDs/status','Confirmed XI IDs absent from current squad'],xi.map(t=>[t.name,t.confirmed?t.confirmed.id+' / '+t.confirmed.kickoff:'not found',t.predicted?t.predicted.id+' / '+t.predicted.kickoff:'not found',t.checked.map(c=>c.id+':'+c.status).join(', '),t.xiMissingFromSquad.join(', ')||'none']))+'\nAvailability is a point-in-time bounded observation, not proof that older fixtures have no lineup or future predictions will remain available. Replacement proposal: latest eligible confirmed XI, explicitly labelled recent-match basis; retain only current squad identities and deterministically fill gaps from BSD broad positions. Do not use legacy starts/value/photo truthiness. No Studio behavior changed.');
  section('11. Legacy → BSD mapping confidence',`HIGH proposals: ${comparison.proposed.length}; all legacy IDs and BSD targets unique. No IDs written to DB or made primary keys. HIGH is evidence-based candidate confidence, not externally certified identity.\n\n`+table(['legacyPlayerId','Legacy name','BSD player ID','BSD name','Confidence'],comparison.high.slice(0,15).map(r=>[r.old.legacyPlayerId,r.old.name,r.match.bsdPlayerId,r.match.name,'HIGH']))+'\nTeam proposals are the explicit legacyTeamId → BSD ID table in section 3. MEDIUM/cross-team and ambiguous cases require review; never apply solely by shirt number, surname or approximate name.');
  section('12. Unmatched / ambiguous cases','Cross-team same-normalized-name candidates (possible transfers; not verified transfer history):\n\n'+table(['Legacy team','Legacy name','BSD team','BSD name','Old #','BSD #','Old pos','BSD pos','Confidence'],diffRows(transfers))+'\nAmbiguous cases:\n\n'+table(['Legacy ID','Team','Name','BSD candidates'],comparison.results.filter(r=>r.category==='AMBIGUOUS').map(r=>[r.old.legacyPlayerId,r.old.team,r.old.name,r.candidates.map(p=>p.bsdPlayerId+' '+p.team+' '+p.name).join('; ')]))+'\nLegacy-only after searching all collected squads; not proof a player left the league (spelling aliases, incomplete provider coverage, or snapshot errors remain possible):\n\n'+table(['legacyPlayerId','Team','Name'],comparison.results.filter(r=>r.category==='NO_MATCH').map(r=>[r.old.legacyPlayerId,r.old.team,r.old.name]))+'\nBSD-only normalized names:\n\n'+table(['BSD player ID','Team','Name'],comparison.bsdOnly.map(p=>[p.bsdPlayerId,p.team,p.name])));
  section('13. Migration-sensitive code locations',table(['System','Source reference','Assumption / required future handling'],sourceRows())+'\nRecommended design: independent internal team/player identity with provider mappings (provider, external_id), plus legacy aliases. Changing numeric IDs to UUIDs is not a drop-in change: Free/Match lineup helpers currently validate numeric player IDs. Classic athleteId allows text but relies on catalogue equality. Catalogue team-name changes affect name-keyed lookup and Comparison selects. Preserve user-owned override/draft/project keys and historical readonly shares; no broad DB rewrite or policy change is proposed here.');
  section('14. API request count',`This audit invocation: **${requests.length} GET requests**. Failed HTTP/network/JSON requests: **${requests.filter(r=>r.status!==200||r.failure).length}**. Retries: **0**. Maximum concurrency: **4**. Hard ceiling: **90/run**. In-memory caching prevents duplicate paths within the run. These counts do not invent or include previous runs; any separate discovery calls must be logged separately. Public documentation reads are separate from authenticated data-API quota calls.\n\n`+table(['GET endpoint (relative to https://sports.bzzoiro.com/api/v2/)','HTTP status','Failure'],requests.map(r=>[r.path,r.status??'network failure',r.failure||'none'])));
  section('15. Risks / unknowns','- Current squad is current club membership, not a frozen 2026/27 roster; fixtures establish league-season participation separately.\n- Normalized-name matching is not an identity authority. Diacritic folding can collide; ambiguous and multiple-target claims remain unmerged.\n- Legacy snapshot dates to '+local.roster.asOf+'; absence or number/position change is not automatically BSD error.\n- Detailed roles and colors require independent/internal product decisions if unavailable; do not retain unproven legacy rank as a hidden fallback.\n- Sampled player-detail schema is not exhaustive across every player. Squad field coverage is exhaustive only for successfully fetched teams.\n- Future historical projects and overrides need identity compatibility, not a blind string rename.\n- This report does not establish legal/licensing or production release approval. No live Supabase endpoint was called.\n- No raw provider responses, images or credentials were saved. Report contains selected audit facts, comparisons and schema field names only.');
  const all=verified.length===18&&live.rows.length===18&&!missing.length&&!unexpected.length&&!nameConflicts.length&&teamData.every(t=>t.ok)&&fixtureIds.size===18&&verified.every(t=>fixtureIds.has(t.id)),allNamed=bsd.every(p=>p.name),allPos=bsd.every(p=>p.position),allNumbers=bsd.every(p=>p.number!=null&&p.number>=1&&p.number<=99);
  section('16. Final recommendation',table(['Question','Decision','Evidence'],[
    ['A — 18-team league list',all?'YES':'PARTIAL',`${verified.length}/18 verified; ${live.rows.length} scoped provider teams; ${fixtureIds.size} fixture team IDs`],
    ['B — Team names',all?'YES':'PARTIAL','Live detail/list names available; aliases/display-name migration and short-name bounds need handling'],
    ['C — Squad membership',all?'YES':'PARTIAL',`${teamData.filter(t=>t.ok).length}/18 current squads; ${comparison.unique.length} unique IDs; not historical season registration`],
    ['D — Player names',all&&allNamed?'YES':'PARTIAL',`${bsd.filter(p=>p.name).length}/${bsd.length} named squad rows`],
    ['E — Player IDs as provider mappings',all?'YES':'PARTIAL',`${comparison.unique.length} unique external IDs; only ${comparison.high.length}/${local.players.length} legacy identities HIGH; keep separate internal IDs`],
    ['F — Shirt numbers',all&&allNumbers?'YES':'PARTIAL',`${bsd.filter(p=>p.number!=null&&p.number>=1&&p.number<=99).length}/${bsd.length} current-schema-compatible numbers`],
    ['G — G/D/M/F positions',all&&allPos?'YES':'PARTIAL',`${bsd.filter(p=>p.position).length}/${bsd.length} normalized positions`],
    ['H — Detailed roles','PARTIAL',`${detailedRoles(profiles).filter(r=>r[1]!=='NOT_AVAILABLE').length}/10 role types have evidence in the bounded player-detail sample; no complete multi-role coverage`],
    ['I — Default-XI selection',confirmed===18?'YES':'PARTIAL',`${confirmed}/18 recent confirmed XI; ${predicted}/18 upcoming predicted XI; deterministic gap handling still needs implementation`],
    ['J — Team colors',colors.some(c=>c.fields.length)?'PARTIAL':'NO',`${colors.filter(c=>c.fields.length).length}/18 team details expose color fields`],
    ['K — Remove FotMob runtime/catalogue dependency','PARTIAL','Core catalogue can use BSD if coverage passes; identity transition, role/palette decisions and XI replacement remain. Not a drop-in migration.']
  ])+'\nProceed only to a separately approved design phase: independent IDs + provider/legacy aliases, fresh BSD catalogue ingestion, explicit internal tactical-role/palette choices and BSD-only XI selection. Do not apply this audit as a migration.\n\nReferences: [BSD teams/players endpoint documentation](https://sports.bzzoiro.com/docs/football/teams-players/), [BSD league/season documentation](https://sports.bzzoiro.com/docs/football/leagues/). Endpoint discovery used documentation; field and coverage claims above use actual authenticated GET responses.');
  const output=report.join('\n');assert(!output.includes(token));
  writeFileSync(resolve(ROOT,'BSD_CATALOGUE_COMPATIBILITY_AUDIT.md'),output.replaceAll(token,'[REDACTED]'),'utf8');
  console.log(JSON.stringify({teams:live.rows.length,verified:verified.length,bsdUnique:comparison.unique.length,high:comparison.high.length,medium:comparison.medium.length,ambiguous:comparison.results.filter(r=>r.category==='AMBIGUOUS').length,legacyOnly:comparison.results.filter(r=>r.category==='NO_MATCH').length,bsdOnly:comparison.bsdOnly.length,numberStats,positionStats,confirmedXI:confirmed,predictedXI:predicted,neither,requests:requests.length,failures:requests.filter(r=>r.status!==200||r.failure).length,retries:0}));
}
main().catch(()=>{console.error('BSD audit failed; no raw error or provider body logged.');console.log(JSON.stringify(requests));process.exitCode=1;});
