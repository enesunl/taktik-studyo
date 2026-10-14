// Footballer identity is separate from the eleven formation slots. No provider calls.
export const WEEKLY_FORMATIONS=Object.freeze({
 '4-3-3':[['LB','CB','CB','RB'],['CM','CM','CM'],['LW','ST','RW']],
 '4-2-3-1':[['LB','CB','CB','RB'],['CM','CM'],['LW','AM','RW'],['ST']],
 '4-4-2':[['LB','CB','CB','RB'],['LM','CM','CM','RM'],['ST','ST']],
 '3-5-2':[['CB','CB','CB'],['LM','CM','CM','CM','RM'],['ST','ST']],
 '3-4-3':[['CB','CB','CB'],['LM','CM','CM','RM'],['LW','ST','RW']],
 '5-3-2':[['LB','CB','CB','CB','RB'],['CM','CM','CM'],['ST','ST']],
 '4-1-4-1':[['LB','CB','CB','RB'],['DM'],['LM','CM','CM','RM'],['ST']],
 '4-4-1-1':[['LB','CB','CB','RB'],['LM','CM','CM','RM'],['AM'],['ST']],
 '4-1-2-1-2':[['LB','CB','CB','RB'],['DM'],['CM','CM'],['AM'],['ST','ST']],
 '4-3-1-2':[['LB','CB','CB','RB'],['CM','DM','CM'],['AM'],['ST','ST']],
 '4-2-2-2':[['LB','CB','CB','RB'],['DM','DM'],['AM','AM'],['ST','ST']],
 '4-2-4':[['LB','CB','CB','RB'],['CM','CM'],['LW','ST','ST','RW']],
 '4-5-1':[['LB','CB','CB','RB'],['LM','CM','DM','CM','RM'],['ST']],
 '3-4-2-1':[['CB','CB','CB'],['LM','CM','CM','RM'],['AM','AM'],['ST']],
 '3-4-1-2':[['CB','CB','CB'],['LM','CM','CM','RM'],['AM'],['ST','ST']],
 '3-3-3-1':[['CB','CB','CB'],['CM','DM','CM'],['LW','AM','RW'],['ST']],
 '3-3-1-3':[['CB','CB','CB'],['CM','DM','CM'],['AM'],['LW','ST','RW']],
 '3-2-4-1':[['CB','CB','CB'],['DM','DM'],['LM','AM','AM','RM'],['ST']],
 '3-6-1':[['CB','CB','CB'],['LM','CM','DM','DM','CM','RM'],['ST']],
 '5-4-1':[['LB','CB','CB','CB','RB'],['LM','CM','CM','RM'],['ST']],
 '5-2-3':[['LB','CB','CB','CB','RB'],['CM','CM'],['LW','ST','RW']],
 '5-2-1-2':[['LB','CB','CB','CB','RB'],['CM','CM'],['AM'],['ST','ST']],
 '5-2-2-1':[['LB','CB','CB','CB','RB'],['DM','DM'],['AM','AM'],['ST']],
 '2-3-5':[['CB','CB'],['CM','DM','CM'],['LW','ST','ST','ST','RW']],
});
export function weeklySlots(formation){
 if(!Object.hasOwn(WEEKLY_FORMATIONS,formation))return null;const rows=WEEKLY_FORMATIONS[formation];
 const slots=[{slotId:0,role:'GK',x:50,y:89,player:null}];
 rows.forEach((roles,row)=>roles.forEach((role,i)=>slots.push({slotId:slots.length,role,x:roles.length===1?50:roles.length===2?36+i*28:14+i*72/(roles.length-1),y:69-row*52/(rows.length-1),player:null})));
 return slots;
}
export const emptyWeeklyXI=()=>({version:2,formation:'4-3-3',slots:weeklySlots('4-3-3')});
export const WEEKLY_BOUNDS=Object.freeze({minX:9,maxX:91,minY:9,maxY:92});
const text=(v,max)=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function weeklyPlayer(p){
 if(!p||!id(p.id)||!id(p.teamId)||!text(p.name,100)||!text(p.teamName,80)||!['G','D','M','F'].includes(p.positionGroup)||!(p.number===null||Number.isInteger(p.number)&&p.number>=1&&p.number<=99)||!/^#[0-9a-f]{6}$/i.test(p.color)||!/^#[0-9a-f]{6}$/i.test(p.color2))return null;
 const specificPosition=p.specificPosition??null;
 if(specificPosition!==null&&!['GK','CB','LB','RB','DM','CM','AM','LW','RW','ST','LM','RM','DEF','MID','FWD'].includes(specificPosition))return null;
 return {id:p.id,teamId:p.teamId,name:p.name,teamName:p.teamName,number:p.number,positionGroup:p.positionGroup,specificPosition,color:p.color,color2:p.color2};
}
export function weeklySnapshot(value){
 if(![1,2].includes(value?.version)||!Object.hasOwn(WEEKLY_FORMATIONS,value.formation)||!Array.isArray(value.slots)||value.slots.length!==11)return null;
 const slots=weeklySlots(value.formation),seen=new Set();
 for(let i=0;i<11;i++){
  const row=value.slots[i],slot=slots[i];
  if(!row||row.slotId!==slot.slotId||row.role!==slot.role||!Number.isFinite(row.x)||!Number.isFinite(row.y)||row.x<9||row.x>91||row.y<9||row.y>92)return null;
  // V1 had fixed geometry only. Retain its players and adopt the new spacing;
  // V2 retains the user's custom positions, including across viewport sizes.
  if(value.version===2){slot.x=row.x;slot.y=row.y;}
  if(row.player!==null){const player=weeklyPlayer(row.player);if(!player||seen.has(player.id))return null;seen.add(player.id);slot.player=player;}
 }
 return {version:2,formation:value.formation,slots};
}
export function moveWeeklySlot(state,slotId,x,y){
 if(!Number.isInteger(slotId)||!state.slots[slotId]?.player||!Number.isFinite(x)||!Number.isFinite(y))return state;
 const {minX,maxX,minY,maxY}=WEEKLY_BOUNDS;
 return {...state,slots:state.slots.map(s=>s.slotId===slotId?{...s,x:Math.min(maxX,Math.max(minX,x)),y:Math.min(maxY,Math.max(minY,y))}:s)};
}
export function changeWeeklyFormation(state,formation){
 const slots=weeklySlots(formation);if(!slots)return state;
 return {...state,formation,slots:slots.map((slot,i)=>({...slot,player:state.slots[i].player}))};
}
export function pickWeeklyPlayer(state,slotId,player){
 const selected=player===null?null:weeklyPlayer(player);
 if(!Number.isInteger(slotId)||slotId<0||slotId>10||player!==null&&!selected||selected&&state.slots.some(s=>s.slotId!==slotId&&s.player?.id===selected.id))return null;
 return {...state,slots:state.slots.map(s=>s.slotId===slotId?{...s,player:selected}:s)};
}
export function weeklyCatalogue(model){
 const teams=new Map((model?.teams||[]).filter(t=>t.catalogueActive!==false).map(t=>[t.id,t]));
 const seen=new Set();return (model?.players||[]).filter(p=>p.catalogueActive!==false).flatMap(p=>{
  const team=teams.get(p.teamId);if(!team||seen.has(p.id))return [];
  const row=weeklyPlayer({...p,teamName:team.name,color:team.color,color2:team.color2});if(!row)return [];seen.add(p.id);return [row];
 });
}
const fold=value=>String(value).toLocaleLowerCase('tr').normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i');
export const searchWeeklyPlayers=(players,query)=>{const terms=fold(query).trim().split(/\s+/).filter(Boolean);return players.filter(p=>terms.every(t=>fold(p.name+' '+p.teamName).includes(t)));};

// One explicitly saved XI per account and catalogue source, on this browser only.
export function createWeeklyStore({userId,source,storage,current,now=Date.now}){
 const key=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId||'')&&['legacy','canonical'].includes(source)?`taktik:weekly-xi:${userId}:${source}:v1`:null;
 return {
  source,
  read(){
   if(!key||!current())return {ok:false};
   try{
    const raw=storage.getItem(key);if(raw===null)return {ok:true,state:null};if(raw.length>50000)return {ok:false};
    const value=JSON.parse(raw),state=weeklySnapshot(value);
    if(!state)return {ok:false};
    const timestamp=typeof value.savedAt==='string'?Date.parse(value.savedAt):NaN;
    return {ok:true,state,entry:{id:source,updatedAt:Number.isFinite(timestamp)?new Date(timestamp).toISOString():null}};
   }catch{return {ok:false};}
  },
  write(value){if(!key||!current())return false;const state=weeklySnapshot(value);if(!state)return false;try{storage.setItem(key,JSON.stringify({...state,savedAt:new Date(now()).toISOString()}));return true;}catch{return false;}},
 };
}
