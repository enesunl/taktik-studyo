import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const dir=new URL('../supabase/migrations/',import.meta.url);
const SEED='20261014140000_seed_catalogue_teams.sql';
const seed=readFileSync(new URL(SEED,dir),'utf8');
const registry=JSON.parse(readFileSync(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';

async function database(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
  return db;
}
const teams=async db=>(await db.query('select id,display_name,short_name,color_primary,color_secondary,sort_order,catalogue_active,updated_at from public.catalogue_teams order by sort_order')).rows;

test('seed migration inserts exactly the 18 verified registry teams after all repository migrations',async()=>{
  const db=await database();
  try{
    const rows=await teams(db);
    assert.equal(rows.length,18);
    assert.deepEqual(rows.map(({updated_at,...r})=>r),[...registry].sort((a,b)=>a.sort_order-b.sort_order).map(t=>({id:t.id,display_name:t.display_name,short_name:t.short_name,color_primary:t.color_primary,color_secondary:t.color_secondary,sort_order:t.sort_order,catalogue_active:true})));
    // Signed-in read path used by onboarding/profile sees all 18 active teams; anon has no read (SEC1.1).
    await db.exec('set role authenticated');
    try{assert.equal((await db.query('select count(*)::int n from public.catalogue_teams')).rows[0].n,18);}finally{await db.exec('reset role');}
    await db.exec('set role anon');
    try{await assert.rejects(db.query('select 1 from public.catalogue_teams'),e=>e.code==='42501');}finally{await db.exec('reset role');}
  }finally{await db.close();}
});

test('seed is idempotent and never touches existing favourite-team preferences',async()=>{
  const db=await database();
  try{
    await db.query('insert into auth.users values ($1),($2),($3)',[A,B,C]);
    await db.query("insert into public.profiles(id,username,favorite_team_slug) values($1,'fan_a','galatasaray'),($2,'fan_b',null),($3,'fan_c','trabzonspor')",[A,B,C]);
    const profiles=async()=>(await db.query('select id,favorite_team_slug,onboarding_version,onboarding_completed_at,updated_at from public.profiles order by id')).rows;
    const beforeProfiles=await profiles(),beforeTeams=await teams(db);
    await db.exec(seed);await db.exec(seed);
    assert.deepEqual(await profiles(),beforeProfiles,'preferences unchanged');
    assert.deepEqual(await teams(db),beforeTeams,'no updates on re-run (updated_at unchanged)');
    // A partially seeded table converges without touching the existing matching rows.
    await db.query("delete from public.catalogue_teams where id='corum-fk'");
    await db.exec(seed);
    assert.equal((await teams(db)).length,18);
    const executable=seed.split(/\r?\n/).filter(line=>!line.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(executable,/\bprofiles\b|\bupdate\b|\bdelete\b|\btruncate\b|\bdrop\b|\bon conflict \(id\) do update\b/i);
  }finally{await db.close();}
});

test('seed aborts instead of silently substituting when an existing team row differs',async()=>{
  const db=await database();
  try{
    await db.exec('alter table public.catalogue_teams disable trigger catalogue_teams_touch');
    await db.query("update public.catalogue_teams set display_name='Galatasaray SK' where id='galatasaray'");
    await assert.rejects(db.exec(seed),e=>e.code==='23514'&&/differs from the verified registry for 1 team/.test(e.message));
    await db.query("update public.catalogue_teams set display_name='Galatasaray',catalogue_active=false where id='galatasaray'");
    await assert.rejects(db.exec(seed),e=>e.code==='23514');
    assert.equal((await db.query("select display_name from public.catalogue_teams where id='galatasaray'")).rows[0].display_name,'Galatasaray','not overwritten');
  }finally{await db.close();}
});

test('seed values are generated from the registry and match the legacy production palette',()=>{
  for(const t of registry){
    const row=`('${t.id}','${t.display_name}','${t.short_name}','${t.color_primary}','${t.color_secondary}',${t.sort_order})`;
    assert.equal(seed.split(row).length-1,2,t.id+' appears in both the insert and the verification list');
  }
  // supabase/functions/matches/teams.js mirrors the same names/colours for every BSD id.
  const mapping=readFileSync(new URL('../supabase/functions/matches/teams.js',import.meta.url),'utf8');
  for(const t of registry)assert.match(mapping,new RegExp(`\\[${t.bsdId},'[^']+','${t.display_name}','${t.color_primary}','${t.color_secondary}'`),t.id);
});
