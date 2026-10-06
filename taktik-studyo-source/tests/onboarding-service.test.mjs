import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileApi} from '../src/lib/profile-api.js';
import {createCanonicalCatalogue} from '../src/lib/catalogue-canonical.js';
import {preferenceColumns,normalizeFavoriteTeamSlug} from '../src/lib/profile-preferences.js';
import {CURRENT_ONBOARDING_VERSION,needsOnboarding,onboardingDestination,onboardingRedirect} from '../src/lib/onboarding.js';
import {A,B,row,profileClient,deferred,tick} from './helpers/profile-fixture.mjs';
const fresh=()=>({...row(),favorite_team_slug:null,onboarding_completed_at:null,onboarding_version:0});
function fixture(){
 let stored=fresh(),current=true;
 const f=profileClient(c=>{
  if(c.table==='catalogue_teams')return {data:['galatasaray','fenerbahce'].includes(c.filters[0][1])?{id:c.filters[0][1]}:null};
  if(c.kind==='update'){stored={...stored,...c.values};if(c.values.onboarding_version)stored.onboarding_completed_at='2026-10-05T00:00:00Z';}
  return {data:{...stored}};
 });
 return {...f,api:createProfileApi({client:f.client,validatedUser:{id:A},current:()=>current}),switch(){current=false;},get stored(){return stored;}};
}
test('O1 state/version and strict destination allowlist; callbacks/public pages never redirect',()=>{
 assert.equal(CURRENT_ONBOARDING_VERSION,1);assert.equal(needsOnboarding(fresh()),true);assert.equal(needsOnboarding(null),true);
 assert.equal(needsOnboarding({...fresh(),onboarding_version:1}),true);
 assert.equal(needsOnboarding({...fresh(),onboarding_completed_at:'2026-10-05',onboarding_version:0}),true);
 const complete={...fresh(),onboarding_completed_at:'2026-10-05',onboarding_version:1};assert.equal(needsOnboarding(complete),false);
 assert.equal(onboardingRedirect('/maclar.html',fresh()),'/hos-geldin?next=%2Fmaclar.html');
 for(const path of ['/hos-geldin','/hos-geldin.html','/auth-callback.html','/sifre-yenile.html','/giris.html','/','//evil.test'])assert.equal(onboardingRedirect(path,fresh()),null);
 assert.equal(onboardingRedirect('/profil.html',complete),null);
 assert.equal(onboardingDestination('?next=%2Fmaclar.html'),'/maclar.html');
 for(const next of ['https://evil.test','//evil.test','/hos-geldin.html','/maclar.html?x=1','/maclar.html#x','%2F%2Fevil.test'])assert.equal(onboardingDestination('?next='+encodeURIComponent(next)),'/studyo.html');
 assert.equal(onboardingDestination('?next=/maclar.html&next=/profil.html'),'/studyo.html');
});
test('complete/skip and later favorite updates use narrow own-row payloads; base editing never overwrites preferences',async()=>{
 const f=fixture();assert.equal((await f.api.loadPreferences()).profile.onboarding_version,0);
 const completed=await f.api.completeOnboarding({favoriteTeamSlug:' GALATASARAY '});assert.equal(completed.ok,true);assert.equal(needsOnboarding(completed.profile),false);
 assert.deepEqual(f.calls.at(-1).values,{favorite_team_slug:'galatasaray',onboarding_version:CURRENT_ONBOARDING_VERSION});
 assert.equal(completed.profile.favorite_team_slug,'galatasaray');assert.equal(completed.profile.username,undefined);assert.equal(f.stored.username,'Canonical');
 const time=completed.profile.onboarding_completed_at;
 for(const slug of ['fenerbahce',null]){const r=slug?await f.api.setFavoriteTeam(slug):await f.api.clearFavoriteTeam();assert.equal(r.profile.favorite_team_slug,slug);assert.equal(r.profile.onboarding_completed_at,time);assert.equal(r.profile.onboarding_version,1);assert.deepEqual(f.calls.at(-1).values,{favorite_team_slug:slug});}
 await f.api.save({username:'NewName',display_name:'New display'});assert.deepEqual(f.calls.at(-1).values,{username:'NewName',display_name:'New display'});assert.equal(f.stored.onboarding_completed_at,time);
 for(const c of f.calls.filter(c=>c.table==='profiles'))assert.deepEqual(c.filters,[['id',A]]);
 const team=f.calls.find(c=>c.table==='catalogue_teams');assert.equal(team.columns,'id');assert.deepEqual(team.filters,[['id','galatasaray'],['catalogue_active',true]]);
 assert(f.calls.every(c=>['profiles','catalogue_teams'].includes(c.table)));
 const g=fixture();const skipped=await g.api.completeOnboarding();assert.equal(skipped.ok,true);assert.equal(skipped.profile.favorite_team_slug,null);assert.equal(needsOnboarding(skipped.profile),false);assert.equal(g.calls.some(c=>c.table==='catalogue_teams'),false);
});
test('invalid/provider identities fail closed; inactive/unknown canonical slug never writes',async()=>{
 const f=fixture();
 for(const value of ['',undefined,{},'123','bsd-125','fotmob-125','galatasaray/x','a\nb','<script>']){assert.equal(normalizeFavoriteTeamSlug(value),undefined);assert.equal((await f.api.setFavoriteTeam(value)).error.code,'invalid_favorite_team');}
 assert.equal(f.calls.length,0);assert.equal((await f.api.setFavoriteTeam('inactive-team')).error.code,'invalid_favorite_team');assert.equal(f.calls.some(c=>c.kind==='update'),false);
 assert.equal(normalizeFavoriteTeamSlug(' FENERBAHCE '),'fenerbahce');assert.equal(normalizeFavoriteTeamSlug(null),null);
});
test('missing O1 columns are controlled and do not break P1 load/save or recreate profiles',async()=>{
 for(const code of ['42703','42P01','PGRST204','PGRST205']){
  const f=profileClient(c=>c.columns===preferenceColumns?{error:{code,message:'private schema details'}}:{data:row()});
  const api=createProfileApi({client:f.client,validatedUser:{id:A},current:()=>true});
  assert.equal((await api.loadPreferences()).error.code,'onboarding_unavailable');assert.equal((await api.completeOnboarding()).error.code,'onboarding_unavailable');
  assert.equal((await api.load()).ok,true);assert.equal((await api.save({username:'NewName',display_name:'New'})).ok,true);
  assert.equal(f.calls.filter(c=>c.kind==='update').length,1);assert.equal(f.calls.some(c=>c.kind==='insert'),false);
 }
});
test('unavailable catalogue, absent profile and raw errors cannot create an unchecked preference',async()=>{
 const f=profileClient(c=>c.table==='catalogue_teams'?{error:{code:'42P01',message:'private'}}:{data:fresh()});const api=createProfileApi({client:f.client,validatedUser:{id:A},current:()=>true});
 assert.equal((await api.setFavoriteTeam('galatasaray')).ok,false);assert.equal(f.calls.some(c=>c.kind==='update'),false);
 const g=profileClient(()=>({data:null}));assert.equal((await createProfileApi({client:g.client,validatedUser:{id:A},current:()=>true}).completeOnboarding()).error.code,'profile_incomplete');
 assert.equal((await createProfileApi({client:f.client,validatedUser:null,current:()=>true}).completeOnboarding()).error.code,'unauthenticated');
});
test('account changes at read/catalogue/write boundaries discard stale results, never target B',async()=>{
 for(const boundary of ['read','catalogue','write']){
  let current=true;const wait=deferred();const f=profileClient(c=>{
   if(boundary==='read'||boundary==='catalogue'&&c.table==='catalogue_teams'||boundary==='write'&&c.kind==='update')return wait.promise;
   return {data:c.table==='catalogue_teams'?{id:'galatasaray'}:fresh()};
  });
  const api=createProfileApi({client:f.client,validatedUser:{id:A},current:()=>current});const pending=api.setFavoriteTeam('galatasaray');await tick();current=false;wait.resolve({data:fresh()});
  assert.equal((await pending).error.code,'state_changed');assert.equal(f.calls.filter(c=>c.kind==='update').length,boundary==='write'?1:0);
  for(const c of f.calls.filter(c=>c.table==='profiles'))assert.deepEqual(c.filters,[['id',A]]);
 }
 const f=profileClient(()=>({data:{...fresh(),id:B}}));assert.equal((await createProfileApi({client:f.client,validatedUser:{id:A},current:()=>true}).loadPreferences()).error.code,'state_changed');
});

