// D1.1: read-only BSD GET audit; writes only BSD_MIGRATION_BLOCKER_AUDIT.md.
// D1's report/script, catalogue, seed, database and product behavior are untouched.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchSeason} from '../supabase/functions/matches/provider.js';
import {normalizeLineups} from '../supabase/functions/matches/detail.js';
import {teamMapping} from '../supabase/functions/matches/teams.js';
import {validXI} from '../src/lib/studio-lineups.js';
import {parseFormation} from '../src/lib/match-layout.js';
import {legacyRosterText,LEGACY_ROSTER_PATH} from './catalogue/legacy-snapshot.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),BASE='https://sports.bzzoiro.com/api/v2/';
const token=process.env.BSD_API_TOKEN?.trim(),ledger=[],cache=new Map();
const read=path=>readFileSync(resolve(ROOT,path),'utf8');
// SEC1.1: the legacy snapshot is frozen evidence read from Git history, not a working-tree file.
const hash=path=>createHash('sha256').update(path===LEGACY_ROSTER_PATH?legacyRosterText():readFileSync(resolve(ROOT,path))).digest('hex');
const protectedFiles=['dist/rosters.js','supabase/seed.sql','BSD_CATALOGUE_COMPATIBILITY_AUDIT.md','scripts/audit-bsd-catalogue.mjs'];
const baselineHashes=Object.fromEntries(protectedFiles.map(p=>[p,hash(p)]));
const norm=v=>String(v??'').normalize('NFKD').replace(/[ıİ]/g,'i').toLowerCase().replace(/\p{M}/gu,'').replace(/[’‘`´ʼ']/g,'').replace(/[‐‑–—-]/g,' ').replace(/\s+/g,' ').trim();
const clean=v=>{const s=String(v??'');return (token?s.replaceAll(token,'[REDACTED]'):s).replace(/[\u0000-\u001f\u007f]/g,' ').replaceAll('|','\\|').replaceAll('<','&lt;').replaceAll('>','&gt;');};
const table=(headers,rows)=>'| '+headers.map(clean).join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+(rows.length?rows.map(row=>'| '+row.map(clean).join(' | ')+' |').join('\n'):'')+'\n';
const count=(rows,fn)=>rows.reduce((a,r)=>{const k=fn(r);a[k]=(a[k]||0)+1;return a;},{});
const number=v=>v===null?'NULL':v===undefined?'MISSING':typeof v==='string'?'string: '+v:String(v);
const validNumber=v=>Number.isInteger(v)&&v>=1&&v<=99;
let gate=Promise.resolve(),blockedUntil=0,halted=false,completed=0;
async function pace(){
  const ticket=gate.then(async()=>{await delay(Math.max(0,blockedUntil-Date.now()));await delay(180);});
  gate=ticket.catch(()=>{});await ticket;
}
async function get(path){
  if(cache.has(path))return cache.get(path);
  assert(/^(teams\/|players\/|events\/)/.test(path)&&!path.includes('://')&&!path.includes('..'));
  const promise=(async()=>{
    for(let attempt=0;attempt<2;attempt++){
      await pace();if(halted||ledger.length>=650)return null;
      const row={path,attempt:attempt+1,status:null};ledger.push(row);
      try{
        const response=await fetch(BASE+path,{method:'GET',headers:{Authorization:'Token '+token},redirect:'error',signal:AbortSignal.timeout(25000)});
        row.status=response.status;
        if([401,403].includes(response.status))halted=true;
        if(!response.ok){
          await response.body?.cancel();
          if(response.status===429){const seconds=Number(response.headers.get('retry-after')||'5');if(Number.isFinite(seconds)&&seconds>=0&&seconds<=30)blockedUntil=Date.now()+Math.max(1000,seconds*1000);else halted=true;}
          if(!halted&&attempt===0&&[429,500,502,503,504].includes(response.status)){if(response.status!==429)await delay(1500);continue;}
          return null;
        }
        const body=await response.text();if(body.length>4_000_000)throw Error('oversize');return JSON.parse(body);
      }catch{row.failure='network_or_json_failed';return null;}
    }
    return null;
  })();cache.set(path,promise);return promise;
}
async function pool(rows,fn){let next=0;const out=new Array(rows.length);await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{for(;;){const i=next++;if(i>=rows.length)return;out[i]=await fn(rows[i],i);}}));return out;}
function localData(){
  const roster=JSON.parse(legacyRosterText().replace(/^\s*window\.TAKTIK_ROSTERS\s*=\s*/,'').replace(/;\s*$/,''));
  const teams=Object.entries(roster.teams).map(([name,t])=>({name,legacyTeamId:'fotmob-'+t.source.match(/\/teams\/(\d+)\//)[1],players:t.players}));
  return {teams,players:teams.flatMap(t=>t.players.map(p=>({...p,legacyPlayerId:p.id,team:t.name,legacyTeamId:t.legacyTeamId})))};
}
// Reproduce D1's frozen cohort rules; importing D1 would execute its crawl and
// overwrite its report, so this small comparator is deliberately self-contained.
function d1Match(legacy,bsd){
  const results=legacy.map(old=>{
    const global=bsd.filter(b=>norm(b.name)===norm(old.name)),same=global.filter(b=>b.legacyTeamId===old.legacyTeamId),candidates=same.length?same:global;
    const r={old,candidates,match:null,confidence:null,kind:'NO_MATCH'};
    if(candidates.length!==1){if(candidates.length)r.kind='AMBIGUOUS';return r;}
    r.match=candidates[0];r.kind='MATCH';
    r.confidence=same.length&&old.number!=null&&r.match.number!=null&&old.number===r.match.number&&old.position===r.match.position?'HIGH':'MEDIUM';return r;
  });
  const claims=new Map();for(const r of results)if(r.match){const id=r.match.id;if(!claims.has(id))claims.set(id,[]);claims.get(id).push(r);}
  for(const rows of claims.values())if(rows.length>1)for(const r of rows){r.kind='AMBIGUOUS';r.match=null;r.confidence=null;}
  return results;
}
const roles={GK:{role:'KL',kind:'DIRECT',broad:['G']},CB:{role:'STP',kind:'DIRECT',broad:['D']},LB:{role:'SLB',kind:'DIRECT',broad:['D']},RB:{role:'SĞB',kind:'DIRECT',broad:['D']},LWB:{role:'SLB',kind:'LOSSY',broad:['D','M']},RWB:{role:'SĞB',kind:'LOSSY',broad:['D','M']},DM:{role:'ÖL',kind:'DIRECT',broad:['M']},CDM:{role:'ÖL',kind:'DIRECT',broad:['M']},CM:{role:'MO',kind:'DIRECT',broad:['M']},AM:{role:'OO',kind:'DIRECT',broad:['M']},CAM:{role:'OO',kind:'DIRECT',broad:['M']},LM:{role:'SLK',kind:'LOSSY',broad:['M']},RM:{role:'SĞK',kind:'LOSSY',broad:['M']},LW:{role:'SLK',kind:'DIRECT',broad:['M','F']},RW:{role:'SĞK',kind:'DIRECT',broad:['M','F']},ST:{role:'SF',kind:'DIRECT',broad:['F']},CF:{role:'SF',kind:'DIRECT',broad:['F']},FWD:{role:'SF (only an explicit product default)',kind:'LOSSY',broad:['F']}};
function roleOf(value){return typeof value==='string'?roles[value.trim().toUpperCase()]||{role:'none',kind:'UNMAPPABLE',broad:[]}:{role:'none',kind:'UNMAPPABLE',broad:[]};}
// Exhaustive response also contains generic DEF/MID. These are known broad
// labels, not unknown codes. Any specific-role default is explicitly LOSSY.
Object.assign(roles,{DEF:{role:'STP (only an explicit product default)',kind:'LOSSY',broad:['D']},MID:{role:'MO (only an explicit product default)',kind:'LOSSY',broad:['M']}});
function positionAssessment(oldBroad,newBroad,specific){
  if(['DEF','MID','FWD'].includes(specific))return 'UNCERTAIN_GENERIC_POSITION: detailed value is still broad; taxonomy versus staleness not distinguishable';
  if(!roleOf(specific).broad.includes(newBroad))return 'UNCERTAIN_CONFLICTING_BSD_FIELDS: specific and broad labels disagree';
  if(['LW','RW','LM','RM','AM'].includes(specific)&&['F','M'].includes(oldBroad)&&['F','M'].includes(newBroad))return 'LIKELY_POSITION_NORMALIZATION: explicit wing/attacking-midfield classification; not proven chronology';
  return 'PROVIDER_DISAGREEMENT: observed classification differs; stale legacy vs current change not distinguishable';
}
function mappingNote(code){
  const role=roleOf(code);
  if(role.kind==='DIRECT')return 'High semantic confidence; one primary role only. Broad/specific conflicts still require review.';
  if(code==='DEF')return 'Low as a specific-role assignment: generic defender cannot distinguish center-back/full-back. Default requires product approval.';
  if(code==='MID')return 'Low as a specific-role assignment: generic midfielder cannot distinguish central/defensive/attacking/wide. Default requires product approval.';
  if(code==='LM'||code==='RM')return 'Medium semantic approximation: wide midfielder and winger are different labels.';
  if(role.kind==='LOSSY')return 'Default requires product approval, not equivalent detail; generic forward does not prove central striker versus winger.';
  return 'No safe inference; keep unknown, do not copy legacy roles.';
}
function editDistance(a,b){const d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const save=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=save;}}return d[b.length];}
function nameEvidence(old,b){
  const a=norm(old.name),full=norm(b.name),detail=norm(b.detail?.name),short=norm(b.detail?.short_name);
  if(a===full||detail&&a===detail||short&&a===short)return {rank:4,reason:'EXACT_PROVIDER_NAME_OR_PUBLISHED_SHORT_NAME'};
  const x=a.split(' '),y=full.split(' '),sx=[...x].sort(),sy=[...y].sort();
  if(x.length>=2&&sx.join(' ')===sy.join(' '))return {rank:3,reason:'EXACT_FULL_TOKEN_REORDER'};
  const smaller=x.length<=y.length?x:y,larger=x.length<=y.length?y:x;
  if(smaller.length>=2&&x[0]===y[0]&&x.at(-1)===y.at(-1)&&smaller.every(t=>larger.includes(t)))return {rank:3,reason:'EXACT_FIRST_LAST_WITH_MIDDLE_NAME_EXPANSION'};
  const last=x.at(-1),other=y.at(-1),lastNear=last.length>=4&&other.length>=4&&editDistance(last,other)<=Math.max(1,Math.floor(Math.max(last.length,other.length)*0.2));
  if(x.length>=2&&y.length>=2&&lastNear&&(x[0]===y[0]||editDistance(x[0],y[0])<=2))return {rank:2,reason:'SIMILAR_FIRST_AND_SURNAME_REVIEW_ONLY'};
  if(smaller.length>=2&&smaller.every(t=>larger.includes(t)))return {rank:2,reason:'SHARED_NAME_TOKENS_REVIEW_ONLY'};
  if(x.length===1&&y.includes(x[0])||y.length===1&&x.includes(y[0]))return {rank:1,reason:'SINGLE_NAME_COMPONENT_REVIEW_ONLY'};
  return null;
}
function profileConsistent(b){return b.detail&&String(b.detail.id)===b.id&&String(b.detail.current_team_id)===b.teamId&&norm(b.detail.name)===norm(b.name)&&b.detail.position===b.position&&b.detail.jersey_number===b.number;}
function investigate(old,bsd,reserved){
  const evidence=bsd.flatMap(b=>{const e=nameEvidence(old,b);return e?[{b,...e,sameTeam:b.legacyTeamId===old.legacyTeamId}]:[];}).sort((a,b)=>b.rank-a.rank||Number(b.sameTeam)-Number(a.sameTeam)||Number(a.b.id)-Number(b.b.id));
  const deterministic=evidence.filter(e=>e.rank>=3),safe=deterministic.filter(e=>e.sameTeam&&validNumber(old.number)&&old.number===e.b.number&&old.position===e.b.position&&profileConsistent(e.b)&&!reserved.has(e.b.id));
  const max=evidence[0]?.rank||0,top=evidence.filter(e=>e.rank===max),preferred=top.some(e=>e.sameTeam)?top.filter(e=>e.sameTeam):top;
  let candidate=safe.length===1&&deterministic.length===1?safe[0]:null;
  let category=candidate?'LIKELY_NAME_VARIANT':preferred.length>1?'AMBIGUOUS':preferred.length&&preferred[0].rank>=2?(preferred[0].sameTeam?'LIKELY_NAME_VARIANT':'LIKELY_TRANSFER_WITHIN_LEAGUE'):'NO_SAFE_MATCH';
  const last=norm(old.name).split(' ').at(-1);
  const surnames=bsd.filter(b=>{const s=norm(b.name).split(' ').at(-1);return s===last||last.length>=4&&s.length>=4&&editDistance(last,s)<=1;});
  return {old,evidence,preferred,candidate,category,surnames,safe:!!candidate};
}
function selfTest(){
  assert.equal(norm('İRFAN  EĞRİBAYAT'),norm('Irfan Egribayat'));
  assert.equal(nameEvidence({name:'Hwang Ui Jo'},{name:'Ui Jo Hwang'}).rank,3);
  assert.equal(nameEvidence({name:'Kartal Yılmaz'},{name:'Kartal Kayra Yılmaz'}).rank,3);
  assert.equal(nameEvidence({name:'Juan'},{name:'Juan Santos da Silva'}).rank,1);
  assert.equal(roleOf('FWD').kind,'LOSSY');assert.equal(roleOf('surprise').kind,'UNMAPPABLE');
  const old={name:'Test Person',legacyPlayerId:'1',legacyTeamId:'a',number:7,position:'M'},b={id:'11',teamId:'1',legacyTeamId:'a',name:'Test Person',number:7,position:'M'};
  assert.equal(d1Match([old],[b])[0].confidence,'HIGH');
  assert(d1Match([old,{...old,legacyPlayerId:'2'}],[b]).every(r=>r.kind==='AMBIGUOUS'));
  assert(!investigate({...old,name:'Test' },[b],new Set()).safe);
  console.log('D1.1 offline evidence/normalization/ambiguity/role checks passed; zero HTTP requests.');
}
async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  if(!token){console.error('BSD_API_TOKEN is not available.');process.exitCode=1;return;}
  const started=new Date().toISOString(),local=localData();
  const set=await get('teams/?league_id=11&season_id=1539&limit=200&offset=0');
  assert(set?.count===18&&set.next===null&&set.results?.length===18,'Team scope changed');
  assert.equal(new Set(set.results.map(t=>String(t.id))).size,18);
  const teams=await pool(set.results,async t=>{
    const id=String(t.id),known=teamMapping.get(id);assert(known,'Unexpected live team');
    const detail=await get('teams/'+id+'/'),squad=await get('teams/'+id+'/squad/');
    assert(detail?.id===t.id&&detail.name===t.name&&squad?.team_id===t.id&&squad.count===squad.players?.length,'Invalid team/squad');
    return {id,name:t.name,known,detail,squad};
  });
  const bsd=teams.flatMap(t=>t.squad.players.map(p=>({id:String(p.id),teamId:t.id,team:t.name,legacyTeamId:t.known.teamId,name:p.name,position:p.position,number:p.jersey_number})));
  assert.equal(new Set(bsd.map(p=>p.id)).size,bsd.length,'Duplicate squad identities');
  console.log('Live teams: '+teams.length+'; unique players: '+bsd.length+'. Fetching all player details with four workers and globally paced starts.');
  await pool(bsd,async b=>{
    const raw=await get('players/'+b.id+'/');
    b.detail=raw&&String(raw.id)===b.id?{id:raw.id,name:raw.name,short_name:raw.short_name,current_team_id:raw.current_team_id,current_team:raw.current_team,position:raw.position,specific_position:raw.specific_position,jersey_number:raw.jersey_number}:null;
    // Replace cache entry with whitelisted audit fields; raw detail bodies are never persisted.
    cache.set('players/'+b.id+'/',Promise.resolve(b.detail));
    completed++;if(completed%75===0||completed===bsd.length)console.log('Player details checked: '+completed+'/'+bsd.length+'; requests: '+ledger.length);
  });
  const matches=d1Match(local.players,bsd),high=matches.filter(r=>r.confidence==='HIGH'),medium=matches.filter(r=>r.confidence==='MEDIUM'),ambiguous=matches.filter(r=>r.kind==='AMBIGUOUS'),unmatched=matches.filter(r=>r.kind==='NO_MATCH');
  const oldNames=new Set(local.players.map(p=>norm(p.name))),bsdOnly=bsd.filter(b=>!oldNames.has(norm(b.name)));
  const d1Expected=[359,88,2,90,95],observed=[high.length,medium.length,ambiguous.length,unmatched.length,bsdOnly.length];
  const d1CohortsStable=observed.every((n,i)=>n===d1Expected[i])&&bsd.length===543;
  const reserved=new Set(matches.flatMap(r=>r.candidates.map(b=>b.id)));
  const investigations=unmatched.map(r=>investigate(r.old,bsd,reserved));
  const newClaims=new Map();for(const r of investigations)if(r.candidate){const id=r.candidate.b.id;if(!newClaims.has(id))newClaims.set(id,[]);newClaims.get(id).push(r);}
  for(const rows of newClaims.values())if(rows.length>1)for(const r of rows){r.safe=false;r.category='AMBIGUOUS';r.candidate=null;}
  const safe=investigations.filter(r=>r.safe);
  // MEDIUM is not silently promoted merely because a provider repeats its own
  // current fields. Missing legacy number / real field disagreement still stands.
  const promotions=[];
  const profileRows=bsd.filter(b=>b.detail),positionCounts=count(profileRows,b=>b.detail.specific_position==null?'NULL/MISSING':b.detail.specific_position);
  const conflicts=profileRows.filter(b=>{const role=roleOf(b.detail.specific_position);return role.broad.length&&!role.broad.includes(b.detail.position);});
  const detailDifferences=profileRows.filter(b=>b.detail.position!==b.position||b.detail.jersey_number!==b.number||String(b.detail.current_team_id)!==b.teamId||norm(b.detail.name)!==norm(b.name));
  const positionDiff=matches.filter(r=>r.match&&r.old.position!==r.match.position),numberDiff=matches.filter(r=>r.match&&r.old.number!=null&&r.match.number!=null&&r.old.number!==r.match.number);
  const invalid=bsd.filter(b=>!validNumber(b.number));
  const invalidKind=b=>b.number==null?'NULL':b.number===0?'0':typeof b.number!=='number'?'non-numeric':b.number>99?'>99':'other';
  const seed=read('supabase/seed.sql');
  const shortRows=teams.filter(t=>[...t.detail.short_name].length>8).map(t=>{const line=seed.split('\n').find(l=>l.startsWith('insert into public.teams')&&l.includes("'"+t.known.teamId+"'"));const short=line.match(/values \('[^']*','(?:[^']|'')*','((?:[^']|'')*)'/)?.[1];return [t.name,t.detail.short_name,[...t.detail.short_name].length,short||'not found'];});
  const season=await fetchSeason({token,fetchImpl:async url=>{assert(String(url).startsWith(BASE));const data=await get(String(url).slice(BASE.length));return {ok:!!data,status:data?200:503,text:async()=>JSON.stringify(data)};}});
  const now=Date.now();
  const xi=await pool(teams,async t=>{
    const latest=season.matches.filter(m=>m.status==='finished'&&Date.parse(m.kickoff)<now&&[m.home.providerId,m.away.providerId].includes(t.id)).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff))[0];
    if(!latest)return {t,latest:null};
    const raw=await get('events/'+latest.id+'/lineups/'),all=normalizeLineups(raw,latest),side=latest.home.providerId===t.id?'home':'away',row=all?.[side];
    return {t,latest,status:all?.status,row,valid:all?.status==='confirmed'&&validXI(row),formation:row?.formation&&!!parseFormation(row.formation),bench:!!row?.substitutes.length};
  });
  console.log('Provider crawl complete. Producing comparison tables and source inventory.');
  buildReport({started,local,teams,bsd,profileRows,positionCounts,conflicts,detailDifferences,high,medium,ambiguous,unmatched,bsdOnly,d1CohortsStable,observed,investigations,safe,promotions,positionDiff,numberDiff,invalid,invalidKind,shortRows,xi});
}
function buildReport(a){
  const {started,local,teams,bsd,profileRows,positionCounts,conflicts,detailDifferences,high,medium,ambiguous,unmatched,bsdOnly,d1CohortsStable,observed,investigations,safe,promotions,positionDiff,numberDiff,invalid,invalidKind,shortRows,xi}=a;
  const parts=['# BSD Migration Blocker Audit — D1.1\n\nObserved '+started+' UTC; Europe/Istanbul local audit date 25 September 2026. Read-only; D1 report preserved. No web search.\n'];
  const section=(name,body)=>parts.push('## '+name+'\n\n'+body+'\n');
  const present=profileRows.filter(b=>typeof b.detail.specific_position==='string'&&b.detail.specific_position.trim()).length;
  const unknown=profileRows.filter(b=>roleOf(b.detail.specific_position).kind==='UNMAPPABLE');
  const confirmed=xi.filter(r=>r.valid).length,formations=xi.filter(r=>r.valid&&r.formation).length,benches=xi.filter(r=>r.valid&&r.bench).length;
  section('1. Executive summary',`Scope: ${teams.length} teams, ${bsd.length} unique BSD squad players, ${profileRows.length} successfully validated detail identities. specific_position populated: **${present}/${bsd.length}**. D1 cohorts reproduced: **${d1CohortsStable?'YES':'NO — provider drift; interpret current cohorts separately'}** (HIGH/MEDIUM/ambiguous/legacy-only/BSD-only = ${observed.join('/')}).\n\nNew safe migration candidates among the ${unmatched.length} unmatched: **${safe.length}**; unresolved under the stated safety threshold: **${unmatched.length-safe.length}**. MEDIUM promoted: **${promotions.length}**. Confirmed current-season latest XI: **${confirmed}/18**. These are reviewable identity proposals, not production mappings or writes.`);
  section('2. Exhaustive specific_position results',table(['Exact returned value','Count','Proposed product role','Mapping class'],Object.entries(positionCounts).sort(([a],[b])=>a.localeCompare(b)).map(([v,n])=>[v,n,roleOf(v).role,roleOf(v).kind]))+`\nNull/missing specific_position: ${profileRows.filter(b=>b.detail.specific_position==null).length}; empty string: ${profileRows.filter(b=>b.detail.specific_position==='').length}; failed/mismatched-ID details: ${bsd.length-profileRows.length}. Unknown/unexpected values: ${[...new Set(unknown.map(b=>String(b.detail.specific_position)))].join(', ')||'none'}.\n\nSpecific/broad conflicts use an explicit semantic table (GK→G, CB/LB/RB→D, CM/AM/DM→M, FWD/ST/CF→F; wingbacks and wingers allow documented broad ambiguity rather than guessing).\n\n`+table(['BSD ID','Team','Player','Squad broad','Detail broad','specific_position'],conflicts.map(b=>[b.id,b.team,b.name,b.position,b.detail.position,b.detail.specific_position]))+'\nSquad/detail identity-field disagreements:\n\n'+table(['BSD ID','Player','Squad team','Detail team ID','Squad/detail number','Squad/detail broad'],detailDifferences.map(b=>[b.id,b.name,b.team,b.detail.current_team_id,number(b.number)+' / '+number(b.detail.jersey_number),b.position+' / '+b.detail.position])));
  const observedCodes=Object.keys(positionCounts),directRoles=new Set(observedCodes.filter(c=>roleOf(c).kind==='DIRECT').map(c=>roleOf(c).role));
  section('3. Role mapping feasibility','DIRECT = explicit semantic role code, with label translation only. LOSSY = product can choose a deterministic default but loses football detail or invents specificity. UNMAPPABLE = missing/unrecognized, must remain unknown. This is a proposal, not implemented mapping.\n\n'+table(['BSD value','Product role proposal','Class','Confidence / notes'],observedCodes.sort().map(c=>{const r=roleOf(c);return [c,r.role,r.kind,mappingNote(c)];}))+'\n'+table(['Current role','Exact BSD evidence observed'],['KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF'].map(r=>[r,directRoles.has(r)?'DIRECT code observed':'No DIRECT code observed; do not claim full replacement']))+'\nAll values may fit a reduced product policy only if LOSSY defaults/unknowns are accepted. The existing multi-role arrays cannot be reconstructed from a single primary specific_position. Do not preserve FotMob roles as hidden fill data.');
  parts.push('Role-code distribution: '+JSON.stringify(count(profileRows,b=>roleOf(b.detail.specific_position).kind))+'; explicit role types observed: '+directRoles.size+'/10. Counts describe codes, not a waiver of conflicting broad/specific fields.\n');
  const candidateText=e=>e.b.id+' '+e.b.team+' / '+e.b.name+' ['+e.reason+'; #'+number(e.b.number)+'; '+e.b.position+']';
  section('4. All legacy-only investigations','Safe candidate rule: unique provider-published full/short name, exact complete token reorder, or exact first+last tokens with middle-name expansion; same team; equal known 1–99 number; equal broad position; consistent BSD detail team/name/number/position; no existing D1 target claim and no competing new claim. Single-name matches, edit distance, surname similarity and cross-team hypotheses are never safe by themselves. Exact surname groups are disclosed even when they are not plausible identities.\n\nNo player is labelled LIKELY_LEFT_LEAGUE merely because absent. No external transfer lookup was made; no actual departure/transfer is asserted.\n\n'+table(['Classification','Count'],['LIKELY_LEFT_LEAGUE','LIKELY_NAME_VARIANT','LIKELY_TRANSFER_WITHIN_LEAGUE','AMBIGUOUS','NO_SAFE_MATCH'].map(k=>[k,investigations.filter(r=>r.category===k).length]))+'\n'+table(['Legacy ID','Legacy team/name','No./broad','Full normalized name anywhere','Same/near surname candidates','Best identity candidates / evidence','Classification','Safe candidate'],investigations.map(r=>[r.old.legacyPlayerId,r.old.team+' / '+r.old.name,number(r.old.number)+' / '+r.old.position,bsd.some(b=>norm(b.name)===norm(r.old.name))?'yes':'no',r.surnames.map(b=>b.id+' '+b.name+' ('+b.team+')').join('; ')||'none',r.preferred.map(candidateText).join('; ')||'none',r.category,r.safe?'YES → '+r.candidate.b.id:'NO'])));
  section('5. All BSD-only investigations',table(['BSD ID','Team/name','Number','Broad','specific_position','Legacy normalized-name match','Candidate classification','Possible legacy variants'],bsdOnly.map(b=>{
    const exact=local.players.filter(p=>norm(p.name)===norm(b.name)),variants=local.players.flatMap(p=>{const e=nameEvidence(p,b);return e?[{p,...e}]:[];}).sort((a,b)=>b.rank-a.rank);
    const best=variants.filter(e=>e.rank===(variants[0]?.rank||0));
    return [b.id,b.team+' / '+b.name,number(b.number),b.position,b.detail?.specific_position??'unavailable',exact.length?'yes':'no',best.length>1?'ambiguous legacy candidate':best.length?'possible legacy name variant':'no legacy normalized-name match',best.map(e=>e.p.legacyPlayerId+' '+e.p.team+' / '+e.p.name+' ['+e.reason+']').join('; ')||'none'];
  }))+'\nBSD-only means the D1 full-normalized-name algorithm found no match, not proven new signing. Safe pairs from section 4 resolve identities; other possible variants remain proposals.');
  const mediumReason=r=>[r.old.number==null?'legacy number missing':null,r.match.number==null?'BSD squad number missing':null,r.old.number!=null&&r.match.number!=null&&r.old.number!==r.match.number?'number changed':null,r.old.position!==r.match.position?'broad position differs':null,r.old.legacyTeamId!==r.match.legacyTeamId?'different team':null].filter(Boolean).join('; ');
  section('6. All MEDIUM mappings',table(['Legacy ID/player','Legacy team','BSD ID/player','BSD team','Legacy #','BSD #','Legacy broad','BSD broad','Detail specific','Reason MEDIUM'],medium.map(r=>[r.old.legacyPlayerId+' '+r.old.name,r.old.team,r.match.id+' '+r.match.name,r.match.team,number(r.old.number),number(r.match.number),r.old.position,r.match.position,r.match.detail?.specific_position??'unavailable',mediumReason(r)]))+`\nPromotions: ${promotions.length}. BSD detail repeats current provider facts; it does not supply the missing legacy number or an independent common DOB/identity key. A compatible tactical position alone does not prove the cross-provider mapping. We therefore do not silently relax D1 HIGH criteria to make the count larger.`);
  section('7. Ambiguous mappings',table(['Legacy ID','Team/name','Legacy # / broad / roles','All BSD candidates','Why unresolved'],ambiguous.map(r=>[r.old.legacyPlayerId,r.old.team+' / '+r.old.name,number(r.old.number)+' / '+r.old.position+' / '+r.old.roles.join(','),r.candidates.map(b=>b.id+' '+b.name+' ('+b.team+'), #'+number(b.number)+', '+b.position+', '+(b.detail?.specific_position??'unknown')).join('; '),'Two or more legacy claims point to the same BSD identity. Name equality cannot determine duplicate legacy records versus distinct people. No automatic merge.'])));
  const cause=r=>positionAssessment(r.old.position,r.match.position,r.match.detail?.specific_position);
  section('8. Broad-position differences',table(['Direction','Count'],Object.entries(count(positionDiff,r=>r.old.position+' → '+r.match.position)))+'\n'+table(['Cause assessment','Count'],Object.entries(count(positionDiff,cause)))+'\n'+table(['Legacy ID/player','BSD ID','Legacy → BSD broad','BSD specific','Assessment'],positionDiff.map(r=>[r.old.legacyPlayerId+' '+r.old.name,r.match.id,r.old.position+' → '+r.match.position,r.match.detail?.specific_position??'unavailable',cause(r)]))+'\nThese are diagnostic hypotheses, not evidence of a positional change over time. No historical BSD snapshot was fetched. FotMob is not treated as authoritative; legacy staleness is possible but cannot be separated from different classification policy.');
  section('9. Shirt-number blockers',table(['Exact-value class','Count'],['NULL','0','>99','non-numeric','other'].map(k=>[k,invalid.filter(b=>invalidKind(b)===k).length]))+'\n'+table(['BSD ID','Team/player','Squad exact value','Detail exact value','Class'],invalid.map(b=>[b.id,b.team+' / '+b.name,number(b.number),b.detail?number(b.detail.jersey_number):'detail unavailable',invalidKind(b)]))+'\nRecommendation: retain nullable shirt_number with 1–99 for known numbers if the observed blockers are all NULL. Existing schema already permits NULL; missing numbers alone require no range expansion. If non-NULL blockers exist, quarantine them for an explicit product rule rather than silently coercing them.\n\nSeparate matched-player number differences:\n\n'+table(['Legacy player/team','BSD ID/player/team','Legacy #','BSD #'],numberDiff.map(r=>[r.old.name+' / '+r.old.team,r.match.id+' '+r.match.name+' / '+r.match.team,number(r.old.number),number(r.match.number)])));
  section('10. Team short names',table(['Team','BSD short_name','Unicode length','Current product short label'],shortRows)+'\nRecommendation: preserve product-owned UI abbreviations (GS, FB, BJK, TS, etc.) independently of provider short_name. Do not copy long provider labels into the <=8-character UI field; optional provider metadata can retain them later. No schema expansion is needed to display the current badges.');
  section('11. Team colors as product UI metadata','The palette may remain independent product UI metadata. This is an architectural ownership decision, not a claim that the hex codes were originally invented internally or sourced from any particular website. Their external provenance remains unknown. All 18 live detail responses were read; no color field was exposed.\n\n'+table(['Location','Use'],[
    ['dist/app.js:21,27,117,154,201,234,301','Generic jersey SVG, fixed palette, team badges, per-board CSS variables, drag previews and user custom-team colors'],
    ['dist/comparison.js:24; dist/styles.css','Each board owns its palette; CSS consumes --team/--team2 and --c/--c2'],
    ['src/lib/catalogue.js:2,12; supabase/schema/football.sql:18','DB color_primary/color_secondary → model color/color2; required hex validation'],
    ['scripts/prepare-seed.mjs:13; supabase/seed.sql','Original palette copying into catalogue seed; no regeneration'],
    ['supabase/functions/matches/teams.js:3,23','Current provider-team map supplies product colors; separate this metadata from external-ID mapping in future'],
    ['src/lib/match-layout.js:43,68; src/lib/match-board.js:45; src/lib/studio-team-picker.js:18','Free/Match model carries palette into jerseys and team choices'],
    ['src/lib/matches-ui.js:41; src/lib/match-detail-ui.js:17; dist/matches.css; dist/match-detail.css','Match markers and scoreboard club-primary/secondary styling'],
    ['src/lib/studio-project-snapshot.js:27,39; src/lib/validation.js:12; src/lib/drafts.js; supabase/schema/football.sql:48','Project/draft/share snapshots retain their own colors; preserve historical/user choices'],
    ['tests/backend.test.mjs; tests/player-jersey.test.mjs; tests/matches-provider.test.mjs','Palette, contrast and mapping regressions; test data, not new provenance']
  ]));
  section('12. Latest completed confirmed XI',table(['Team','Latest same-season completed event','Kickoff UTC','Status','Starters','Formation','Valid formation','Bench count'],xi.map(r=>[r.t.name,r.latest?.id??'none',r.latest?.kickoff??'none',r.status??'unavailable',r.row?.starters.length??0,r.row?.formation??'missing',r.formation?'yes':'no',r.row?.substitutes.length??0]))+`\n11 valid confirmed starters: **${confirmed}/18**. Valid formation: **${formations}/18**. Nonempty bench: **${benches}/18**. Only the latest completed same-season event per team was checked, not an older success substituted for the latest. Shared event requests are cached.\n\nProposed chain: (1) latest completed confirmed XI; (2) deterministic current-squad fallback. Filter transferred/unavailable identities according to explicit product policy, preserve exactly one goalkeeper, fill gaps with broad-role buckets and a stable internal-ID tie-break. Treat historical XI as a starting template, not a prediction. Do not depend on predicted XI, legacy starts/value, or photo presence. No selection_rank implementation changed.`);
  section('13. Identity design inventory',table(['System/location','Classification','Exact dependency'],[
    ['scripts/prepare-seed.mjs:12','DERIVED_REFERENCE','fotmob- + number extracted from source URL'],
    ['dist/rosters.js:1; supabase/seed.sql','HARD_REFERENCE','539 legacy numeric player IDs and 18 FotMob team references in fixed data'],
    ['src/lib/catalogue.js:27,31','HARD_REFERENCE','FotMob fallback attribution; generic text ID validation and required position/number/roles contract'],
    ['dist/app.js:72,76,84,88,98','HARD_REFERENCE','athleteId === catalogue id drives replacement, bench exclusion and overrides; team-name keyed roster lookup'],
    ['dist/comparison.js:24,28','HARD_REFERENCE','Shared classic board identity; team selects store display name'],
    ['src/lib/match-layout.js:28,39,67','DERIVED_REFERENCE','URL-derived FotMob team IDs; numeric local-player gate; composite player key embeds side/team/player'],
    ['src/lib/studio-lineups.js:5; src/lib/match-id.js:1','HARD_REFERENCE','BSD and local lineup player IDs validated as numeric text; UUID player IDs are not a drop-in replacement'],
    ['src/lib/player-overrides.js:3,8; supabase/migrations/20260924094207_player_overrides.sql:5','SERIALIZED_REFERENCE','local:<legacy-id> and bsd:<external-id> namespaces are stored per owner; semantic namespace switch required'],
    ['src/lib/studio-project-snapshot.js:27,31,46; src/lib/match-board.js','SERIALIZED_REFERENCE','teamId/playerId and composite key/slotKey/personKey across source XI, bench and working state'],
    ['src/lib/drafts.js; src/lib/draft-scope.js; src/lib/validation.js:18','SERIALIZED_REFERENCE','Per-user draft payload athleteId/team and public shared draft compatibility; storage scope keys are provider-independent'],
    ['src/lib/sharing-ui.js; src/lib/validation.js:39; supabase/schema/football.sql:55','SERIALIZED_REFERENCE','Readonly shared snapshots preserve athleteId and palette; no live catalogue rewrite required for display'],
    ['supabase/functions/matches/teams.js:4','HARD_REFERENCE','18 BSD IDs explicitly map to fotmob-* identities; provider event IDs are a separate domain'],
    ['tests/backend.test.mjs; tests/board-regression.cjs; tests/matches-provider.test.mjs; tests/studio-project-snapshot.test.mjs; tests/player-overrides.test.mjs','TEST_ONLY','Numeric fixtures, old namespaces, seed map equality and restore regressions']
  ]));
  section('14. Future internal identity model — conceptual only',table(['Concept','Proposed invariant'],[
    ['teams','Provider-independent internal primary ID; product short label and product palette live here (or separate UI metadata)'],
    ['players','Provider-independent internal primary ID; never equal to BSD ID by design; current team relation explicit'],
    ['team_provider_ids','(provider, external_id) unique → internal team; namespace BSD external team IDs'],
    ['player_provider_ids','(provider, external_id) unique → internal player; no surname/number-based uniqueness'],
    ['legacy_team_aliases','Legacy namespace + fotmob-8637 → internal team T; reversible reviewed compatibility lookup'],
    ['legacy_player_aliases','Legacy namespace + 603669 → internal player P only after reviewed identity evidence; no automatic alias for unresolved cases']
  ])+'\nExample: fotmob-8637 resolves to internal T; BSD team 125 also maps to T. For an approved player identity, local:603669 resolves through a legacy alias to internal P, and a separately verified BSD external ID maps to P. Do not equate the numeric strings across providers or bulk-replace local: with bsd:.\n\nStage a read compatibility resolver before changing write IDs. Existing override row ownership stays unchanged; a future internal-player override key can read legacy aliases, with explicit collision review if local and BSD edits both exist. Never overwrite a user edit simply because an alias now exists.\n\nSaved Studio projects: preserve original snapshot version and display data; remap teamId/playerId plus every key/slotKey/personKey consistently in a versioned in-memory adapter, or retain opaque snapshot keys while resolving separate identity metadata. Bench and working substitutions must stay linked. Do not partially rewrite one ID field.\n\nDrafts: resolve known legacy athleteId on read while retaining user/account scope and unresolved snapshots; write a new version only after the future implementation is approved. Readonly shared lineups should remain self-contained; no retroactive public data rewrite. Preserve old IDs as aliases, do not delete unknown player history.\n\nBefore production: approve identity proposals, decide lossy/unknown role policy and XI fallback; implement adapters and targeted restore/override/collision tests; prepare a separate reversible migration. Existing RLS/grants/Auth/sharing security is outside this audit and remains unchanged.');
  section('15. Request ledger and validation',`D1.1 requests: **${ledger.length}**. Failed attempts: **${ledger.filter(r=>r.status!==200||r.failure).length}**. Retried attempts: **${ledger.filter(r=>r.attempt>1).length}**. Distinct paths cached: **${cache.size}**. Four workers; globally paced starts (>=180ms); GET only, exact BSD origin, redirects rejected; ceiling 650. Previous D1's 78 calls are not included in this run count. No raw responses persisted, media fetched, Supabase call or web search.\n\n`+table(['Endpoint family','Requests','Failed','Retried'],['team-list','team-detail','squad','player-detail','season-events','lineups'].map(f=>{const family=p=>p.startsWith('teams/?')?'team-list':p.includes('/squad/')?'squad':p.startsWith('teams/')?'team-detail':p.startsWith('players/')?'player-detail':p.startsWith('events/?')?'season-events':'lineups';const rs=ledger.filter(r=>family(r.path)===f);return [f,rs.length,rs.filter(r=>r.status!==200||r.failure).length,rs.filter(r=>r.attempt>1).length];}))+'\n'+table(['Failed endpoint','Attempt','HTTP','Failure'],ledger.filter(r=>r.status!==200||r.failure).map(r=>[r.path,r.attempt,r.status??'none',r.failure??'HTTP failure']))+'\nSource/D1 artifacts checked unchanged by SHA-256 before report write:\n\n'+table(['File','SHA-256'],Object.entries(baselineHashes)));
  section('16. Final decision A–L',table(['Question','Answer'],[
    ['A — Players with specific_position',`${present}/${bsd.length}; ${bsd.length-profileRows.length} unverified detail responses`],
    ['B — Values present',Object.entries(positionCounts).map(([k,v])=>k+'='+v).join(', ')],
    ['C — Full detailed-role replacement','No lossless full replacement unless all intended role semantics are represented. Single primary role cannot reconstruct legacy multi-role arrays. Use only observed direct codes plus separately approved lossy/unknown policy.'],
    ['D — Safe candidates among legacy-only',`${safe.length}/${unmatched.length}; exact published alias or structural token evidence + team/number/position/detail consistency + unique unclaimed target`],
    ['E — Still unresolved',`${unmatched.length-safe.length}/${unmatched.length} below safe threshold (not proven departures); the ${ambiguous.length} D1 ambiguous records remain separate`],
    ['F — MEDIUM safely promoted',String(promotions.length)+'; missing legacy evidence and disagreements were not guessed away'],
    ['G — Invalid shirt-number causes',Object.entries(count(invalid,invalidKind)).map(([k,v])=>k+'='+v).join(', ')],
    ['H — Keep 1–99 range',invalid.every(b=>b.number==null)?'YES for known numbers; NULL remains allowed. No range migration needed.':'REVIEW non-null invalid cases; do not expand blindly'],
    ['I — Store BSD short names directly','NO in the UI abbreviation field; retain product short labels. Provider short name may be separate optional metadata.'],
    ['J — Product-owned colors','YES architecturally; preserve palette independently. External hex provenance remains unknown.'],
    ['K — Confirmed XI instead of selection_rank',`${confirmed===18?'YES for the observed season':'PARTIAL'}; ${confirmed}/18 latest confirmed XI, ${formations}/18 valid formations, ${benches}/18 benches. Deterministic fallback still required.`],
    ['L — Ready for actual migration','Ready for a migration design/review, NOT an unconditional production apply. Resolve/retain uncertain identities, approve lossy-role policy and implement/test compatibility first.']
  ]));
  section('Appendix A. Safe identity proposals (not applied)',table(['legacyPlayerId','Legacy team/name','BSD ID','BSD name','Evidence'],safe.map(r=>[r.old.legacyPlayerId,r.old.team+' / '+r.old.name,r.candidate.b.id,r.candidate.b.name,r.candidate.reason])));
  section('Appendix B. Exhaustive curated player-detail inventory','Only requested audit fields; no raw JSON or media/credential fields.\n\n'+table(['BSD ID','Squad team','Squad name','Squad broad','Detail broad','specific_position','Squad #','Detail #'],bsd.map(b=>[b.id,b.team,b.name,b.position,b.detail?.position??'unavailable',b.detail?.specific_position??'NULL/MISSING',number(b.number),b.detail?number(b.detail.jersey_number):'unavailable'])));
  const report=parts.join('\n');assert(!report.includes(token));for(const p of protectedFiles)assert.equal(hash(p),baselineHashes[p],'Protected local input changed');
  writeFileSync(resolve(ROOT,'BSD_MIGRATION_BLOCKER_AUDIT.md'),report,'utf8');
  console.log(JSON.stringify({players:bsd.length,details:profileRows.length,specificPresent:present,positionCounts,conflicts:conflicts.length,detailDifferences:detailDifferences.length,d1CohortsStable,safeNew:safe.length,unresolved:unmatched.length-safe.length,legacyClassifications:count(investigations,r=>r.category),promotions:promotions.length,invalidNumbers:count(invalid,invalidKind),positionDirections:count(positionDiff,r=>r.old.position+'->'+r.match.position),confirmedXI:confirmed,formations,benches,requests:ledger.length,failed:ledger.filter(r=>r.status!==200||r.failure).length,retries:ledger.filter(r=>r.attempt>1).length}));
}
main().catch(()=>{console.error('BSD blocker audit stopped; no raw provider error or token logged.');console.log(JSON.stringify({requests:ledger.length,failed:ledger.filter(r=>r.status!==200||r.failure).length,retries:ledger.filter(r=>r.attempt>1).length}));process.exitCode=1;});
