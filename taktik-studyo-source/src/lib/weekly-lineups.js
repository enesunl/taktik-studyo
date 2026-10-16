import {weeklySnapshot} from './weekly-xi.js';
import {internalPlayerId} from './catalogue-identity.js';
import {projectIdValid,projectTitle,limitError} from './studio-project-snapshot.js';
export const WEEKLY_COLUMNS='id,user_id,title,season,week,formation,revision,created_at,updated_at';
const fail=code=>({ok:false,error:{code}});
export const canonicalWeeklySnapshot=value=>{const s=weeklySnapshot(value);return s&&s.slots.every(row=>!row.player||internalPlayerId(row.player.id))?s:null;};
export function weeklyGroup(row){
 const season=row.season?.replace(/^(\d{4})\/(\d{2})$/,(_,start,end)=>start+'/'+(Number(start)-Number(start)%100+Number(end)+(Number(end)<Number(start)%100?100:0)));
 return row.week===null?'Hafta atanmamış':(season||'Sezon belirtilmemiş')+' · Hafta '+row.week;
}
// FIX1: optional season field. Accepts 2026/27, 2026/2027 and the shortened 26/27 (stored as 2026/27);
// the second year must follow the first. Returns null when empty and undefined when invalid.
export function weeklySeason(value){
 const text=String(value??'').trim(),m=/^(\d{2}|\d{4})\/(\d{2}|\d{4})$/.exec(text);if(!text)return null;if(!m)return undefined;
 const start=m[1].length===2?2000+Number(m[1]):Number(m[1]),end=Number(m[2]);
 if(m[2].length===4?end!==start+1:end!==(start+1)%100)return undefined;
 return start+'/'+m[2];
}
// All three views use the Auth database, never the local sports-data transport.
export function createWeeklyLineups({client,validatedUser,current}){
 const owner=validatedUser?.id,active=()=>!!owner&&current(),table=()=>client.from('weekly_lineups');
 const blocked=()=>!active()?fail('state_changed'):!client?fail('weekly_unavailable'):null;
 function normalize(row,full=false){
  if(!row||row.user_id!==owner||!projectIdValid(row.id)||!projectTitle(row.title)||!Number.isSafeInteger(row.revision)||row.revision<1)return null;
  if(!(row.week===null||Number.isInteger(row.week)&&row.week>=1&&row.week<=60)||!(row.season===null||/^\d{4}\/\d{2,4}$/.test(row.season))||!Number.isFinite(Date.parse(row.updated_at)))return null;
  const result=Object.fromEntries(WEEKLY_COLUMNS.split(',').filter(k=>k!=='user_id').map(k=>[k,row[k]]));
  if(full){result.snapshot=canonicalWeeklySnapshot(row.snapshot);if(!result.snapshot||result.snapshot.formation!==row.formation)return null;}
  return result;
 }
 function result(r,full=false){if(!active())return fail('state_changed');const record=!r?.error&&normalize(r?.data,full);return record?{ok:true,record}:fail(limitError(r?.error)||'weekly_request_failed');}
 async function get(id){const b=blocked();if(b)return b;if(!projectIdValid(id))return fail('invalid_form');try{return result(await table().select(WEEKLY_COLUMNS+',snapshot').eq('user_id',owner).eq('id',id).maybeSingle(),true);}catch{return fail(active()?'weekly_request_failed':'state_changed');}}
 async function list(offset=0,size=20){
  const b=blocked();if(b)return b;if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(size)||size<1||size>50)return fail('invalid_form');
  try{const r=await table().select(WEEKLY_COLUMNS).eq('user_id',owner).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+size);
   if(!active())return fail('state_changed');if(r.error||!Array.isArray(r.data))return fail('weekly_request_failed');
   const records=r.data.slice(0,size).map(row=>normalize(row));return records.some(r=>!r)?fail('weekly_request_failed'):{ok:true,records,more:r.data.length>size,nextOffset:offset+size};
  }catch{return fail(active()?'weekly_request_failed':'state_changed');}
 }
 async function save({id,revision=null,title,season=null,week=null,snapshot}){
  const b=blocked();if(b)return b;title=projectTitle(title);snapshot=canonicalWeeklySnapshot(snapshot);
  if(!projectIdValid(id)||!title||!snapshot||!(season===null||typeof season==='string'&&/^\d{4}\/\d{2,4}$/.test(season))||!(week===null||Number.isInteger(week)&&week>=1&&week<=60)||!(revision===null||Number.isSafeInteger(revision)&&revision>0))return fail('invalid_form');
  const values={title,season,week,formation:snapshot.formation,snapshot};
  try{
   const q=revision===null?table().insert({id,user_id:owner,...values}):table().update(values).eq('user_id',owner).eq('id',id).eq('revision',revision);
   const r=await q.select(WEEKLY_COLUMNS).maybeSingle();if(!active())return fail('state_changed');
   if(revision===null&&r.error?.code==='23505'){
    const old=await get(id);return old.ok&&old.record.title===title&&old.record.week===week&&old.record.season===season&&JSON.stringify(old.record.snapshot)===JSON.stringify(snapshot)?old:fail('conflict');
   }
   if(!r.error&&!r.data)return fail('conflict');return result(r);
  }catch{return fail(active()?'weekly_request_failed':'state_changed');}
 }
 async function remove({id,revision}){
  const b=blocked();if(b)return b;if(!projectIdValid(id)||!Number.isSafeInteger(revision)||revision<1)return fail('invalid_form');
  try{const r=await table().delete().eq('user_id',owner).eq('id',id).eq('revision',revision).select('id').maybeSingle();
   if(!active())return fail('state_changed');return r.error?fail('weekly_request_failed'):r.data?.id===id?{ok:true}:fail('conflict');
  }catch{return fail(active()?'weekly_request_failed':'state_changed');}
 }
 return Object.freeze({get,list,save,remove});
}
