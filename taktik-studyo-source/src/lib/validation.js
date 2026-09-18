// Shared by the browser and Edge Function. Only JSON data; no HTML interpretation.
export const ROLES = ['KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF'];
export const SHARE_BYTES = 131072;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fields = (v, required, optional = []) => object(v) && required.every(k => Object.hasOwn(v,k)) && Object.keys(v).every(k => [...required,...optional].includes(k));
const string = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const color = v => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v);
export const formationValid = v => typeof v === 'string' && /^[1-9](?:-[1-9]){1,4}$/.test(v) && v.split('-').reduce((n,v)=>n+Number(v),0) === 10;
export const photoValid = v => v == null || (typeof v === 'string' && /^\/?faces\/[0-9]{1,16}\.png$/.test(v));
export function teamValid(v) {
  return fields(v,['name','short','color','color2'],['id','logo']) && string(v.name,80) && string(v.short,8) && color(v.color) && color(v.color2) && (v.id === undefined || string(v.id,80)) && (v.logo === undefined || v.logo === null || (typeof v.logo === 'string' && /^https:\/\//.test(v.logo) && v.logo.length <= 500));
}
export function playersValid(players) {
  if (!Array.isArray(players) || players.length !== 11) return false;
  const ids = new Set(), athletes = new Set();
  for (const p of players) {
    if (!fields(p,['id','x','y','role','name','number','renamed'],['athleteId','photo']) || !Number.isInteger(p.id) || p.id < 0 || p.id > 10 || ids.has(p.id) || !finite(p.x,0,100) || !finite(p.y,0,100) || !ROLES.includes(p.role) || !string(p.name,100) || !(p.number === null || (Number.isInteger(p.number) && p.number >= 1 && p.number <= 99)) || typeof p.renamed !== 'boolean' || !photoValid(p.photo)) return false;
    if (p.athleteId != null) { if (!string(p.athleteId,80) || athletes.has(p.athleteId)) return false; athletes.add(p.athleteId); }
    ids.add(p.id);
  }
  // Slot array order matters to the existing formation engine.
  return players.every((p,i)=>p.id===i);
}
export function drawingsValid(drawings, local = false) {
  if (!Array.isArray(drawings) || drawings.length > (local ? 512 : 128)) return false;
  let total = 0;
  return drawings.every(s => {
    if (!fields(s,['tool','color','width','points']) || !['pen','eraser'].includes(s.tool) || !color(s.color) || s.width !== (s.tool==='pen'?4:24) || !Array.isArray(s.points) || !s.points.length) return false;
    total += s.points.length;
    return total <= (local ? 20000 : 2000) && s.points.every(p=>fields(p,['x','y']) && finite(p.x,0,1) && finite(p.y,0,1));
  });
}
export function stateValid(s) {
  return fields(s,['team','formation','customized','players','drawings']) && teamValid(s.team) && formationValid(s.formation) && typeof s.customized === 'boolean' && playersValid(s.players) && drawingsValid(s.drawings,true);
}
export function shareValid(s) {
  return fields(s,['team_name','formation','lineup_data','drawing_data']) && string(s.team_name,80) && formationValid(s.formation) && fields(s.lineup_data,['team','customized','players']) && teamValid(s.lineup_data.team) && s.team_name === s.lineup_data.team.name && typeof s.lineup_data.customized === 'boolean' && playersValid(s.lineup_data.players) && drawingsValid(s.drawing_data);
}
export function toShare(state) {
  return {team_name:state.team.name, formation:state.formation, lineup_data:{team:state.team,customized:state.customized,players:state.players},drawing_data:state.drawings};
}