test('separate canonical transport validates both preference methods; Auth/Profile database receives profiles queries only',async()=>{
 let stored=fresh();
 const profile=profileClient(c=>{
  assert.equal(c.table,'profiles');
  if(c.kind==='update')stored={...stored,...c.values,...(c.values.onboarding_version?{onboarding_completed_at:'2026-10-05T00:00:00Z'}:{})};
  return {data:stored};
 });
 const catalogue=profileClient(c=>{
  assert.equal(c.table,'catalogue_teams');assert.equal(c.kind,'select');assert.equal(c.columns,'id');
  assert.deepEqual(c.filters[1],['catalogue_active',true]);
  return {data:c.filters[0][1]==='galatasaray'?{id:'galatasaray'}:null};
 });
 const api=createProfileApi({client:profile.client,validatedUser:{id:A},current:()=>true,teamCatalogue:createCanonicalCatalogue(catalogue.client)});
 for(const method of [slug=>api.setFavoriteTeam(slug),slug=>api.completeOnboarding({favoriteTeamSlug:slug})]){
  assert.equal((await method(' GALATASARAY ')).ok,true);
  assert.equal(profile.calls.at(-1).values.favorite_team_slug,'galatasaray');
  const writes=profile.calls.filter(c=>c.kind==='update').length;
  for(const slug of ['inactive-team','unknown-team','bsd-125','fotmob-125','123','Galatasaray SK','https://club.test'])assert.equal((await method(slug)).error.code,'invalid_favorite_team');
  assert.equal(profile.calls.filter(c=>c.kind==='update').length,writes);
  const reads=catalogue.calls.length;assert.equal((await method(null)).ok,true);assert.equal(catalogue.calls.length,reads);
 }
});

