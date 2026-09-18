import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {toShare} from '../src/lib/validation.js';
const fixture=()=>({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'Test '+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]});
test('Postgres schema, seed, grants, RLS, constraints and atomic share quotas',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(readFileSync(new URL('../supabase/schema/football.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  await db.exec('set role anon');
  assert.equal((await db.query('select count(*)::int as n from public.teams')).rows[0].n,18);
  assert.equal((await db.query('select count(*)::int as n from public.players')).rows[0].n,539);
  for(const sql of ["insert into public.players(id,team_id,name,position) values('test','x','X','G')","update public.players set name='bad'","delete from public.players","insert into public.teams(id,name,short_name,color_primary,color_secondary) values('x','X','X','#123456','#123456')","update public.teams set name='bad'","delete from public.teams","select * from public.shared_lineups","select public.create_shared_lineup('{}'::jsonb,'x')"]){await assert.rejects(db.exec(sql),error=>error.code==='42501');}
  await db.exec('reset role');
  const grants=(await db.query("select table_name,privilege_type from information_schema.role_table_grants where grantee='anon' and table_schema='public' order by table_name")).rows;
  assert.deepEqual(grants,[{table_name:'players',privilege_type:'SELECT'},{table_name:'teams',privilege_type:'SELECT'}]);
  assert.equal((await db.query("select count(*)::int as n from pg_tables where schemaname='public' and not rowsecurity")).rows[0].n,0);
  const p=toShare(fixture());
  await db.exec('set role service_role');
  for(let i=0;i<5;i++)assert.match((await db.query('select public.create_shared_lineup($1::jsonb,$2) as id',[JSON.stringify(p),'a'.repeat(64)])).rows[0].id,/^[0-9a-f-]{36}$/);
  assert.equal((await db.query('select public.create_shared_lineup($1::jsonb,$2) as id',[JSON.stringify(p),'a'.repeat(64)])).rows[0].id,null);
  assert.equal((await db.query('select count(*)::int as n from public.shared_lineups')).rows[0].n,5);
  const bad=structuredClone(p);bad.lineup_data.players[0].role=null;
  await assert.rejects(db.query('select public.create_shared_lineup($1::jsonb,$2)',[JSON.stringify(bad),'b'.repeat(64)]));
  await assert.rejects(db.query("insert into public.shared_lineups(team_name,formation,lineup_data,drawing_data) values ('Test','99-1',$1::jsonb,'[]')",[JSON.stringify(p.lineup_data)]));
 }finally{await db.close();}
});
