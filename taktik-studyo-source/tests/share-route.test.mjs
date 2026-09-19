import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolvePage} from '../src/lib/page-routes.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const id='01234567-89ab-4cde-8fab-0123456789ab';
const otherId='abcdef01-2345-4678-9abc-def012345678';
const snapshot={team:{name:'Shared team'},formation:'4-3-3',players:[],drawings:[]};

// Execute the actual entry script. Substitute only board mounting after its
// initial await; board internals/localStorage are covered by board-regression.cjs.
async function load(url,{page,readError,backendMissing=false,ready=Promise.resolve()}={}){
 const location=new URL(url,'https://taktikstudyo.com');
 const nodes={'.workspace':{style:{}},'.page-heading h1':{textContent:'Taktik tahtası.'},'.eyebrow':{textContent:'Normal'}};
 const comparisonLink={addEventListener(_name,fn){this.click=fn;}};
 const containers={landing:{hidden:false},sharedViewer:{hidden:true}};
 const document={body:{dataset:{page}},querySelector:selector=>nodes[selector],getElementById:id=>containers[id] || comparisonLink};
 const reads=[],mounts=[];
 const window={location};
 if(!backendMissing)window.TAKTIK_BACKEND={loadCatalogue:()=>ready,async readLineup(value){reads.push(value);if(readError)throw readError;return snapshot;}};
 const context=vm.createContext({window,document,URLSearchParams});
 vm.runInContext(source,context);
 window.createTacticsBoard=(root,options)=>{assert.equal(root,document);mounts.push(options);return {getState:()=>snapshot};};
 const route=resolvePage(location);
 if(['shared','share_error'].includes(route.kind)) await window.TAKTIK_APP.mountShared(route);
 return {reads,mounts,nodes,comparisonLink,containers};
}

function assertFailed(result){
 assert.equal(result.mounts.length,0);
 assert.equal(result.nodes['.workspace'].style.display,'none');
 assert.equal(result.nodes['.page-heading h1'].textContent,'Kadro yüklenemedi.');
}

test('query links load through readLineup and retain the shared-ID draft key on reload',async()=>{
 for(let attempt=0;attempt<2;attempt++){
  const result=await load('/?utm_source=test&lineup='+id);
  assert.deepEqual(result.reads,[id]);assert.equal(result.mounts.length,1);
  assert.equal(result.mounts[0].initialState,snapshot);
  assert.equal(result.mounts[0].storageKey,'taktik:draft:shared:'+id+':v1');
  assert.equal(result.nodes['.page-heading h1'].textContent,'Paylaşılan kadro.');
  assert.equal(result.nodes['.workspace'].style.display,undefined);
 }
});

test('normal landing and protected comparison never auto-mount a board',async()=>{
 for(const url of ['/','/?utm_source=test']){
  const result=await load(url,{backendMissing:true});
  assert.deepEqual(result.reads,[]);assert.equal(result.mounts.length,0);
 }
 const comparison=await load('/karsilastirma.html?lineup='+id,{page:'comparison'});
 assert.deepEqual(comparison.reads,[]);assert.equal(comparison.mounts.length,0);
});

test('invalid, empty, duplicate and non-v4 query IDs fail before any shared-lineup request',async()=>{
 const queries=['lineup','lineup=','lineup=invalid','lineup=%20'+id,'lineup='+id+'%20',
  'lineup='+id.replace('-4cde-','-3cde-'),'lineup='+id.replace('-8fab-','-7fab-'),
  'lineup='+id.toUpperCase(),'lineup='+id+'/extra','lineup=%00',
  'lineup='+id+'&lineup='+id,'lineup='+id+'&lineup='+otherId];
 for(const query of queries){
  const result=await load('/?'+query);assertFailed(result);assert.deepEqual(result.reads,[]);
 }
});

test('legacy paths still work and valid query IDs take precedence',async()=>{
 for(const path of ['/lineup/'+id,'/lineup/'+id+'/']){
  const result=await load(path);assert.deepEqual(result.reads,[id]);
  assert.equal(result.mounts[0].storageKey,'taktik:draft:shared:'+id+':v1');
 }
 const result=await load('/lineup/'+otherId+'?lineup='+id);
 assert.deepEqual(result.reads,[id]);assert.equal(result.mounts[0].initialState,snapshot);
 for(const path of ['/lineup/','/lineup/invalid','/lineup/'+id+'/extra','/lineup/'+id+'?lineup=']){
  const invalid=await load(path);assertFailed(invalid);assert.deepEqual(invalid.reads,[]);
 }
});

test('missing backend or rejected shared reads show the existing error instead of mounting a board',async()=>{
 for(const readError of [new Error('Not found'),new Error('Network unavailable')]){
  const result=await load('/?lineup='+id,{readError});assertFailed(result);assert.deepEqual(result.reads,[id]);
 }
 assertFailed(await load('/?lineup='+id,{backendMissing:true}));
});

test('startup waits for backend readiness before reading or mounting',async()=>{
 let release;
 const ready=new Promise(resolve=>{release=resolve;});let finished=false;
 const pending=load('/?lineup='+id,{ready}).then(result=>{finished=true;return result;});
 await Promise.resolve();assert.equal(finished,false);
 release();const result=await pending;assert.deepEqual(result.reads,[id]);assert.equal(result.mounts.length,1);
});
