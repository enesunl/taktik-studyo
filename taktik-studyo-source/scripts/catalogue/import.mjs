// PROD1.5 operator tool: import/update the BSD canonical catalogue in a Supabase project.
// Server-only. Never imported by browser code; keys and provider tokens come from the
// operator's environment and are never printed, written or bundled.
//
//   node scripts/catalogue/import.mjs --target local --input <bsd.json|backup.json>            # dry run
//   node scripts/catalogue/import.mjs --target local --input <file> --backup <path> --apply --confirm local
//   node scripts/catalogue/import.mjs --target hosted --fetch-bsd                                # dry run (reads only)
//   node scripts/catalogue/import.mjs --target hosted --fetch-bsd --backup <path> --apply --confirm <project-ref>
//   node scripts/catalogue/import.mjs --target local --export <path>                           # backup only
//
// Dry run is the default. Writes need --apply, --confirm <target> and a --backup path outside
// the repository (raw provider data is never written into the repo or the published dist/).
// Identity: BSD provider mappings decide identity; a mapped player keeps its UUID forever.
// New players get a deterministic UUID derived from the BSD player ID (same in every
// environment). Legacy/FotMob identities and alias tables are never read or written.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planSync,validateInput,fetchBsdCatalogue} from './sync.mjs';
import {positionCompatibility} from '../../src/lib/bsd-specific-position.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const fail=code=>{throw Object.assign(Error(code),{code});};
const sha256=text=>createHash('sha256').update(text).digest('hex');

// Deterministic, valid v4-shaped UUID for a BSD player (namespace-hashed provider ID).
export function bsdPlayerUuid(providerId){
  if(typeof providerId!=='string'||!/^[1-9][0-9]{0,15}$/.test(providerId))fail('invalid_provider_id');
  const h=sha256('taktik-studyo:catalogue:bsd-player:'+providerId);
  return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-'+'89ab'[parseInt(h[16],16)%4]+h.slice(17,20)+'-'+h.slice(20,32);
}

export function loadRegistrations(){return JSON.parse(readFileSync(resolve(ROOT,'scripts/catalogue/team-registrations.json'),'utf8'));}

// Accepts the normalized BSD export (tests/fixtures/bsd-catalogue-clean.json format) or a
// catalogue backup produced by --export. Returns a validated sync input. Never the legacy roster.
export function inputFromDocument(doc,registrations=loadRegistrations()){
  const text=JSON.stringify(doc??null);
  if(/fotmob|TAKTIK_ROSTERS|selection_rank|photo_url/i.test(text))fail('legacy_data_rejected');
  if(doc?.kind==='taktik-catalogue-backup'){
    if(doc.version!==1||doc.provider!=='bsd')fail('invalid_backup');
    const teamBsd=new Map(doc.team_mappings.filter(m=>m.provider==='bsd').map(m=>[m.team_id,m.provider_id]));
    const playerBsd=new Map(doc.player_mappings.filter(m=>m.provider==='bsd').map(m=>[m.player_id,m.provider_id]));
    const teams=doc.teams.filter(t=>t.catalogue_active&&teamBsd.has(t.id)).map(t=>({id:t.id,display_name:t.display_name,short_name:t.short_name,color_primary:t.color_primary,color_secondary:t.color_secondary,sort_order:t.sort_order,bsdId:teamBsd.get(t.id)}));
    const players=doc.players.filter(p=>p.catalogue_active&&playerBsd.has(p.id)).map(p=>({provider_id:playerBsd.get(p.id),team_id:p.team_id,display_name:p.display_name,position_group:p.position_group,specific_position:p.specific_position,shirt_number:p.shirt_number}));
    const input={provider:'bsd',complete:true,teams,players};validateInput(input);return input;
  }
  if(doc?.provider!=='bsd'||doc.complete!==true||!Array.isArray(doc.teams)||!Array.isArray(doc.players))fail('invalid_input');
  if(doc.leagueId!==11||doc.seasonId!==1539)fail('team_scope_changed');
  const teams=doc.teams.map(t=>{const reg=registrations.find(r=>r.bsdId===String(t.provider_id));if(!reg)fail('unreviewed_team');
    return {id:reg.id,display_name:reg.display_name,short_name:reg.short_name,color_primary:reg.color_primary,color_secondary:reg.color_secondary,sort_order:reg.sort_order,bsdId:reg.bsdId};});
  if(teams.length!==registrations.length)fail('team_scope_changed');
  const input={provider:'bsd',complete:true,teams,players:doc.players.map(p=>({provider_id:String(p.provider_id),team_id:p.team_id,display_name:p.display_name,position_group:p.position_group,specific_position:p.specific_position,shirt_number:p.shirt_number}))};
  validateInput(input);return input;
}

