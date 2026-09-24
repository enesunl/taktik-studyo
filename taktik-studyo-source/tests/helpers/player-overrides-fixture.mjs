import assert from 'node:assert/strict';
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
// PostgREST transport double, not an RLS substitute. Database tests use real SQL below.
export function overrideClient(initial=[]){
 const rows=new Map(initial.map(r=>[r.user_id+'/'+r.player_key,{...r}])),calls=[];
 const client={rows,calls,error:null,pause:null,from(table){
  assert.equal(table,'player_overrides');let action='select',value,one=false,max=500;const filters=[];
  const q={select(){return q;},order(){return q;},limit(n){max=n;return q;},eq(k,v){filters.push([k,v,false]);return q;},gt(k,v){filters.push([k,v,true]);return q;},
   insert(v){action='insert';value=v;return q;},update(v){action='update';value=v;return q;},delete(){action='delete';return q;},maybeSingle(){one=true;return q;},
   async then(resolve,reject){try{calls.push({action,value,filters});if(client.pause)await client.pause;if(client.error)return resolve({error:client.error});
    let found=[...rows.values()].filter(r=>filters.every(([k,v,gt])=>gt?r[k]>v:r[k]===v)).sort((a,b)=>a.player_key.localeCompare(b.player_key)).slice(0,max);
    if(action==='insert'){const key=value.user_id+'/'+value.player_key;if(rows.has(key))return resolve({error:{code:'23505'}});rows.set(key,{...value});found=[rows.get(key)];}
    if(action==='update')found.forEach(r=>Object.assign(r,value));
    if(action==='delete')found.forEach(r=>rows.delete(r.user_id+'/'+r.player_key));
    resolve({data:one?found[0]??null:found.map(r=>({...r})),error:null});
   }catch(e){reject(e);}}
  };return q;
 }};return client;
}
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
