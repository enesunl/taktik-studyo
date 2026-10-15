import {internalPlayerId} from './catalogue-identity.js';
import {limitError} from './studio-project-snapshot.js';
export const PLAYER_ROLES=Object.freeze(['KL','STP','SLB','SĞB','ÖL','MO','OO','SLK','SĞK','SF']);
const columns='user_id,player_key,name,number,role';
export const overrideKeyValid=key=>typeof key==='string'&&(/^(?:local:[a-zA-Z0-9_-]{1,80}|bsd:[1-9][0-9]{0,15})$/.test(key)||key.startsWith('internal:')&&internalPlayerId(key.slice(9)));
export function playerKey(id,source='local'){
 const key=(internalPlayerId(id)?'internal':source)+':'+id;return overrideKeyValid(key)?key:null;
}
export function matchPlayerKey(player,team){
 return playerKey(player.playerId,team?.lineupKind==='probable-local'||player.key?.startsWith('local:')?'local':'bsd');
}
export function normalizePlayerOverride(value){
 if(!value||typeof value.name!=='string')return null;
 const name=value.name.trim(),number=value.number,role=value.role;
 if(!name||[...name].length>24||/[\u0000-\u001f\u007f-\u009f]/.test(name)||!(number===null||Number.isInteger(number)&&number>=1&&number<=99)||!PLAYER_ROLES.includes(role))return null;
 return {name,number,role};
}
const group=role=>role==='KL'?'G':['STP','SLB','SĞB'].includes(role)?'D':['SLK','SĞK','SF'].includes(role)?'F':'M';
export function mergePlayerOverride(base,override){
 if(!override)return {...base};
 const result={...base,...override};
 if('position' in base){const g=group(override.role);result.position=['G','D','M','F'].includes(base.position)?g:({G:'goalkeeper',D:'defender',M:'midfielder',F:'forward'})[g];}
 if('roles' in base)result.roles=[override.role];
 return result;
}
const fail=code=>({ok:false,error:{code}});
// One store per validated route generation. No global account cache or token exposure.
export function createPlayerOverrides({client,validatedUser,current,internalOnly=false}){
 const owner=validatedUser?.id,cache=new Map(),listeners=new Set(),writing=new Set();let stopped=false,loaded=false,pending=null;
 const active=()=>!stopped&&!!owner&&current();
 const effectiveValue=key=>active()&&(!internalOnly||key?.startsWith('internal:'))?cache.get(key):null;
 const notify=key=>{if(active())for(const fn of listeners){try{fn(key);}catch{/* A view cannot turn a completed write into a failed save. */}}};
 function load(){
  if(!active())return Promise.resolve(fail('state_changed'));
  if(loaded)return Promise.resolve({ok:true});if(pending)return pending;
  pending=(async()=>{
   const next=new Map();let after='';
   try{
    if(!client)return fail('overrides_unavailable');
    for(let page=0;page<20;page++){
     let q=client.from('player_overrides').select(columns).eq('user_id',owner).order('player_key').limit(500);
     if(internalOnly)q=q.like('player_key','internal:%');
     if(after)q=q.gt('player_key',after);
     const r=await q;if(!active())return fail('state_changed');
     if(r.error||!Array.isArray(r.data))return fail('overrides_unavailable');
     for(const row of r.data){const value=normalizePlayerOverride(row);if(row.user_id!==owner||!overrideKeyValid(row.player_key)||!value)return fail('overrides_unavailable');next.set(row.player_key,value);}
     if(r.data.length<500){if(!active())return fail('state_changed');cache.clear();for(const [key,value] of next)cache.set(key,value);loaded=true;notify(null);return {ok:true};}
     after=r.data.at(-1).player_key;
    }
    return fail('overrides_unavailable');
   }catch{return fail(active()?'overrides_unavailable':'state_changed');}
  })().finally(()=>{pending=null;});return pending;
 }
 async function write(key,value,remove=false){
  if(!active())return fail('state_changed');
  const normalized=remove?null:normalizePlayerOverride(value);
  if(!overrideKeyValid(key)||(internalOnly&&!key.startsWith('internal:'))||!remove&&!normalized)return fail('invalid_player');
  if(writing.has(key))return fail('save_in_progress');writing.add(key);
  try{
   const ready=await load();if(!active())return fail('state_changed');if(!ready.ok)return ready;

   let r;
   if(remove)r=await client.from('player_overrides').delete().eq('user_id',owner).eq('player_key',key).select('player_key');
   else{
    // INSERT-first avoids granting UPDATE on ownership/key columns just for upsert.
    r=await client.from('player_overrides').insert({user_id:owner,player_key:key,...normalized}).select(columns).maybeSingle();
    if(!active())return fail('state_changed');
    if(r.error?.code==='23505')r=await client.from('player_overrides').update(normalized).eq('user_id',owner).eq('player_key',key).select(columns).maybeSingle();
   }
   if(!active())return fail('state_changed');
   if(r.error||!remove&&(!r.data||r.data.user_id!==owner||r.data.player_key!==key||!normalizePlayerOverride(r.data)))return fail(limitError(r.error)||'override_save_failed');
   if(remove)cache.delete(key);else cache.set(key,normalizePlayerOverride(r.data));notify(key);return {ok:true};
  }catch{return fail(active()?'override_save_failed':'state_changed');}finally{writing.delete(key);}
 }
 return Object.freeze({load,ready:()=>active()&&loaded,key:playerKey,
  effective:(key,base)=>mergePlayerOverride(base,effectiveValue(key)),has:key=>!!effectiveValue(key),
  save:(key,value)=>write(key,value),reset:key=>write(key,null,true),
  subscribe(fn){if(!active())return()=>{};listeners.add(fn);return()=>listeners.delete(fn);},
  dispose(){stopped=true;cache.clear();listeners.clear();},
 });
}
