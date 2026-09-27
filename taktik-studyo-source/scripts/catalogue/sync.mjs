// Server-only infrastructure. Not imported by backend-entry or browser code.
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {positionCompatibility} from '../../src/lib/bsd-specific-position.js';
const check=(ok,code='invalid_catalogue')=>{if(!ok)throw Error(code);};
const unique=(rows,key)=>check(new Set(rows.map(key)).size===rows.length,'duplicate_identity');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const name=(v,max)=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const providerId=v=>typeof v==='string'&&/^[1-9][0-9]{0,15}$/.test(v);
const teamFields=['id','display_name','short_name','color_primary','color_secondary','sort_order'];
const playerFields=['team_id','display_name','position_group','specific_position','shirt_number'];
const pick=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));
export function validateInput(input){
  check(input?.complete===true&&input.provider==='bsd'&&Array.isArray(input.teams)&&input.teams.length>0&&input.teams.length<=100);
  check(Array.isArray(input.players)&&input.players.length<=10000);
  unique(input.teams,t=>t.id);unique(input.teams,t=>t.bsdId);unique(input.players,p=>p.provider_id);
  for(const t of input.teams){
    check(/^[a-z][a-z0-9-]{0,79}$/.test(t.id)&&providerId(t.bsdId)&&name(t.display_name,80)&&name(t.short_name,8));
    check(/^#[0-9a-f]{6}$/i.test(t.color_primary)&&/^#[0-9a-f]{6}$/i.test(t.color_secondary)&&Number.isInteger(t.sort_order)&&t.sort_order>=0&&t.sort_order<=10000);
    check(input.players.filter(p=>p.team_id===t.id).length>=11,'incomplete_squad');
  }
  for(const p of input.players){
    check(providerId(p.provider_id)&&input.teams.some(t=>t.id===p.team_id)&&name(p.display_name,100));
    check(p.shirt_number===null||Number.isInteger(p.shirt_number)&&p.shirt_number>=1&&p.shirt_number<=99);
    positionCompatibility(p.position_group,p.specific_position);
  }
}
export const emptyState=()=>({teams:[],players:[],teamMappings:[],playerMappings:[],teamAliases:[],playerAliases:[]});
export function planSync(input,state=emptyState(),{newId=randomUUID}={}){
  validateInput(input);
  const existingTeamMap=new Map(state.teamMappings.filter(m=>m.provider==='bsd').map(m=>[m.provider_id,m.team_id]));
  const existingPlayerMap=new Map(state.playerMappings.filter(m=>m.provider==='bsd').map(m=>[m.provider_id,m.player_id]));
  const teams=input.teams.map(t=>{
    check(!existingTeamMap.has(t.bsdId)||existingTeamMap.get(t.bsdId)===t.id,'team_mapping_conflict');
    const previous=state.teams.find(x=>x.id===t.id);
    return {...pick(previous||t,teamFields),catalogue_active:true};
  });
  const players=input.players.map(p=>{
    const id=existingPlayerMap.get(p.provider_id)||newId();check(uuid(id),'invalid_internal_id');
    check(!existingPlayerMap.has(p.provider_id)||state.players.some(x=>x.id===id),'dangling_mapping');
    check(existingPlayerMap.has(p.provider_id)||!state.players.some(x=>x.id===id),'identity_collision');
    return {id,...pick(p,playerFields),catalogue_active:true};
  });
  unique(players,p=>p.id);
  const playerMappings=input.players.map((p,i)=>({provider:'bsd',provider_id:p.provider_id,player_id:players[i].id}));
  const teamMappings=input.teams.map(t=>({provider:'bsd',provider_id:t.bsdId,team_id:t.id}));
  // All-team complete runs only; absent players stay addressable with last team.
  const present=new Set(players.map(p=>p.id)),scope=new Set(teams.map(t=>t.id));
  const inactiveTeams=state.teamMappings.filter(m=>m.provider==='bsd'&&!scope.has(m.team_id)).map(m=>m.team_id);
  const inactive=state.playerMappings.filter(m=>m.provider==='bsd'&&!present.has(m.player_id))
    .filter(m=>state.players.some(p=>p.id===m.player_id&&p.catalogue_active)).map(m=>m.player_id);
  const conflicts=input.players.filter(p=>positionCompatibility(p.position_group,p.specific_position).conflict).map(p=>p.provider_id);
  return {teams,players,teamMappings,playerMappings,inactive,inactiveTeams,conflicts,summary:{teams:teams.length,activePlayers:players.length,newPlayers:players.filter(p=>!state.players.some(s=>s.id===p.id)).length,inactive:inactive.length,positionConflicts:conflicts.length}};
}
// GET URLs are constructed here; provider pagination URLs are never followed.
export async function fetchBsdCatalogue({token,registrations,leagueId=11,seasonId=1539,fetchImpl=fetch}){
  check(typeof token==='string'&&token.trim(),'provider_unavailable');
  check(Number.isSafeInteger(leagueId)&&leagueId>0&&Number.isSafeInteger(seasonId)&&seasonId>0);
  check(Array.isArray(registrations)&&registrations.length>0&&registrations.length<=100);
  const base='https://sports.bzzoiro.com/api/v2/';
  async function get(path){
    try{
      const r=await fetchImpl(base+path,{method:'GET',headers:{Authorization:'Token '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error();const body=await r.text();if(body.length>4_000_000)throw Error();return JSON.parse(body);
    }catch{throw Error('provider_unavailable');}
  }
  const set=await get(`teams/?league_id=${leagueId}&season_id=${seasonId}&limit=200&offset=0`);
  check(set?.next===null&&set.count===registrations.length&&set.results?.length===set.count,'team_scope_changed');
  unique(set.results,t=>t.id);const teams=[],players=[];
  for(const t of set.results){
    const reg=registrations.find(r=>r.bsdId===String(t.id));check(reg,'unreviewed_team');
    const id=String(t.id);check(providerId(id));teams.push({...pick(reg,teamFields),bsdId:id});
    const squad=await get(`teams/${id}/squad/`);
    check(squad?.team_id===t.id&&Array.isArray(squad.players)&&squad.count===squad.players.length&&squad.count>=11&&squad.count<=100,'incomplete_squad');
    for(const p of squad.players){
      const pid=String(p.id);check(providerId(pid));
      const d=await get(`players/${pid}/`);
      check(d?.id===p.id&&d.current_team_id===t.id&&d.name===p.name&&d.position===p.position&&d.jersey_number===p.jersey_number,'inconsistent_provider_response');
      players.push({provider_id:pid,team_id:reg.id,display_name:p.name,position_group:p.position,specific_position:d.specific_position,shirt_number:p.jersey_number});
    }
  }
  const input={provider:'bsd',complete:true,teams,players};validateInput(input);return input;
}
const tables={teams:'catalogue_teams',players:'catalogue_players',teamMappings:'team_provider_ids',playerMappings:'player_provider_ids',teamAliases:'legacy_team_aliases',playerAliases:'legacy_player_aliases'};
export async function readCanonicalState(db){const state={};for(const key of ['teams','players','teamMappings','playerMappings'])state[key]=(await db.query('select * from public.'+tables[key])).rows;return state;}
export async function readState(db){const state={};for(const [key,table] of Object.entries(tables))state[key]=(await db.query('select * from public.'+table)).rows;return state;}
// D2 ships NO remote database writer. Only a real, in-process PGlite is accepted.
// A future production runner needs separate review, lock/concurrency and approval.
export async function syncLocal(db,input,{dryRun=true,aliases=[],teamAliases=[],newId=randomUUID}={}){
  check(db instanceof PGlite,'local_database_required');
  return db.transaction(async tx=>{
    const state=await readCanonicalState(tx),plan=planSync(input,state,{newId});
    if(dryRun)return plan;
    const insert=async(table,row,conflict)=>{const keys=Object.keys(row);await tx.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) ${conflict}`,Object.values(row));};
    for(const t of plan.teams)await insert('catalogue_teams',t,'on conflict(id) do update set catalogue_active=excluded.catalogue_active');
    for(const p of plan.players)await insert('catalogue_players',p,'on conflict(id) do update set '+[...playerFields,'catalogue_active'].map(k=>k+'=excluded.'+k).join(','));
    for(const [kind,rows] of [['team_provider_ids',plan.teamMappings],['player_provider_ids',plan.playerMappings]])for(const m of rows)await insert(kind,m,'on conflict(provider,provider_id) do nothing');
    if(plan.inactive.length)await tx.query('update public.catalogue_players set catalogue_active=false where id=any($1::uuid[])',[plan.inactive]);
    if(plan.inactiveTeams.length)await tx.query('update public.catalogue_teams set catalogue_active=false where id=any($1::text[])',[plan.inactiveTeams]);
    // Evidence-reviewed aliases only. Generic sync does not guess names.
    for(const [kind,rows,targetKey,mapping] of [
      ['legacy_team_aliases',teamAliases,'team_id',new Map(plan.teamMappings.map(m=>[m.provider_id,m.team_id]))],
      ['legacy_player_aliases',aliases,'player_id',new Map(plan.playerMappings.map(m=>[m.provider_id,m.player_id]))]]){
      for(const a of rows){
        const id=mapping.get(a.provider_id);check(id,'unmapped_alias');
        const old=(await tx.query(`select ${targetKey} from public.${kind} where namespace='taktik-v1' and legacy_id=$1`,[a.legacy_id])).rows[0];
        check(!old||old[targetKey]===id,'alias_conflict');
        await insert(kind,{namespace:'taktik-v1',legacy_id:a.legacy_id,[targetKey]:id,evidence:a.evidence},'on conflict(namespace,legacy_id) do nothing');
      }
    }
    return plan;
  });
}
