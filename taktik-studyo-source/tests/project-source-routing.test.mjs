import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';

test('canonical Free/Match Studio writers and Profile/My Work readers use Auth database, not catalogue transport',async()=>{
 const stubs={
  'studio-projects.js':'export function createStudioProjects(args){globalThis.projectBindings.push(args);return args;}',
  'profile-api.js':"export function createProfileApi(){return {loadPreferences:async()=>({ok:true,profile:{onboarding_completed_at:'done',onboarding_version:1}})};}",
  'profile-ui.js':'export function mountProfile(args){globalThis.mounts.push(args.projects);return {dispose(){}};}',
  'studio-projects-ui.js':'export function mountStudioProjects(args){globalThis.mounts.push(args.api);return {dispose(){}};}',
  'match-studio-ui.js':'export function mountMatchStudio(args){globalThis.mounts.push(args.projects);return {dispose(){}};}',
  'player-overrides.js':'export const playerKey=()=>null;export function createPlayerOverrides(){return {load:async()=>{},dispose(){}};}',
 };
 const output=await build({entryPoints:['src/lib/page-bootstrap.js'],bundle:true,write:false,format:'iife',globalName:'Page',plugins:[{name:'mount-boundaries',setup(b){
  b.onLoad({filter:/[\\/](studio-projects|profile-api|profile-ui|studio-projects-ui|match-studio-ui|player-overrides)\.js$/},args=>({contents:stubs[args.path.split(/[\\/]/).at(-1)],loader:'js'}));
 }}]});
 for(const path of ['/profil','/calismalarim','/mac-studyosu','/mac-studyosu?id=215997']){
  const authClient={tag:'local-auth-db'},dataClient={tag:'local-catalogue-db'},user={id:'11111111-1111-4111-8111-111111111111'};
  const context={URL,URLSearchParams,projectBindings:[],mounts:[]};vm.runInNewContext(output.outputFiles[0].text,context);
  const node=()=>({addEventListener(){},removeEventListener(){}}),nodes=new Map();
  const page=context.Page.startPage({client:authClient,backend:{catalogue:{canonical:true,dataClient},loadCatalogue:async()=>{}},
   document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}},
   window:{location:new URL(path,'http://localhost:4173'),addEventListener(){},removeEventListener(){}},
   auth:{initialize:async()=>({ok:true}),getState:()=>({status:'signed_in',user}),validateUser:async()=>({ok:true,user}),subscribe:()=>()=>{}}});
  await page.ready;assert.equal(context.projectBindings.length,1,path);assert.equal(context.mounts.length,1,path);
  assert.equal(context.mounts[0].client,authClient,path);assert.notEqual(context.mounts[0].client,dataClient,path);
  assert.equal(context.mounts[0].validatedUser.id,user.id);assert.equal(context.mounts[0].current(),true);page.dispose();
 }
});
