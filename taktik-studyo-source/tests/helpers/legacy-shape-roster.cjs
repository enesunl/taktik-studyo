// SEC1.1 test data for the legacy (rollback-only) board adapter. The FotMob snapshot
// (dist/rosters.js) is no longer shipped or used. This builds the same window.TAKTIK_ROSTERS
// wire shape from the BSD catalogue fixture: real BSD names/numbers/positions, synthetic
// numeric legacy-style IDs, tactical roles derived from the BSD specific position, and no
// source URL, rank, market value or photo. Never imported by application code.
const fs=require('fs'),path=require('path');
const ROLES={GK:['KL'],CB:['STP'],LB:['SLB'],RB:['SĞB'],DM:['ÖL'],CM:['MO'],AM:['OO'],LW:['SLK'],RW:['SĞK'],LM:['SLK'],RM:['SĞK'],ST:['SF'],DEF:[],MID:[],FWD:[]};
let cached;
function legacyShapeRosters(){
  if(!cached){
    const read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,p),'utf8'));
    const bsd=read('../fixtures/bsd-catalogue-clean.json'),registry=read('../../scripts/catalogue/team-registrations.json');
    let next=700000;const teams={};
    for(const team of [...registry].sort((a,b)=>a.sort_order-b.sort_order)){
      teams[team.display_name]={players:bsd.players.filter(p=>p.team_id===team.id).map(p=>({id:String(next++),name:p.display_name,number:p.shirt_number,position:p.position_group,roles:ROLES[p.specific_position]}))};
    }
    cached=JSON.stringify({season:'2026/27',teams});
  }
  return JSON.parse(cached);
}
// The legacy database load also installs TAKTIK_TEAMS with the legacy team IDs that the
// legacy matches DTO uses; read them from that existing mapping (matches/teams.js).
function legacyTeams(){
  const source=fs.readFileSync(path.join(__dirname,'../../supabase/functions/matches/teams.js'),'utf8');
  return [...source.matchAll(/\[\d+,'([a-z0-9-]+)','([^']+)','(#[0-9a-f]{6})','(#[0-9a-f]{6})','[a-z0-9-]+'\]/g)].map(([,id,name,color,color2])=>({id,name,color,color2}));
}
// Script text for vm contexts, so the objects are created inside the board's own realm.
// withTeams mirrors the full legacy database install (catalogue-source.js install()).
exports.legacyRosterScript=({withTeams=false}={})=>{
  const rosters=legacyShapeRosters();
  if(!withTeams)return 'window.TAKTIK_ROSTERS='+JSON.stringify(rosters)+';';
  const shorts=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname,'../../scripts/catalogue/team-registrations.json'),'utf8')).map(t=>[t.display_name,t.short_name]));
  const teams=legacyTeams().map(t=>({...t,short:shorts[t.name]}));
  if(teams.length!==18||teams.some(t=>!rosters.teams[t.name]||!t.short))throw Error('legacy team mapping drifted');
  return 'window.TAKTIK_TEAMS='+JSON.stringify(teams)+';window.TAKTIK_ROSTERS='+JSON.stringify(rosters)+';';
};
exports.legacyShapeRosters=legacyShapeRosters;
