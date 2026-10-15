import {PGlite} from '@electric-sql/pglite';
import {readFileSync,mkdirSync} from 'node:fs';
import {syncLocal,readCanonicalState} from './sync.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
export function cleanCatalogueInput(){
 const fixture=JSON.parse(read('tests/fixtures/bsd-catalogue-clean.json'));
 const registrations=JSON.parse(read('scripts/catalogue/team-registrations.json'));
 if(fixture.leagueId!==11||fixture.seasonId!==1539||fixture.teams.length!==18)throw Error('team_scope_changed');
 return {...fixture,teams:fixture.teams.map(t=>{const reg=registrations.find(r=>r.bsdId===t.provider_id);if(!reg)throw Error('unreviewed_team');return {...reg};})};
}
export async function openCatalogueDatabase(dataDir,{populate=true}={}){
 // PGlite has no remote database URL or linked Supabase path.
 // NodeFS creates only its leaf directory; clean checkouts need parents too.
 // Preserve PGlite's in-memory/browser storage modes used by isolated tests.
 if(dataDir&&!/^(memory|idb|opfs-ahp):\/\//.test(dataDir))mkdirSync(dataDir.startsWith('file://')?dataDir.slice(7):dataDir,{recursive:true});
 const db=new PGlite(dataDir);
 await db.exec('create table if not exists public.d3_local_versions(version text primary key)');
 const versions=new Set((await db.query('select version from public.d3_local_versions')).rows.map(r=>r.version));
 const apply=async(version,sql)=>{
  if(versions.has(version))return;
  // Every step and local version marker commit together; recoverable restart.
  await db.transaction(async tx=>{await tx.exec(sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''));await tx.query('insert into public.d3_local_versions values($1)',[version]);});
 };
 await apply('roles',`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create table auth.users(id uuid primary key);
  create schema tactics_private;revoke all on schema tactics_private from public,anon,authenticated;
  create function tactics_private.touch_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at=now();return new;end $$;
  revoke all on function tactics_private.touch_updated_at() from public,anon,authenticated;
  create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 // 20260925040000 (SEC1.1) removes anonymous catalogue reads; existing local databases receive it once.
 for(const name of ['20260923135716_studio_projects','20260924094207_player_overrides','20260925035438_catalogue_identity_foundation','20260925040000_catalogue_no_anon_read'])await apply(name,read('supabase/migrations/'+name+'.sql'));
 await apply('internal_override_keys',read('supabase/local/catalogue_override_keys.sql'));
 // PROD1.5: same override-key rule and transactional sync function as the hosted schema.
 for(const name of ['20261015120000_player_override_internal_keys','20261015120100_catalogue_sync'])await apply(name,read('supabase/migrations/'+name+'.sql'));
 const input=cleanCatalogueInput();
 if(populate&&!versions.has('clean_population')){
  await syncLocal(db,input,{dryRun:false});
  await db.query("insert into public.d3_local_versions values('clean_population')");
 }
 return {db,state:await readCanonicalState(db)};
}
const fields={
 catalogue_teams:['id','display_name','short_name','color_primary','color_secondary','sort_order','catalogue_active'],
 catalogue_players:['id','team_id','display_name','position_group','specific_position','shirt_number','catalogue_active'],
 player_overrides:['user_id','player_key','name','number','role'],
 studio_projects:['id','user_id','title','studio_mode','match_id','match_week','snapshot_version','snapshot','revision','created_at','updated_at'],
};
const insertable={player_overrides:['user_id','player_key','name','number','role'],studio_projects:['id','user_id','title','snapshot_version','snapshot']};
const updatable={player_overrides:['name','number','role'],studio_projects:['title','snapshot_version','snapshot']};
export async function localQuery(db,owner,q){
 try{
  if(!q||!Object.hasOwn(fields,q.table))throw Error();
  const allowed=fields[q.table],col=k=>{if(!allowed.includes(k))throw Error();return '"'+k+'"';};
  const operation=q.operation;if(!['select','insert','update','delete'].includes(operation))throw Error();
  if(operation!=='select'&&!Object.hasOwn(insertable,q.table))throw Error();
  const columns=(q.columns==='*'?allowed:q.columns.split(',')).map(col).join(','),params=[];
  const bind=v=>{params.push(typeof v==='object'&&v!==null?JSON.stringify(v):v);return '$'+params.length;};
  let sql;
  if(operation==='insert'||operation==='update'){
   const entries=Object.entries(q.values||{}),permission=operation==='insert'?insertable[q.table]:updatable[q.table];
   if(!entries.length||entries.some(([k])=>!permission.includes(k)))throw Error();
   sql=operation==='insert'?`insert into public.${q.table} (${entries.map(([k])=>col(k)).join(',')}) values (${entries.map(([,v])=>bind(v)).join(',')})`
    :`update public.${q.table} set ${entries.map(([k,v])=>col(k)+'='+bind(v)).join(',')}`;
  }else sql=operation==='select'?`select ${columns} from public.${q.table}`:`delete from public.${q.table}`;
  if(!Array.isArray(q.filters)||q.filters.length>12||!Array.isArray(q.orders)||q.orders.length>3)throw Error();
  if(operation!=='insert'&&q.filters.length)sql+=' where '+q.filters.map(([k,op,v])=>{if(!['eq','gt','like'].includes(op))throw Error();return col(k)+({eq:'=',gt:'>',like:' like '})[op]+bind(v);}).join(' and ');
  if(operation==='select'){
   if(!Number.isInteger(q.limit)||q.limit<1||q.limit>1000||!Number.isInteger(q.offset)||q.offset<0||q.offset>100000)throw Error();
   if(q.orders.length)sql+=' order by '+q.orders.map(([k,asc])=>col(k)+(asc?' asc':' desc')).join(',');
   sql+=' limit '+bind(q.limit)+' offset '+bind(q.offset);
  }else sql+=' returning '+columns;
  return await db.transaction(async tx=>{
   await tx.query('insert into auth.users(id) values($1) on conflict do nothing',[owner]);
   await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await tx.exec('set local role authenticated');
   const {rows}=await tx.query(sql,params);return {data:q.single?(rows.length<=1?rows[0]??null:null):rows,error:q.single&&rows.length>1?{code:'PGRST116'}:null};
  });
 }catch(e){return {data:null,error:{code:['23505','23514','23503','42501','42P01'].includes(e.code)?e.code:'invalid_query'}};}
}
