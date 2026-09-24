import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerOverrides,normalizePlayerOverride,playerKey,matchPlayerKey,mergePlayerOverride} from '../src/lib/player-overrides.js';
import {overrideClient,owner,other,deferred} from './helpers/player-overrides-fixture.mjs';
const value={name:'Custom player',number:10,role:'SF'},base={id:'123',name:'Original',number:8,position:'M',roles:['MO'],x:50,y:70};
const service=(client,opts={})=>createPlayerOverrides({client,validatedUser:{id:owner},current:()=>true,...opts});
test('stable namespaced identities and bounded editable fields preserve tactical state',()=>{
 assert.equal(playerKey('123'),'local:123');assert.equal(playerKey(123,'bsd'),'bsd:123');assert.notEqual(playerKey(123),playerKey(123,'bsd'));
 assert.equal(matchPlayerKey({playerId:123,key:'987:home:7:123'},{lineupKind:'probable-local'}),'local:123');
 assert.equal(matchPlayerKey({playerId:123,key:'local:home:7:123'}),'local:123');
 assert.equal(matchPlayerKey({playerId:123,key:'987:home:7:123'}),'bsd:123');
 assert.equal(playerKey('x:y'),null);assert.equal(playerKey(0,'bsd'),null);
 assert.deepEqual(normalizePlayerOverride({...value,name:'  Custom player ',x:20,user_id:other}),value);
 for(const bad of [{name:''},{name:'x'.repeat(25)},{name:'a\nb'},{number:0},{number:100},{number:'10'},{role:'evil'}])assert.equal(normalizePlayerOverride({...value,...bad}),null);
 const effective=mergePlayerOverride(base,value);assert.equal(effective.position,'F');assert.deepEqual(effective.roles,['SF']);assert.equal(effective.x,50);assert.equal(base.name,'Original');
 assert.equal(mergePlayerOverride({...base,position:'midfielder'},value).position,'forward');
});
test('bulk cache, create/update/reset, fresh session restoration and B isolation',async()=>{
 const client=overrideClient(),a=service(client);let notifications=0;a.subscribe(()=>notifications++);
 await Promise.all([a.load(),a.load()]);for(let i=0;i<50;i++)a.effective('local:'+i,base);await a.load();assert.equal(client.calls.length,1);
 assert.equal((await a.save('local:123',value)).ok,true);assert.equal(a.effective('local:123',base).name,value.name);
 assert.deepEqual(Object.keys(client.calls.at(-1).value).sort(),['user_id','player_key','name','number','role'].sort());
 assert.equal((await a.save('local:123',{...value,number:11})).ok,true);assert.deepEqual(Object.keys(client.calls.at(-1).value).sort(),['name','number','role']);
 const reload=service(client),b=service(client,{validatedUser:{id:other}});await reload.load();await b.load();assert.equal(reload.effective('local:123',base).number,11);assert.equal(b.effective('local:123',base).name,'Original');
 assert.equal(reload.effective('bsd:123',base).name,'Original');assert.equal((await a.reset('local:123')).ok,true);assert.equal(a.effective('local:123',base).name,'Original');assert.ok(notifications>=4);
 const afterReset=service(client);await afterReset.load();assert.equal(afterReset.has('local:123'),false);
 a.dispose();assert.equal(a.has('local:123'),false);assert.equal((await a.save('local:123',value)).error.code,'state_changed');
});
test('bulk keyset pagination loads >500 overrides without per-player requests',async()=>{
 const client=overrideClient(Array.from({length:501},(_,i)=>({user_id:owner,player_key:'bsd:'+(1000+i),...value}))),a=service(client);
 assert.equal((await a.load()).ok,true);assert.equal(client.calls.length,2);assert.ok(a.has('bsd:1500'));assert.deepEqual(client.calls[1].filters.at(-1),['player_key','bsd:1499',true]);
});
test('save/load failures do not publish fake durable edits; retry and listener errors are controlled',async()=>{
 const client=overrideClient(),a=service(client);await a.load();client.error={message:'private server detail'};
 assert.deepEqual(await a.save('local:123',value),{ok:false,error:{code:'override_save_failed'}});assert.equal(a.has('local:123'),false);
 client.error=null;a.subscribe(()=>{throw Error('view failure');});assert.equal((await a.save('local:123',value)).ok,true);
 client.error={};assert.equal((await a.reset('local:123')).ok,false);assert.equal(a.has('local:123'),true);
 const failed=service(client);assert.equal((await failed.load()).ok,false);client.error=null;assert.equal((await failed.load()).ok,true);
});
test('account switch cancels pending result publication and duplicate submissions',async()=>{
 let current=true;const client=overrideClient(),a=service(client,{current:()=>current});await a.load();let notices=0;a.subscribe(()=>notices++);
 const d=deferred();client.pause=d.promise;const save=a.save('local:123',value);assert.equal((await a.save('local:123',value)).error.code,'save_in_progress');
 current=false;d.resolve();assert.equal((await save).error.code,'state_changed');assert.equal(notices,0);assert.equal(a.effective('local:123',base).name,'Original');
 const anon=service(client,{validatedUser:null});const count=client.calls.length;assert.equal((await anon.load()).ok,false);assert.equal(client.calls.length,count);
});