// Paginated read of the canonical tables with a server key (all rows, active or not).
export async function readRemoteState(client){
  const all=async(table,order)=>{const rows=[];for(let from=0;;from+=1000){const {data,error}=await client.from(table).select('*').order(order).range(from,from+999);
    if(error)fail(error.code==='42P01'||error.code==='PGRST205'?'schema_unavailable':'state_unavailable');rows.push(...data);if(data.length<1000)return rows;if(from>100000)fail('state_too_large');}};
  const state={teams:await all('catalogue_teams','id'),players:await all('catalogue_players','id'),teamMappings:await all('team_provider_ids','provider_id'),playerMappings:await all('player_provider_ids','provider_id')};
  const status=await client.rpc('catalogue_sync_status');if(status.error)fail('sync_function_unavailable');
  return {...state,lastRun:status.data?.last_run??null};
}

// Full plan plus a human report of every change class. Throws on conflicts/duplicates.
export function planImport(input,state,{allowDeactivations=0,allowTeamDeactivations=0,source,inputSha}){
  const plan=planSync(input,state,{newId:p=>bsdPlayerUuid(p.provider_id)});
  const byId=new Map(state.players.map(p=>[p.id,p])),teamName=new Map([...state.teams,...input.teams].map(t=>[t.id,t.display_name]));
  const rows=input.players.map((p,i)=>({...p,id:plan.players[i].id,previous:byId.get(plan.players[i].id)}));
  const report={
    newPlayers:rows.filter(r=>!r.previous),
    reactivated:rows.filter(r=>r.previous&&!r.previous.catalogue_active),
    moved:rows.filter(r=>r.previous&&r.previous.team_id!==r.team_id),
    renamed:rows.filter(r=>r.previous&&r.previous.display_name!==r.display_name),
    renumbered:rows.filter(r=>r.previous&&r.previous.shirt_number!==r.shirt_number),
    repositioned:rows.filter(r=>r.previous&&(r.previous.position_group!==r.position_group||r.previous.specific_position!==r.specific_position)),
    deactivated:plan.inactive.map(id=>byId.get(id)),
    deactivatedTeams:plan.inactiveTeams,
    newTeams:input.teams.filter(t=>!state.teams.some(s=>s.id===t.id)).map(t=>t.id),
    teamMetadataDiffers:input.teams.filter(t=>{const s=state.teams.find(x=>x.id===t.id);return s&&['display_name','short_name','color_primary','color_secondary','sort_order'].some(k=>s[k]!==t[k]);}).map(t=>t.id),
    duplicateNumbers:[],duplicateNames:[],positionConflicts:plan.conflicts.length,
  };
  for(const t of input.teams){
    const squad=input.players.filter(p=>p.team_id===t.id),count=(key)=>{const seen=new Map();for(const p of squad){const k=p[key];if(k==null)continue;seen.set(k,(seen.get(k)||0)+1);}return [...seen].filter(([,n])=>n>1).map(([k])=>t.id+':'+k);};
    report.duplicateNumbers.push(...count('shirt_number'));report.duplicateNames.push(...count('display_name'));
    if(squad.filter(p=>p.position_group==='G').length<1)fail('team_without_goalkeeper:'+t.id);
  }
  for(const p of input.players)positionCompatibility(p.position_group,p.specific_position);
  if(report.deactivated.length>allowDeactivations||report.deactivatedTeams.length>allowTeamDeactivations)
    report.blocked=`deactivation_limit: ${report.deactivated.length} players, ${report.deactivatedTeams.length} teams (allowed ${allowDeactivations}/${allowTeamDeactivations})`;
  const rpc={provider:'bsd',source,input_sha256:inputSha,expected_run:state.lastRun??null,allow_deactivations:allowDeactivations,allow_team_deactivations:allowTeamDeactivations,
    teams:input.teams.map(t=>({id:t.id,bsd_id:t.bsdId,display_name:t.display_name,short_name:t.short_name,color_primary:t.color_primary,color_secondary:t.color_secondary,sort_order:t.sort_order})),
    players:rows.map(r=>({id:r.id,provider_id:r.provider_id,team_id:r.team_id,display_name:r.display_name,position_group:r.position_group,specific_position:r.specific_position,shirt_number:r.shirt_number}))};
  return {plan,report,rpc,teamName};
}

