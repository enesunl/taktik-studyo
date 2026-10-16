import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {toShare} from '../src/lib/validation.js';

// PROD1.5: the exact pending production queue, applied in order on top of a production-shaped
// database (the 5 applied migrations + legacy seed + test-like user records). In-memory only.
const dir=new URL('../supabase/migrations/',import.meta.url);
const sql=name=>readFileSync(new URL(name,dir),'utf8');
const all=readdirSync(dir).filter(f=>f.endsWith('.sql')).sort();
const APPLIED=['20260913063249_football_backend.sql','20260920094922_catalogue_authenticated_read.sql','20260920102243_profiles_ownership.sql','20260923135716_studio_projects.sql','20260924094207_player_overrides.sql'];
const PENDING=['20260924200000_legacy_catalogue_no_anon_read.sql','20260925035438_catalogue_identity_foundation.sql','20260925040000_catalogue_no_anon_read.sql',
  '20261004234326_profile_onboarding_foundation.sql','20261013165455_weekly_lineups.sql','20261014074114_weekly_snapshot_validation.sql',
  '20261014140000_seed_catalogue_teams.sql','20261014150000_shared_lineup_owner.sql','20261015120000_player_override_internal_keys.sql','20261015120100_catalogue_sync.sql',
  '20261015190000_account_limits.sql','20261015200000_terms_acceptance.sql','20261016150000_matches_detail_limits.sql','20261016170000_catalogue_app_read.sql'];
const user='11111111-1111-4111-8111-111111111111';
async function production(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;grant usage on schema public to anon,authenticated,service_role;`);
  for(const name of APPLIED)await db.exec(sql(name));
  await db.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  // Production-shaped test records: 2 projects, 2 legacy-key overrides, 8 ownerless share links.
  await db.query('insert into auth.users values ($1)',[user]);
  await db.query("insert into public.profiles(id,username) values ($1,'tester')",[user]);
  const snapshot=side=>({version:1,source:{mode:'free',matchId:null,week:null},teams:{home:null,away:null},working:[],drawings:[],pitch:{color:'#285b3b',width:1200,height:650}});
  for(const title of ['A','B'])await db.query("insert into public.studio_projects(user_id,title,studio_mode,snapshot) values ($1,$2,'free',$3)",[user,title,JSON.stringify(snapshot())]);
  for(const key of ['local:554534','local:958273'])await db.query("insert into public.player_overrides(user_id,player_key,name,role) values ($1,$2,'X','MO')",[user,key]);
  const share=toShare({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'P'+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]});
  await db.exec('set role service_role');for(let i=0;i<8;i++)await db.query('select public.create_shared_lineup($1::jsonb,$2)',[JSON.stringify(share),String(i).repeat(64).slice(0,64).replace(/./g,c=>'abcdef0123456789'[Number(c)])]);await db.exec('reset role');
  return db;
}
const counts=async db=>Object.fromEntries(await Promise.all(['public.teams','public.players','public.studio_projects','public.player_overrides','public.shared_lineups','public.profiles'].map(async t=>[t,(await db.query('select count(*)::int n from '+t)).rows[0].n])));

test('pending production queue: exact order, applies cleanly; only 20261014150000 removes user rows',async()=>{
  assert.deepEqual(all.filter(f=>!APPLIED.includes(f)),PENDING,'no unexpected or reordered pending migration');
  const db=await production();
  try{
    const start=await counts(db);
    assert.equal(start['public.shared_lineups'],8);assert.equal(start['public.player_overrides'],2);assert.equal(start['public.studio_projects'],2);
    for(const name of PENDING){
      const before=await counts(db);
      await db.exec(sql(name));
      const after=await counts(db);
      if(name==='20261014150000_shared_lineup_owner.sql'){
        // Destructive by design (ACCOUNT1): ownerless legacy share links are removed. Needs explicit approval.
        assert.equal(after['public.shared_lineups'],0);assert.deepEqual({...after,'public.shared_lineups':8},before);
      }else assert.deepEqual(after,before,name+' must not change existing rows');
    }
    // Legacy records stay untouched (FotMob catalogue, projects, overrides keep their keys).
    assert.deepEqual((await db.query('select player_key from public.player_overrides order by 1')).rows.map(r=>r.player_key),['local:554534','local:958273']);
    assert.equal((await db.query('select count(*)::int n from public.catalogue_teams')).rows[0].n,18);
  }finally{await db.close();}
});

test('dependencies: wrong orders fail loudly instead of half-applying',async()=>{
  for(const [first,missing] of [['20260925040000_catalogue_no_anon_read.sql','identity foundation'],['20261014140000_seed_catalogue_teams.sql','identity foundation'],['20261015120100_catalogue_sync.sql','identity foundation']]){
    const db=await production();
    try{await assert.rejects(db.exec(sql(first)),undefined,first+' requires '+missing);}finally{await db.close();}
  }
});

test('access after the full queue: anon reads no catalogue; signed-in reads active BSD rows; sync is service_role only',async()=>{
  const db=await production();
  try{
    for(const name of PENDING)await db.exec(sql(name));
    const as=async(role,fn)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[role==='authenticated'?user:'']);await db.exec('set role '+role);try{return await fn();}finally{await db.exec('reset role');}};
    const denied=p=>assert.rejects(p,e=>e.code==='42501');
    await as('anon',async()=>{
      for(const t of ['teams','players','catalogue_teams','catalogue_players','team_provider_ids','player_provider_ids','studio_projects','player_overrides','shared_lineups','profiles'])await denied(db.query('select 1 from public.'+t+' limit 1'));
      await denied(db.query("select public.catalogue_apply_sync('{}'::jsonb)"));await denied(db.query('select public.catalogue_sync_status()'));
    });
    await as('authenticated',async()=>{
      assert.equal((await db.query('select count(*)::int n from public.catalogue_teams')).rows[0].n,18);
      await db.query('select count(*) from public.catalogue_players');
      for(const t of ['team_provider_ids','player_provider_ids'])await denied(db.query('select 1 from public.'+t+' limit 1'));
      await denied(db.query("select public.catalogue_apply_sync('{}'::jsonb)"));
      // Legacy catalogue still readable when signed in until the post-cutover M6 revoke.
      assert.equal((await db.query('select count(*)::int n from public.players')).rows[0].n,539);
      // internal: override keys are accepted for the signed-in owner.
      await db.query("insert into public.player_overrides(user_id,player_key,name,role) values ($1,'internal:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Y','MO')",[user]);
    });
    await db.exec('set role service_role');assert.equal((await db.query('select public.catalogue_sync_status() s')).rows[0].s.runs,0);await db.exec('reset role');
  }finally{await db.close();}
});
