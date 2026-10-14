import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,writeDraft} from '../src/lib/drafts.js';
import {shareValid,stateValid,toShare,SHARE_BYTES} from '../src/lib/validation.js';
import {createHandler} from '../supabase/functions/lineups/handler.js';
import {createCatalogue} from '../src/lib/catalogue.js';
export const fixture=()=>({team:{name:'Galatasaray',short:'GS',color:'#a51935',color2:'#efb62a'},formation:'4-3-3',customized:true,players:Array.from({length:11},(_,id)=>({id,name:'Oyuncu '+id,x:50,y:10+id*7,number:id+1,role:id===0?'KL':'MO',renamed:false,athleteId:String(id+1),photo:'faces/'+(id+1)+'.png'})),drawings:[{tool:'pen',color:'#ff0000',width:4,points:[{x:.1,y:.2},{x:.9,y:.8}]}]});
test('drafts round trip, independent keys, corrupt and unavailable storage',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  const state=fixture();assert.ok(stateValid(state));assert.ok(writeDraft(storage,'main',state));assert.deepEqual(readDraft(storage,'main'),state);assert.equal(readDraft(storage,'left'),null);
  const changed=fixture();changed.players[0].x=70;writeDraft(storage,'left',changed);assert.equal(readDraft(storage,'main').players[0].x,50);
  map.set('main','{bad');assert.equal(readDraft(storage,'main'),null);
  assert.equal(writeDraft({setItem(){throw Error('quota')}},'main',state),false);
  const bad=fixture();bad.players[0].photo='javascript:alert(1)';assert.equal(writeDraft(storage,'bad',bad),false);
  map.set('main',JSON.stringify({version:999,state}));assert.equal(readDraft(storage,'main'),null);
});
test('strict share validation rejects unknown fields, bad types, duplicates, coordinates and excess drawing',()=>{
  assert.ok(shareValid(toShare(fixture())));
  const variants=[p=>p.extra=true,p=>p.formation='99-1',p=>p.lineup_data.players.pop(),p=>p.lineup_data.players[0].x=Infinity,p=>p.lineup_data.players[1].athleteId='1',p=>p.lineup_data.players[1].name='x'.repeat(101),p=>p.drawing_data[0].points[0].x=2,p=>p.drawing_data[0].points=Array(2001).fill({x:0,y:0}),p=>p.lineup_data.players[0].photo='https://tracker.test/pixel',p=>p.lineup_data.customized='true',p=>p.lineup_data.team.color='red',p=>p.team_name='different'];
  for(const mutate of variants){const p=toShare(fixture());mutate(p);assert.equal(shareValid(p),false);}
});
test('Edge handler validates bytes, types, origins, methods and public app key before writing',async()=>{
  let writes=0,limited=false;
  const id='01234567-89ab-4cde-8fab-0123456789ab';
  const handler=createHandler({client:{rpc:async(name,args)=>{assert.equal(args.owner,'11111111-1111-4111-8111-111111111111');writes++;return {data:limited?null:id,error:null};}},origins:['https://app.test'],publicKey:'sb_publishable_test',rateSalt:'server-test-salt',verifyBot:async()=>true,sharingReady:true,
    authenticate:async token=>token==='jwt'?{id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-10-14T00:00:00Z'}:token==='unconfirmed'?{id:'22222222-2222-4222-8222-222222222222',email_confirmed_at:null}:null});
  const send=(body,headers={},method='POST')=>handler(new Request('https://db.test/functions/v1/lineups',{method,headers:{origin:'https://app.test',apikey:'sb_publishable_test','content-type':'application/json',authorization:'Bearer jwt',...headers},body:method==='POST'?body:undefined}));
  assert.equal((await send(JSON.stringify(toShare(fixture())))).status,201);assert.equal(writes,1);
  assert.equal((await send('{bad')).status,400);
  assert.equal((await send(JSON.stringify({...toShare(fixture()),admin:true}))).status,400);
  assert.equal((await send(' '.repeat(SHARE_BYTES+1))).status,413);
  assert.equal((await send('{}',{'content-length':String(SHARE_BYTES+1)})).status,413);
  assert.equal((await send('{}',{'content-type':'text/plain'})).status,415);
  assert.equal((await send('{}',{origin:'https://evil.test'})).status,403);
  assert.equal((await send('{}',{apikey:'wrong'})).status,401);
  assert.equal((await send(null,{},'DELETE')).status,405);assert.equal(writes,1);
  for(const authorization of ['','Bearer','Bearer bad','Bearer unconfirmed','Basic jwt'])assert.equal((await send(JSON.stringify(toShare(fixture())),{authorization})).status,401,authorization);
  assert.equal(writes,1);
  limited=true;assert.equal((await send(JSON.stringify(toShare(fixture())))).status,429);
});
test('catalogue maps existing models and caches concurrent calls without N+1',async()=>{
  let calls=0;
  const team={id:'gs',name:'Galatasaray',short_name:'GS',color_primary:'#a51935',color_secondary:'#efb62a',logo_url:null,source_url:'https://www.fotmob.com',sort_order:0};
  const players=fixture().players.map(p=>({id:p.athleteId,team_id:'gs',name:p.name,position:'M',shirt_number:p.number,photo_url:p.photo,roles:['MO'],selection_rank:1}));
  const client={from(table){calls++;const result={data:table==='teams'?[team]:players,error:null};return {select(){return this},in(){return this},order(){return this},limit(){return this},then(fn){return Promise.resolve(result).then(fn)}}}};
  const repo=createCatalogue(client);const [a,b]=await Promise.all([repo.load(),repo.load()]);assert.equal(a,b);assert.equal(calls,2);assert.equal(a.rosters.Galatasaray.players.length,11);await repo.load();assert.equal(calls,2);
});