export function backupDocument(state,{takenAt=new Date().toISOString()}={}){
  return {kind:'taktik-catalogue-backup',version:1,provider:'bsd',taken_at:takenAt,last_run:state.lastRun??null,
    teams:state.teams,players:state.players,team_mappings:state.teamMappings,player_mappings:state.playerMappings};
}

// Backups contain provider data: only outside the repository (never in dist/ or a commit).
export function assertOutsideRepository(path){
  const target=resolve(path),parent=existsSync(dirname(target))?realpathSync(dirname(target)):dirname(target);
  const rel=relative(realpathSync(resolve(ROOT,'..')),parent);
  if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))fail('backup_inside_repository');
  return target;
}

export function verifyState(state,input){
  const active=state.players.filter(p=>p.catalogue_active),mapped=new Map(state.playerMappings.filter(m=>m.provider==='bsd').map(m=>[m.provider_id,m.player_id]));
  const problems=[];
  if(new Set(state.players.map(p=>p.id)).size!==state.players.length)problems.push('duplicate_player_ids');
  if(new Set(state.playerMappings.map(m=>m.provider+':'+m.player_id)).size!==state.playerMappings.length)problems.push('player_mapped_twice');
  for(const p of input.players){const id=mapped.get(p.provider_id),row=state.players.find(x=>x.id===id);
    if(!row||!row.catalogue_active||row.team_id!==p.team_id||row.display_name!==p.display_name||row.shirt_number!==p.shirt_number)problems.push('mismatch:'+p.provider_id);}
  for(const t of input.teams){if(!state.teams.some(x=>x.id===t.id&&x.catalogue_active))problems.push('team_missing:'+t.id);
    if(active.filter(p=>p.team_id===t.id).length<11)problems.push('team_incomplete:'+t.id);}
  if(active.length!==input.players.length)problems.push('active_count:'+active.length);
  return problems;
}

function args(argv){
  const o={};for(let i=0;i<argv.length;i++){const a=argv[i];if(!a.startsWith('--'))fail('invalid_argument');const k=a.slice(2);
    if(['apply','fetch-bsd'].includes(k))o[k]=true;else{o[k]=argv[++i];if(o[k]===undefined)fail('missing_value:'+k);}}
  return o;
}
async function target(kind,readStatus){
  if(kind==='local'){
    const {readLocalStatus,assertLocalUrl}=await import('../local-supabase.mjs');const s=await (readStatus||readLocalStatus)();
    return {label:'local',url:assertLocalUrl(s.API_URL),key:s.SECRET_KEY||s.SERVICE_ROLE_KEY};
  }
  if(kind==='hosted'){
    const ref=JSON.parse(readFileSync(resolve(ROOT,'supabase/project.json'),'utf8')).project_id;
    const url=process.env.SUPABASE_URL,key=process.env.CATALOGUE_IMPORT_SECRET_KEY;
    if(!ref||url!==`https://${ref}.supabase.co`)fail('hosted_target_mismatch');
    return {label:ref,url,key};
  }
  fail('target_required');
}
const show=(label,list,fmt=x=>x)=>console.log(`  ${label}: ${list.length}${list.length?' — '+list.slice(0,8).map(fmt).join(', ')+(list.length>8?', …':''):''}`);

