// Opt-in D2 compatibility infrastructure; not connected to the active browser.
// Historical snapshot identity is preserved; active catalogue identity is provider-independent.
export const internalPlayerId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
function index(rows,key,value){
  const map=new Map();for(const row of rows){const k=key(row),v=row[value];if(map.has(k)&&map.get(k)!==v)throw Error('ambiguous_identity');map.set(k,v);}return map;
}
export function identityResolver({teams=[],players=[],teamMappings=[],playerMappings=[],teamAliases=[],playerAliases=[]}){
  const teamIds=new Set(teams.map(t=>t.id)),playerIds=new Set(players.map(p=>p.id));
  const tm=index(teamMappings,r=>r.provider+':'+r.provider_id,'team_id'),pm=index(playerMappings,r=>r.provider+':'+r.provider_id,'player_id');
  const ta=index(teamAliases,r=>r.namespace+':'+r.legacy_id,'team_id'),pa=index(playerAliases,r=>r.namespace+':'+r.legacy_id,'player_id');
  const resolve=(id,source,ids,mappings,aliases)=>{
    const found=source==='internal'?id:source==='legacy'?aliases.get('taktik-v1:'+id):mappings.get(source+':'+id);
    return ids.has(found)?found:null;
  };
  return {
    team:(id,source='legacy')=>resolve(id,source,teamIds,tm,ta),
    player:(id,source='legacy')=>resolve(id,source,playerIds,pm,pa),
    historicalPlayer(p,source='legacy'){
      const id=p.athleteId??p.playerId;
      return {embedded:{...p},internalId:resolve(id,source,playerIds,pm,pa)};
    },
  };
}
// Preserve v1 keys/joins and values. Resolution lives in a sidecar, never in the
// serialized snapshot. This covers bench identities as well as initial starters.
export function resolveProjectIdentities(snapshot,resolver){
  return Object.fromEntries(['home','away'].map(side=>{
    const team=snapshot.teams?.[side];return [side,team?{
      teamId:resolver.team(team.teamId,team.teamId.startsWith('fotmob-')?'legacy':'internal'),
      people:[...team.players,...team.bench].map(p=>({key:p.key,internalId:resolver.player(p.playerId,
        p.key.startsWith('internal:')?'internal':p.key.startsWith('local:')?'legacy':'bsd')})),
    }:null];
  }));
}
// For creating a NEW canonical project only; all joins remap together or fail.
// Never call while loading/saving a historical project. That path preserves v1.
export function createInternalProjectSnapshot(snapshot,resolver){
  const out=structuredClone(snapshot),keys=new Map();
  for(const side of ['home','away']){
    const t=out.teams[side];if(!t)continue;
    const teamId=resolver.team(t.teamId,t.teamId.startsWith('fotmob-')?'legacy':'internal');
    if(!teamId)throw Error('unresolved_team');t.teamId=teamId;
    for(const p of [...t.players,...t.bench]){
      const id=resolver.player(p.playerId,p.key.startsWith('internal:')?'internal':p.key.startsWith('local:')?'legacy':'bsd');
      if(!id)throw Error('unresolved_player');const key=`internal:${side}:${teamId}:${id}`;
      if([...keys.values()].includes(key))throw Error('identity_collision');keys.set(p.key,key);p.key=key;p.playerId=id;
    }
  }
  for(const p of out.working){if(!keys.has(p.slotKey)||!keys.has(p.personKey))throw Error('unresolved_join');p.slotKey=keys.get(p.slotKey);p.personKey=keys.get(p.personKey);}
  return out;
}
// Owner-scoped proposal ONLY. Never deletes/updates old overrides; collisions
// remain explicit, so two customizations cannot silently overwrite each other.
export function planOverrideAliases(rows,owner,resolver){
  const mapped=[],unresolved=[],collisions=[];const claims=new Map();
  for(const row of rows){
    if(row.user_id!==owner)throw Error('owner_mismatch');
    const [namespace,...tail]=row.player_key.split(':'),id=tail.join(':');
    const target=resolver.player(id,namespace==='local'?'legacy':namespace);
    if(!target){unresolved.push({...row});continue;}
    const key='internal:'+target;if(!claims.has(key))claims.set(key,[]);claims.get(key).push(row);
  }
  for(const [key,group] of claims){
    if(group.length>1){collisions.push({key,originals:group.map(r=>({...r}))});continue;}
    mapped.push({...group[0],player_key:key,legacy_key:group[0].player_key});
  }
  return {mapped,unresolved,collisions};
}
