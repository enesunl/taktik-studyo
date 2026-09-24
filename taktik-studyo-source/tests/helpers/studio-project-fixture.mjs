import {createMatchLayout} from '../../src/lib/match-layout.js';
import {serializeStudioProject} from '../../src/lib/studio-project-snapshot.js';
import {drawingObject,DRAWING_TYPES} from '../../src/lib/tactical-drawings.js';
import {detail} from './match-detail-fixture.mjs';
export const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
export const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',copyId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
export function snapshot(mode='match'){
 const model=createMatchLayout(detail());
 return serializeStudioProject({source:{mode,matchId:mode==='match'?'215997':null,week:mode==='match'?6:null},model,
  working:['home','away'].flatMap(side=>model[side].players.map(p=>({slotKey:p.key,personKey:p.key,x:p.initialX,y:p.initialY}))),
  drawings:DRAWING_TYPES.map((type,i)=>drawingObject({id:'draw-'+(i+1),type,color:'yellow',width:'medium',start:{x:.1,y:.2},end:{x:.5,y:.6},points:[{x:.1,y:.2},{x:.5,y:.6}]})),
  pitch:{color:'#285b3b',width:1200,height:650}});
}
export const row=(extra={})=>({id,user_id:owner,title:'Taktik çalışma',studio_mode:'match',match_id:'215997',match_week:6,snapshot_version:1,revision:1,created_at:'2026-09-23T12:00:00Z',updated_at:'2026-09-23T12:00:00Z',snapshot:snapshot(),...extra});
export function queryMock(responses){
 const calls=[];const client={from(table){const steps=[['from',table]];calls.push(steps);const q={};
  for(const name of ['select','eq','order','range','insert','update','delete','maybeSingle'])q[name]=(...args)=>{steps.push([name,...args]);return q;};
  q.then=(resolve,reject)=>Promise.resolve(responses.shift()).then(resolve,reject);return q;
 }};return{client,calls};
}
