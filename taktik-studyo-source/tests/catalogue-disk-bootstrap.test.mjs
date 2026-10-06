import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {openCatalogueDatabase} from '../scripts/catalogue/local-database.mjs';
import {createLocalCatalogueService} from '../scripts/catalogue/local-service.mjs';
import {createLocalCatalogueClient} from '../src/lib/catalogue-local-client.js';
import {createCanonicalCatalogue} from '../src/lib/catalogue-canonical.js';

async function temporaryDirectory(){
 const base=resolve(tmpdir()),root=await mkdtemp(join(base,'taktik-catalogue-bootstrap-'));
 return {root,async cleanup(){
  const child=relative(base,resolve(root));
  assert(child&&!child.startsWith('..')&&!isAbsolute(child)&&child.startsWith('taktik-catalogue-bootstrap-'));
  await rm(root,{recursive:true,force:true});
 }};
}

test('disk catalogue bootstraps absent parents, existing parent, and reopens without resetting data',async()=>{
 const temp=await temporaryDirectory();let local;
 try{
  const parent=join(temp.root,'.local'),dataDir=join(parent,'catalogue-d4');
  await assert.rejects(stat(parent),{code:'ENOENT'});
  local=await openCatalogueDatabase(dataDir);
  assert((await stat(dataDir)).isDirectory());assert.equal(local.state.teams.filter(t=>t.catalogue_active).length,18);
  const ids=local.state.players.map(p=>p.id).sort();
  await local.db.exec("create table bootstrap_sentinel(value text);insert into bootstrap_sentinel values('preserved')");
  await local.db.close();local=null;
  local=await openCatalogueDatabase(dataDir);
  assert.deepEqual(local.state.players.map(p=>p.id).sort(),ids);
  assert.equal((await local.db.query('select value from bootstrap_sentinel')).rows[0].value,'preserved');
  await local.db.close();local=null;
  const sibling=join(parent,'another-catalogue');await assert.rejects(stat(sibling),{code:'ENOENT'});
  local=await openCatalogueDatabase(sibling);assert.equal(local.state.teams.length,18);assert((await stat(sibling)).isDirectory());
 }finally{await local?.db.close();await temp.cleanup();}
});

test('Step 5 canonical reader uses real loopback HTTP and filesystem catalogue: 200, 18 active slug teams',async()=>{
 const temp=await temporaryDirectory();let service;
 const requests=[],statuses=[];let origin;
 // Only the external Auth verification boundary is a test double. Transport,
 // service initialization, disk migrations, SQL/RLS and team reader are real.
 const owner='11111111-1111-4111-8111-111111111111';
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   requests.push({path:req.url,method:req.method,body:JSON.parse(Buffer.concat(chunks))});
   const response=await service.handle(new Request(origin+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));
   statuses.push(response.status);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(503);res.end();}
 });
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;origin='http://127.0.0.1:'+port;
  service=await createLocalCatalogueService({dataDir:join(temp.root,'missing-parent','catalogue'),port,authenticate:async token=>token==='local-test-token'?{id:owner}:null});
  const client=createLocalCatalogueClient({origin,auth:{getSession:async()=>({data:{session:{access_token:'local-test-token'}}})},
   fetchImpl:(url,options)=>fetch(new URL(url,origin),{...options,headers:{...options.headers,Origin:origin}})});
  const teams=await createCanonicalCatalogue(client).loadTeams();
  assert.deepEqual(statuses,[200]);assert.equal(teams.length,18);assert(teams.every(t=>t.catalogueActive));
  assert(teams.some(t=>t.id==='galatasaray'));assert.equal(new Set(teams.map(t=>t.id)).size,18);
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/__local/catalogue');assert.equal(requests[0].method,'POST');
  assert.equal(requests[0].body.query.table,'catalogue_teams');assert.equal(requests[0].body.query.operation,'select');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await service?.db.close();await temp.cleanup();}
});