test('independent catalogue failure and account switch fail closed before profile writes; null still works',async()=>{
 for(const mode of ['failure','switch']){
  let current=true;const pending=deferred();
  const profile=profileClient(c=>{assert.equal(c.table,'profiles');return {data:{...fresh(),...c.values}};});
  const api=createProfileApi({client:profile.client,validatedUser:{id:A},current:()=>current,teamCatalogue:{hasActiveTeam:()=>pending.promise}});
  const result=api.completeOnboarding({favoriteTeamSlug:'galatasaray'});await tick();
  if(mode==='switch'){current=false;pending.resolve(true);}else pending.resolve(false);
  assert.equal((await result).error.code,mode==='switch'?'state_changed':'invalid_favorite_team');
  assert.equal(profile.calls.some(c=>c.kind==='update'),false);
 }
 const profile=profileClient(()=>({data:fresh()}));
 const api=createProfileApi({client:profile.client,validatedUser:{id:A},current:()=>true,teamCatalogue:{hasActiveTeam(){throw Error('private transport failure');}}});
 assert.deepEqual(await api.setFavoriteTeam('galatasaray'),{ok:false,error:{code:'onboarding_save_failed'}});
 assert.equal(profile.calls.some(c=>c.kind==='update'),false);
 assert.equal((await api.completeOnboarding({favoriteTeamSlug:null})).ok,true);
});