export async function main(argv=process.argv.slice(2),{createClient,readStatus}={}){
  const o=args(argv),t=await target(o.target,readStatus);
  if(typeof t.key!=='string'||/^sb_publishable_/.test(t.key)||!t.key)fail('server_key_required');
  createClient??=(await import('@supabase/supabase-js')).createClient;
  const client=createClient(t.url,t.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const state=await readRemoteState(client);
  if(o.export){const path=assertOutsideRepository(o.export);writeFileSync(path,JSON.stringify(backupDocument(state)));console.log(`Backup written (${state.players.length} players, ${state.teams.length} teams, run ${state.lastRun??'none'}).`);if(!o.input&&!o['fetch-bsd'])return 0;}
  let input,raw,source;
  if(o['fetch-bsd']){if(o.input)fail('choose_one_input');input=await fetchBsdCatalogue({token:process.env.BSD_API_TOKEN,registrations:loadRegistrations()});raw=JSON.stringify(input);source='bsd:live';}
  else if(o.input){raw=readFileSync(resolve(o.input),'utf8');const doc=JSON.parse(raw);input=inputFromDocument(doc);source=doc.kind==='taktik-catalogue-backup'?'backup:restore':'bsd:file';}
  else fail('input_required');
  const allow=Number(o['allow-deactivations']||0),allowTeams=Number(o['allow-team-deactivations']||0);
  if(!Number.isInteger(allow)||allow<0||!Number.isInteger(allowTeams)||allowTeams<0)fail('invalid_allowance');
  const {report,rpc,teamName}=planImport(input,state,{allowDeactivations:allow,allowTeamDeactivations:allowTeams,source,inputSha:sha256(raw)});
  const who=p=>p?`${p.display_name} (${teamName.get(p.team_id)||p.team_id})`:'?';
  console.log(`Target ${t.label}: ${state.teams.length} teams, ${state.players.length} players (${state.players.filter(p=>p.catalogue_active).length} active), last run ${state.lastRun??'none'}.`);
  console.log(`Input ${source}: ${input.teams.length} teams, ${input.players.length} players, sha256 ${rpc.input_sha256.slice(0,12)}…`);
  show('new teams',report.newTeams);show('team metadata kept (differs from registration)',report.teamMetadataDiffers);
  show('new players',report.newPlayers,who);show('reactivated',report.reactivated,who);show('moved team',report.moved,who);
  show('renamed',report.renamed,who);show('shirt number changed',report.renumbered,who);show('position changed',report.repositioned,who);
  show('to deactivate (never deleted)',report.deactivated,who);show('teams to deactivate',report.deactivatedTeams);
  show('duplicate shirt numbers in a squad',report.duplicateNumbers);show('duplicate names in a squad',report.duplicateNames);
  console.log(`  position group/specific conflicts kept as provider facts: ${report.positionConflicts}`);
  if(report.blocked){console.log('BLOCKED: '+report.blocked+'. Re-run with --allow-deactivations after review.');return 2;}
  if(!o.apply){console.log('DRY RUN — nothing written. Add --backup <path outside repo> --apply --confirm '+t.label+' to write.');return 0;}
  if(o.confirm!==t.label)fail('confirmation_mismatch');
  if(!o.backup)fail('backup_required');
  writeFileSync(assertOutsideRepository(o.backup),JSON.stringify(backupDocument(state)));console.log('Pre-apply backup written.');
  const {data,error}=await client.rpc('catalogue_apply_sync',{plan:rpc});
  if(error)fail('apply_failed:'+(error.message||error.code));
  const after=await readRemoteState(client),problems=verifyState(after,input);
  console.log('Applied run '+data.run+': '+JSON.stringify(data));
  if(problems.length){console.log('VERIFY FAILED: '+problems.slice(0,10).join(', '));return 3;}
  console.log(`Verified: ${after.teams.filter(t=>t.catalogue_active).length} active teams, ${after.players.filter(p=>p.catalogue_active).length} active players, all BSD mappings stable.`);
  return 0;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().then(code=>{process.exitCode=code;},e=>{console.error('Import refused: '+(e.code||e.message));process.exitCode=1;});
}
