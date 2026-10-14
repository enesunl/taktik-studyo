// Local Auth + PostgREST smoke test. Credentials stay in memory; owned fixtures only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {readLocalStatus,localConfigFromStatus} from './local-supabase.mjs';
import {createWeeklyLineups} from '../src/lib/weekly-lineups.js';
import {emptyWeeklyXI} from '../src/lib/weekly-xi.js';
const status=await readLocalStatus(),config=localConfigFromStatus(status);
if(!['http://127.0.0.1:54321','http://localhost:54321'].includes(config.url))throw Error('Refusing non-Taktik local API');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(config.url,status.SERVICE_ROLE_KEY,options),users=[],clients=[];
try{
 for(let i=0;i<2;i++){
  const email='ux4-'+randomUUID()+'@example.invalid',password=randomUUID()+'Aa1!';
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert(!created.error&&created.data.user,'Local test account creation failed');users.push(created.data.user.id);
  const client=createClient(config.url,config.key,options);clients.push(client);
  const signed=await client.auth.signInWithPassword({email,password});assert(!signed.error,'Local sign-in failed');
 }
 const a=createWeeklyLineups({client:clients[0],validatedUser:{id:users[0]},current:()=>true}),b=createWeeklyLineups({client:clients[1],validatedUser:{id:users[1]},current:()=>true});
 const id=randomUUID(),second=randomUUID(),snapshot=emptyWeeklyXI();
 const made=await a.save({id,title:'UX4 local',season:'2026/2027',week:8,snapshot});assert.equal(made.ok,true,'Authenticated create');
 assert.equal((await a.save({id:second,title:'Same week second XI',season:'2026/2027',week:8,snapshot})).ok,true);
 assert.equal((await a.list()).records.length,2);assert.deepEqual((await a.get(id)).record.snapshot,snapshot);
 const edited=await a.save({id,revision:made.record.revision,title:'Renamed',season:null,week:null,snapshot});assert.equal(edited.ok,true);assert.equal(edited.record.revision,2);assert.equal(edited.record.title,'Renamed');
 assert.equal((await b.list()).records.length,0);assert.equal((await b.get(id)).ok,false);
 assert.equal((await b.save({id,revision:2,title:'Forbidden',snapshot})).ok,false);
 const anon=createClient(config.url,config.key,options);assert((await anon.from('weekly_lineups').select('id')).error,'Anonymous access must fail');
 const removed=await clients[0].from('weekly_lineups').delete().eq('id',id).select('id');assert(!removed.error&&removed.data.length===1);assert.equal((await a.list()).records.length,1);
 console.log('PASS: local Auth + real PostgREST create/list/reopen/update/rename/delete, multiple same-week records, B isolation and anon denial.');
}finally{
 for(const client of clients)await client.auth.signOut({scope:'local'});
 for(const id of users){const r=await admin.auth.admin.deleteUser(id);if(r.error)throw Error('Local test account cleanup failed');}
 console.log('CLEANUP: created local fixture accounts removed; their remaining Weekly XI rows cascade-deleted.');
}
