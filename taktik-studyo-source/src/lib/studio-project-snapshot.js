import {isMatchId,requestedMatchId} from './match-id.js';
import {parseFormation} from './match-layout.js';
import {normalizeDrawingObjects} from './tactical-drawings.js';
import {validPitchColor} from './pitch-preference.js';
import {SIZE_BOUNDS} from './studio-preferences.js';
export const SNAPSHOT_VERSION=1,PROJECT_BYTES=3*1024*1024;
export const projectIdValid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
export function projectTitle(v){return typeof v==='string'&&text(v.trim(),240)&&[...v.trim()].length<=120?v.trim():null;}
const coord=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const kinds=['confirmed','probable-provider','probable-recent-match','probable-local'];
export function studioRoute(search=''){
  const p=new URLSearchParams(search);
  if(p.has('project'))return p.getAll('project').length===1&&projectIdValid(p.get('project'))?{mode:'project',id:p.get('project')}:{mode:'invalid_project'};
  if(p.has('id'))return requestedMatchId(search)?{mode:'match',id:requestedMatchId(search)}:{mode:'invalid_match'};
  return {mode:'free'};
}
// Fail closed, then copy only explicit v1 fields. Never render a database object directly.
export function normalizeStudioProjectSnapshot(input){
  try{
    if(!input||new TextEncoder().encode(JSON.stringify(input)).length>PROJECT_BYTES||input.version!==1)return null;
    const s=input.source;if(!s||!['free','match'].includes(s.mode))return null;
    if(s.mode==='free'&&(s.matchId!==null||s.week!==null)||s.mode==='match'&&(!isMatchId(s.matchId)||s.week!==null&&(!Number.isInteger(s.week)||s.week<1||s.week>34)))return null;
    const teams={},people=new Map(),slots=new Map();
    for(const side of ['home','away']){
      const t=input.teams?.[side];if(t===null){teams[side]=null;continue;}
      if(!t||!text(t.teamId,160)||!text(t.name,120)||!validPitchColor(t.color)||!validPitchColor(t.color2)
        ||t.formation!==null&&!parseFormation(t.formation)||!kinds.includes(t.lineupKind)
        ||!Array.isArray(t.players)||t.players.length!==11||!Array.isArray(t.bench)||t.bench.length>40)return null;
      const copy=(p,onPitch)=>{
        if(!p||!text(p.key,220)||!text(p.playerId,100)||!text(p.name,160)||!['goalkeeper','defender','midfielder','forward','unknown'].includes(p.position)
          ||!(p.number===null||Number.isInteger(p.number)&&p.number>=0&&p.number<=999)||!Number.isInteger(p.goals)||p.goals<0||p.goals>100||people.has(p.key))throw Error();
        if([...people.values()].some(q=>q.side===side&&q.id===p.playerId))throw Error();
        people.set(p.key,{side,id:p.playerId});
        const row={key:p.key,playerId:p.playerId,name:p.name,number:p.number,position:p.position,goals:s.mode==='free'?0:p.goals};
        if(onPitch){if(!coord(p.initialX)||!coord(p.initialY))throw Error();slots.set(p.key,side);Object.assign(row,{initialX:p.initialX,initialY:p.initialY});}
        return row;
      };
      teams[side]={teamId:t.teamId,name:t.name,color:t.color.toLowerCase(),color2:t.color2.toLowerCase(),formation:t.formation,lineupKind:t.lineupKind,
        players:t.players.map(p=>copy(p,true)),bench:t.bench.map(p=>copy(p,false))};
      if(t.players.filter(p=>p.position==='goalkeeper').length!==1)return null;
    }
    if(s.mode==='match'&&(!teams.home||!teams.away))return null;
    if(teams.home&&teams.away&&teams.home.teamId===teams.away.teamId)return null;
    if(!Array.isArray(input.working)||input.working.length!==slots.size)return null;
    const usedSlots=new Set(),usedPeople=new Set(),working=[];
    for(const p of input.working){
      if(!slots.has(p?.slotKey)||people.get(p.personKey)?.side!==slots.get(p.slotKey)||!coord(p.x)||!coord(p.y)||usedSlots.has(p.slotKey)||usedPeople.has(p.personKey))return null;
      usedSlots.add(p.slotKey);usedPeople.add(p.personKey);working.push({slotKey:p.slotKey,personKey:p.personKey,x:p.x,y:p.y});
    }
    working.sort((a,b)=>a.slotKey.localeCompare(b.slotKey,'en'));
    const drawings=normalizeDrawingObjects(input.drawings),p=input.pitch;
    if(!drawings||!validPitchColor(p?.color)||!Object.entries(SIZE_BOUNDS).every(([key,[min,max]])=>Number.isInteger(p[key])&&p[key]>=min&&p[key]<=max))return null;
    return {version:1,source:{mode:s.mode,matchId:s.matchId,week:s.week},teams,working,drawings,pitch:{color:p.color.toLowerCase(),width:p.width,height:p.height}};
  }catch{return null;}
}
export function serializeStudioProject({source,model,working,drawings,pitch}){
  const teams=Object.fromEntries(['home','away'].map(side=>{const t=model[side];return [side,t?.players?.length?{...t,players:t.players.map(p=>({...p,initialX:p.initialX/100,initialY:p.initialY/100}))}:null];}));
  return normalizeStudioProjectSnapshot({version:1,source,teams,working:working.map(p=>({...p,x:p.x/100,y:p.y/100})),drawings,pitch});
}
export function projectBoardState(snapshot){
  const s=normalizeStudioProjectSnapshot(snapshot);if(!s)return null;
  const empty={teamId:null,name:'',color:'#285b3b',color2:'#ffffff',formation:null,players:[],bench:[]};
  return {model:{matchId:s.source.matchId,...Object.fromEntries(['home','away'].map(side=>[side,s.teams[side]?{...s.teams[side],players:s.teams[side].players.map(p=>({...p,initialX:p.initialX*100,initialY:p.initialY*100}))}:{...empty}]))},
    working:s.working.map(p=>({...p,x:p.x*100,y:p.y*100})),drawings:s.drawings,pitch:s.pitch};
}
