import {positionCompatibility} from '../../src/lib/bsd-specific-position.js';
import {internalPlayerId} from '../../src/lib/catalogue-identity.js';
// Generate inert JSON only. No legacy IDs, source/media URLs, performance ranks,
// provider mappings or script execution. Not wired into dist/rosters.js in D2.
export function generateFallback({teams,players}){
  if(teams.some(t=>!(/^[a-z][a-z0-9-]{0,79}$/.test(t.id))||t.id.startsWith('fotmob-'))||players.some(p=>!internalPlayerId(p.id)))throw Error('internal_identity_required');
  const active=teams.filter(t=>t.catalogue_active!==false).map(t=>({id:t.id,display_name:t.display_name,short_name:t.short_name,
    color_primary:t.color_primary,color_secondary:t.color_secondary,sort_order:t.sort_order})).sort((a,b)=>a.sort_order-b.sort_order||(a.id<b.id?-1:1));
  const ids=new Set(active.map(t=>t.id));
  const rows=players.filter(p=>p.catalogue_active!==false&&ids.has(p.team_id)).map(p=>{
    positionCompatibility(p.position_group,p.specific_position);
    return {id:p.id,team_id:p.team_id,display_name:p.display_name,shirt_number:p.shirt_number,position_group:p.position_group,specific_position:p.specific_position};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return JSON.stringify({version:1,identity:'taktik-internal',teams:active,players:rows})+'\n';
}
