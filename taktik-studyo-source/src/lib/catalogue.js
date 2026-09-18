import { ROLES, photoValid, teamValid } from './validation.js';
const teamColumns = 'id,name,short_name,logo_url,color_primary,color_secondary,source_url,sort_order';
const playerColumns = 'id,team_id,name,position,shirt_number,photo_url,roles,selection_rank';
export function createCatalogue(client, now = Date.now) {
  let cache = null, expires = 0, pending = null;
  const teamRequests=new Map();
  async function fetchCatalogue(teamId=null) {
    let teamQuery=client.from('teams').select(teamColumns).order('sort_order').limit(501);
    if(teamId)teamQuery=teamQuery.eq('id',teamId);
    const teamResult = await teamQuery;
    if (teamResult.error || !teamResult.data?.length || teamResult.data.length > 500) throw new Error('Catalogue unavailable');
    const teams = teamResult.data.map(t=>({id:t.id,name:t.name,short:t.short_name,color:t.color_primary,color2:t.color_secondary,logo:t.logo_url}));
    if (!teams.every(teamValid) || new Set(teams.map(t=>t.name)).size !== teams.length) throw new Error('Invalid teams');
    const rows = [];
    // Bounded keyset pagination: works beyond the default 1,000-row API limit.
    for (let page=0;page<100;page++) {
      let query = client.from('players').select(playerColumns).order('id').limit(1000);
      query=teamId?query.eq('team_id',teamId):query.in('team_id',teams.map(t=>t.id));
      if (rows.length) query = query.gt('id',rows[rows.length-1].id);
      const result = await query;
      if (result.error || !Array.isArray(result.data)) throw new Error('Catalogue unavailable');
      rows.push(...result.data);
      if (result.data.length < 1000) break;
      if (page===99) throw new Error('Catalogue too large');
    }
    const byId = new Map(teams.map(t=>[t.id,t.name])), rosters = Object.create(null);
    for (const t of teamResult.data) rosters[t.name]={source:typeof t.source_url==='string' && /^https:\/\//.test(t.source_url)?t.source_url:'https://www.fotmob.com',players:[]};
    for (const p of rows) {
      const name=byId.get(p.team_id);
      if (!name) continue;
      if (typeof p.id!=='string' || p.id.length>80 || typeof p.name!=='string' || !p.name.trim() || p.name.length>100 || !['G','D','M','F'].includes(p.position) || !photoValid(p.photo_url) || !(p.shirt_number===null || (Number.isInteger(p.shirt_number)&&p.shirt_number>=1&&p.shirt_number<=99)) || !Array.isArray(p.roles) || !p.roles.every(r=>ROLES.includes(r)) || !Number.isFinite(p.selection_rank)) throw new Error('Invalid player');
      rosters[name].players.push({id:p.id,name:p.name,number:p.shirt_number,position:p.position,roles:p.roles,photo:p.photo_url,starts:p.selection_rank});
    }
    if (teams.some(t=>rosters[t.name].players.length<11)) throw new Error('Incomplete catalogue');
    const result={teams,rosters};
    if(!teamId){cache=result;expires=now()+300000;}
    return result;
  }
  return {
    load(){if(cache&&now()<expires)return Promise.resolve(cache);if(!pending)pending=fetchCatalogue().finally(()=>{pending=null;});return pending;},
    loadTeam(id){
      if(typeof id!=='string'||!/^[a-z0-9_-]{1,80}$/.test(id))return Promise.reject(new Error('Invalid team ID'));
      if(cache&&now()<expires){const team=cache.teams.find(t=>t.id===id);if(team)return Promise.resolve({teams:[team],rosters:{[team.name]:cache.rosters[team.name]}});}
      if(!teamRequests.has(id))teamRequests.set(id,fetchCatalogue(id).finally(()=>teamRequests.delete(id)));
      return teamRequests.get(id);
    }
  };
}
