import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createAccountDeleteHandler,accountDeleteOrigins,OWNED_TABLES,CONFIRMATION} from '../supabase/functions/account-delete/handler.js';
import {createAccountDeletion,clearUserData,userScopedPrefixes,ACCOUNT_DELETE_CONFIRMATION} from '../src/lib/account-delete.js';
import {mountAccountDeletion,confirmationMatches} from '../src/lib/account-delete-ui.js';
import {snapshot as projectSnapshot} from './helpers/studio-project-fixture.mjs';
import {emptyWeeklyXI,pickWeeklyPlayer} from '../src/lib/weekly-xi.js';
import {toShare} from '../src/lib/validation.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const origin='https://taktikstudyo.com';
const tick=()=>new Promise(r=>setTimeout(r,0));

// ---------- Server handler ----------
function server({users={'token-a':{id:A,email:'a@example.test',email_confirmed_at:'2026-10-14T00:00:00Z'},'token-b':{id:B,email:'b@example.test',email_confirmed_at:'2026-10-14T00:00:00Z'}},password='correct horse battery',counts,deleteError,verifyError}={}){
  const calls={auth:0,verify:[],deleted:[],counted:[]};
  const owned=new Map([[A,{profiles:1,studio_projects:2,player_overrides:1,weekly_lineups:1,shared_lineups:3}],[B,{profiles:1,studio_projects:1,player_overrides:0,weekly_lineups:2,shared_lineups:1}]]);
  const handler=createAccountDeleteHandler({origins:accountDeleteOrigins(),
    async authenticate(jwt){calls.auth++;if(jwt==='throws')throw Error('expired');return users[jwt]??null;},
    async verifyPassword({email,password:given,userId}){calls.verify.push({email,userId});if(verifyError)throw verifyError;return given===password;},
    async countOwned(userId){calls.counted.push(userId);if(counts)return counts(userId,calls);return {...(owned.get(userId)??{})};},
    async deleteUser(userId){if(deleteError)throw deleteError;calls.deleted.push(userId);owned.set(userId,Object.fromEntries(OWNED_TABLES.map(([t])=>[t,0])));}});
  const send=({token='token-a',body={password,confirmation:CONFIRMATION},headers={},method='POST',raw}={})=>handler(new Request('https://db.test/functions/v1/account-delete',{method,
    headers:{origin,'content-type':'application/json',...(token===null?{}:{authorization:'Bearer '+token}),...headers},body:method==='POST'?(raw??JSON.stringify(body)):undefined}));
  return {handler,calls,owned,send};
}
const code=async response=>(await response.json()).error?.code;

test('account-delete derives the target only from the verified token and deletes exactly that account',async()=>{
  const s=server();
  const response=await s.send();assert.equal(response.status,200);assert.deepEqual(await response.json(),{deleted:true});
  assert.deepEqual(s.calls.deleted,[A]);assert.deepEqual(s.calls.verify,[{email:'a@example.test',userId:A}]);
  assert.deepEqual(s.calls.counted,[A,A],'preflight and post-delete verification for the caller only');
  assert.equal(Object.values(s.owned.get(B)).reduce((a,b)=>a+b),5,'unrelated account untouched');
});

test('another account cannot be targeted: user ids and extra fields are rejected before any verification',async()=>{
  for(const body of [{password:'correct horse battery',confirmation:CONFIRMATION,user_id:B},{password:'correct horse battery',confirmation:CONFIRMATION,id:B},{password:'correct horse battery',confirmation:CONFIRMATION,email:'b@example.test'},['x'],null]){
    const s=server();const response=await s.send({body});
    assert.equal(response.status,400);assert.equal(await code(response),'invalid_request');
    assert.equal(s.calls.verify.length,0);assert.deepEqual(s.calls.deleted,[]);
  }
  // A valid token for B deletes B, never A.
  const s=server();assert.equal((await s.send({token:'token-b'})).status,200);assert.deepEqual(s.calls.deleted,[B]);
});

test('missing, malformed, invalid, expired, unconfirmed or anonymous sessions fail before reauthentication',async()=>{
  const users={'token-a':{id:A,email:'a@example.test',email_confirmed_at:null},'anon':{id:A,email:'a@example.test',email_confirmed_at:'x',is_anonymous:true},'noemail':{id:A,email_confirmed_at:'x'}};
  for(const [token,headers] of [[null,{}],['bad',{}],['throws',{}],['token-a',{}],['anon',{}],['noemail',{}],[null,{authorization:'Basic abc'}],[null,{authorization:'Bearer'}]]){
    const s=server({users});const response=await s.send({token,headers});
    assert.equal(response.status,401,String(token));assert.equal(await code(response),'unauthenticated');
    assert.equal(s.calls.verify.length,0);assert.deepEqual(s.calls.deleted,[]);
  }
});

test('failed verification, wrong confirmation and transport problems preserve data',async()=>{
  const cases=[
    [{body:{password:'wrong',confirmation:CONFIRMATION}},{},403,'reauthentication_failed'],
    [{body:{password:'correct horse battery',confirmation:'hesabimi sil'}},{},400,'confirmation_mismatch'],
    [{body:{password:'',confirmation:CONFIRMATION}},{},400,'invalid_request'],
    [{body:{confirmation:CONFIRMATION}},{},400,'invalid_request'],
    [{raw:'{not json'},{},400,'invalid_request'],
    [{raw:JSON.stringify({password:'x'.repeat(3000),confirmation:CONFIRMATION})},{},400,'invalid_request'],
    [{headers:{'content-type':'text/plain'}},{},400,'invalid_request'],
    [{},{verifyError:{code:'rate_limited'}},429,'rate_limited'],
    [{},{verifyError:Error('auth down')},503,'reauthentication_unavailable'],
  ];
  for(const [request,options,status,expected] of cases){
    const s=server(options);const response=await s.send(request);
    assert.equal(response.status,status,expected);assert.equal(await code(response),expected);assert.deepEqual(s.calls.deleted,[]);
  }
  for(const [method,status] of [['GET',405],['DELETE',405],['OPTIONS',204]]){const s=server();assert.equal((await s.send({method})).status,status);assert.deepEqual(s.calls.deleted,[]);}
  const denied=server();for(const bad of ['https://evil.test','null']){const r=await denied.send({headers:{origin:bad}});assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);}
  const noOrigin=await createAccountDeleteHandler({origins:[origin],authenticate:async()=>{throw Error('no')},verifyPassword:async()=>true,countOwned:async()=>({}),deleteUser:async()=>{throw Error('no')}})(new Request('https://db.test/x',{method:'POST'}));
  assert.equal(noOrigin.status,403);
  assert.equal((await server().send({headers:{}},)).headers.get('Cache-Control'),'no-store');
});

test('deletion is refused when ownership cannot be checked and success requires zero remaining rows',async()=>{
  const preflight=server({counts:()=>{throw Error('owner column missing');}});
  let r=await preflight.send();assert.equal(r.status,503);assert.equal(await code(r),'deletion_unavailable');assert.deepEqual(preflight.calls.deleted,[]);
  const failed=server({deleteError:Error('admin api down')});r=await failed.send();assert.equal(r.status,500);assert.equal(await code(r),'delete_failed');
  const leftover=server({counts:(id,calls)=>calls.deleted.length?{profiles:0,studio_projects:0,player_overrides:0,weekly_lineups:0,shared_lineups:1}:{profiles:1}});
  r=await leftover.send();assert.equal(r.status,500);assert.equal(await code(r),'verification_failed');
  let first=true;const unknown=server({counts:()=>{if(first){first=false;return {profiles:1};}throw Error('db down');}});
  r=await unknown.send();assert.equal(r.status,500);assert.equal(await code(r),'verification_failed');
  assert.throws(()=>accountDeleteOrigins('http://evil.test'));assert.throws(()=>accountDeleteOrigins('https://*.test'));
  assert.deepEqual(accountDeleteOrigins('https://taktikstudyo.com,http://localhost:4173'),['https://taktikstudyo.com','http://localhost:4173']);
});

// ---------- Real SQL cascades (all repository migrations, isolated PGlite) ----------
test('real SQL: deleting an Auth user cascades to every owned table, keeps other users and forbids unowned links',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable set search_path='' as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(name,dir),'utf8'));
    // The handler's owned-table list must match every public FK to auth.users.
    const fks=(await db.query(`select c.conrelid::regclass::text as t,a.attname as col,c.confdeltype as rule from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      where c.contype='f' and c.confrelid='auth.users'::regclass order by 1`)).rows;
    assert.deepEqual(fks.map(r=>[r.t.replace('public.',''),r.col]).sort(),[...OWNED_TABLES].map(x=>[...x]).sort());
    assert(fks.every(r=>r.rule==='c'),'every owned table cascades');
    await db.query('insert into auth.users values ($1),($2)',[A,B]);
    const weekly=pickWeeklyPlayer(emptyWeeklyXI(),1,{id:B,teamId:'galatasaray',name:'Test Player',teamName:'Galatasaray',number:10,positionGroup:'M',specificPosition:'AM',color:'#a61931',color2:'#f5bd28'});
    const share=toShare({team:{name:'Test',short:'T',color:'#123456',color2:'#abcdef'},formation:'4-3-3',customized:false,players:Array.from({length:11},(_,id)=>({id,name:'Test '+id,x:50,y:50,number:id+1,role:'MO',renamed:false})),drawings:[]});
    for(const [uid,name] of [[A,'owner_a'],[B,'owner_b']]){
      await db.query('insert into public.profiles(id,username) values($1,$2)',[uid,name]);
      await db.query('insert into public.studio_projects(user_id,title,snapshot_version,snapshot) values($1,$2,1,$3)',[uid,'Plan',JSON.stringify(projectSnapshot())]);
      await db.query("insert into public.player_overrides(user_id,player_key,name,role) values($1,'local:p1','Ad','KL')",[uid]);
      await db.query('insert into public.weekly_lineups(user_id,title,season,week,formation,snapshot) values($1,$2,$3,$4,$5,$6)',[uid,'XI','2026/27',8,weekly.formation,JSON.stringify(weekly)]);
      const bucket=(uid===A?'a':'b').repeat(64);
      assert.match((await db.query('select public.create_shared_lineup($1::jsonb,$2,$3) as id',[JSON.stringify(share),bucket,uid])).rows[0].id,/^[0-9a-f-]{36}$/);
    }
    await assert.rejects(db.query('select public.create_shared_lineup($1::jsonb,$2,null)',[JSON.stringify(share),'c'.repeat(64)]),/Owner required/);
    await assert.rejects(db.query('select public.create_shared_lineup($1::jsonb,$2,$3)',[JSON.stringify(share),'c'.repeat(64),'33333333-3333-4333-8333-333333333333']));
    await assert.rejects(db.query("insert into public.shared_lineups(team_name,formation,lineup_data,drawing_data) values('T','4-3-3',$1::jsonb,'[]')",[JSON.stringify(share.lineup_data)]));
    await assert.rejects(db.query('select public.create_shared_lineup($1::jsonb,$2)',[JSON.stringify(share),'d'.repeat(64)]),'legacy unowned RPC removed');
    const count=async uid=>Object.fromEntries(await Promise.all(OWNED_TABLES.map(async([t,c])=>[t,(await db.query(`select count(*)::int n from public.${t} where ${c}=$1`,[uid])).rows[0].n])));
    assert.deepEqual(await count(A),{profiles:1,studio_projects:1,player_overrides:1,weekly_lineups:1,shared_lineups:1});
    await db.query('delete from auth.users where id=$1',[A]);
    assert.deepEqual(await count(A),{profiles:0,studio_projects:0,player_overrides:0,weekly_lineups:0,shared_lineups:0});
    assert.deepEqual(await count(B),{profiles:1,studio_projects:1,player_overrides:1,weekly_lineups:1,shared_lineups:1});
    assert.equal((await db.query('select count(*)::int n from public.shared_lineups where owner_id is null')).rows[0].n,0);
  }finally{await db.close();}
});

test('migration purges legacy unowned links before enforcing ownership',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261014150000_shared_lineup_owner.sql',import.meta.url),'utf8');
  assert(sql.indexOf('delete from public.shared_lineups;')<sql.indexOf('add column owner_id uuid not null references auth.users(id) on delete cascade'));
  assert.match(sql,/grant execute on function public\.create_shared_lineup\(jsonb,text,uuid\) to service_role;/);
  assert.match(sql,/revoke all on function public\.create_shared_lineup\(jsonb,text,uuid\) from public,anon,authenticated;/);
});

// ---------- Browser client ----------
test('client sends only password and confirmation with the session JWT and trusts only an explicit success',async()=>{
  const requests=[];
  const client=token=>({auth:{getSession:async()=>({data:{session:token?{access_token:token}:null}})}});
  const respond=(status,body)=>async(url,init)=>{requests.push({url,init});return new Response(body===undefined?'not json':JSON.stringify(body),{status});};
  const make=(token,fetcher)=>createAccountDeletion({client:client(token),url:'http://127.0.0.1:54321',key:'sb_publishable_local',fetcher});
  assert.deepEqual(await make(null,respond(200,{deleted:true})).deleteAccount({password:'p',confirmation:ACCOUNT_DELETE_CONFIRMATION}),{ok:false,code:'unauthenticated'});
  assert.equal(requests.length,0);
  assert.deepEqual(await make('jwt-a',respond(200,{deleted:true})).deleteAccount({password:'p',confirmation:ACCOUNT_DELETE_CONFIRMATION}),{ok:true});
  const sent=requests.at(-1);assert.equal(sent.url,'http://127.0.0.1:54321/functions/v1/account-delete');
  assert.equal(new Headers(sent.init.headers).get('authorization'),'Bearer jwt-a');
  assert.deepEqual(JSON.parse(sent.init.body),{password:'p',confirmation:'HESABIMI SIL'});
  for(const [status,body,expected] of [[200,{},'unknown'],[200,undefined,'unknown'],[202,{deleted:true},'unknown'],[401,{code:401,message:'Invalid JWT'},'unauthenticated'],[403,{error:{code:'reauthentication_failed'}},'reauthentication_failed'],[500,{error:{code:'verification_failed'}},'verification_failed']])
    assert.deepEqual(await make('jwt-a',respond(status,body)).deleteAccount({password:'p',confirmation:ACCOUNT_DELETE_CONFIRMATION}),{ok:false,code:expected},String(status));
  assert.deepEqual(await make('jwt-a',async()=>{throw Error('offline');}).deleteAccount({password:'p',confirmation:ACCOUNT_DELETE_CONFIRMATION}),{ok:false,code:'network'});
  assert.deepEqual(await createAccountDeletion({client:null,url:'',key:''}).deleteAccount({}),{ok:false,code:'unavailable'});
});

test('local cleanup removes only the deleted user\'s scoped keys',()=>{
  const store=entries=>{const data=new Map(entries);return {data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,removeItem:k=>data.delete(k)};};
  const local=store([['taktik:draft:'+A+':main:v2','a'],['taktik:draft:'+A+':comparison:left:v2','a'],['taktik:studio:autosave:'+A+':v1','on'],['taktik:weekly-xi:'+A+':canonical:v1','{}'],
    ['taktik:draft:'+B+':main:v2','b'],['taktik:weekly-xi:'+B+':canonical:v1','{}'],['taktik:theme:v1','dark'],['taktik:draft:main:v1','legacy'],['taktik:match-studio:pitch-color:v1','green'],['taktik:auth:127.0.0.1:v1','session']]);
  const session=store([['taktik:studio:recovery:'+A+':tab','x'],['taktik:studio:recovery:'+B+':tab','y']]);
  assert.equal(clearUserData({storage:local,sessionStorage:session,userId:A}),5);
  assert.deepEqual([...local.data.keys()].sort(),['taktik:auth:127.0.0.1:v1','taktik:draft:'+B+':main:v2','taktik:draft:main:v1','taktik:match-studio:pitch-color:v1','taktik:theme:v1','taktik:weekly-xi:'+B+':canonical:v1'].sort());
  assert.deepEqual([...session.data.keys()],['taktik:studio:recovery:'+B+':tab']);
  assert.deepEqual(userScopedPrefixes('not-a-uuid'),[]);assert.equal(clearUserData({storage:local,userId:''}),0);
  assert.equal(clearUserData({storage:{get length(){throw Error('blocked');}},userId:A}),0);
});

// ---------- UI ----------
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.listeners=new Map();this.textContent='';this.value='';this.disabled=false;this.open=false;this.className='';}
  append(...c){this.children.push(...c);} replaceChildren(...c){this.children=c;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==='open')this.open=true;} removeAttribute(k){delete this.attrs[k];if(k==='open')this.open=false;}
  addEventListener(e,f){this.listeners.set(e,f);} removeEventListener(e,f){if(this.listeners.get(e)===f)this.listeners.delete(e);}
  async emit(e,extra={}){let prevented=false;await this.listeners.get(e)?.({preventDefault(){prevented=true;},...extra});return prevented;}
  focus(){Node.focused=this;} showModal(){this.open=true;} close(){this.open=false;}
}
function ui({result={ok:true},onDeleted}={}){
  const calls=[],deletedCalls=[];let resolve;
  const document={createElement:tag=>new Node(tag)},root=new Node('section');
  const deleteAccount=async args=>{calls.push(args);return typeof result==='function'?result():result;};
  const page=mountAccountDeletion({document,root,deleteAccount,onDeleted:onDeleted??(async()=>{deletedCalls.push(true);})});
  const all=(n=root)=>[n,...n.children.flatMap(all)];
  const find=pred=>all().find(pred);
  const by=id=>find(n=>n.id===id),button=text=>find(n=>n.tagName==='button'&&n.textContent===text);
  const dialog=find(n=>n.tagName==='dialog'),form=find(n=>n.tagName==='form');
  const type=async(field,value)=>{by(field).value=value;await by(field).emit('input');};
  return {page,root,calls,deletedCalls,by,button,dialog,form,type,all,submit:()=>form.emit('submit')};
}

test('danger zone renders a red action that opens a modal explaining what is and is not deleted',async()=>{
  const f=ui();
  assert.equal(f.root.children[0].textContent,'Tehlikeli Bölge');
  const open=f.button('Hesabımı Sil');assert(open);assert.equal(open.className,'profile-danger-button');assert.equal(f.dialog.open,false);
  await open.emit('click');assert.equal(f.dialog.open,true);assert.equal(Node.focused,f.by('accountDeletePassword'));
  const text=f.all().map(n=>n.textContent).join('\n');
  for(const phrase of ['Kayıtlı Stüdyo çalışmaların','Haftanın İlk 11’i kayıtların','Oyuncu düzeltmelerin','Oluşturduğun paylaşım bağlantıları (artık açılmaz)','yedeklerinde ve sistem kayıtlarında','başka cihazlardaki tarayıcılarda'])assert.match(text,new RegExp(phrase.replace(/[()]/g,'\\$&')));
  assert.equal(f.by('accountDeletePassword').type,'password');assert.equal(f.by('accountDeletePassword').autocomplete,'current-password');
  f.page.dispose();assert.equal(f.root.children.length,0);
});

test('confirm stays disabled until the password and exact phrase are present; cancel and Escape send nothing',async()=>{
  const f=ui(),submit=f.button('Hesabımı kalıcı olarak sil');
  await f.button('Hesabımı Sil').emit('click');assert.equal(submit.disabled,true);
  await f.type('accountDeletePassword','secret');assert.equal(submit.disabled,true);
  for(const wrong of ['hesabimi sil','HESABIMI','HESABIMI SIL!','SIL HESABIMI'])assert.equal(confirmationMatches(wrong),false,wrong);
  await f.type('accountDeleteConfirm','hesabimi sil');assert.equal(submit.disabled,true);await f.submit();assert.equal(f.calls.length,0);
  await f.type('accountDeleteConfirm','HESABIMI SİL');assert.equal(submit.disabled,false,'Turkish İ accepted');
  await f.button('Vazgeç').emit('click');assert.equal(f.dialog.open,false);assert.equal(f.calls.length,0);
  assert.equal(f.by('accountDeletePassword').value,'');assert.equal(f.by('accountDeleteConfirm').value,'');
  await f.button('Hesabımı Sil').emit('click');await f.type('accountDeletePassword','secret');await f.type('accountDeleteConfirm','HESABIMI SIL');
  assert.equal(await f.dialog.emit('cancel'),true);assert.equal(f.dialog.open,false);assert.equal(f.calls.length,0);assert.equal(f.deletedCalls.length,0);
  f.page.dispose();
});

test('failures show clear messages, keep the account flow retryable and never report success',async()=>{
  for(const [code,pattern] of [['reauthentication_failed',/Şifre doğrulanamadı/],['unauthenticated',/Oturumun geçersiz/],['rate_limited',/Çok fazla deneme/],['delete_failed',/Hesap silinemedi/],
    ['verification_failed',/doğrulanamadı.*iletisim@taktikstudyo\.com/],['network',/silinip silinmediği doğrulanamadı/],['deletion_unavailable',/şu anda kullanılamıyor/]]){
    const f=ui({result:{ok:false,code}});
    await f.button('Hesabımı Sil').emit('click');await f.type('accountDeletePassword','secret');await f.type('accountDeleteConfirm','HESABIMI SIL');await f.submit();
    const status=f.find?.(n=>n.className==='account-delete-status')??f.all().find(n=>n.className==='account-delete-status');
    assert.match(status.textContent,pattern,code);assert.doesNotMatch(status.textContent,/silindi\. Ana sayfaya/);
    assert.equal(f.deletedCalls.length,0);assert.equal(f.by('accountDeletePassword').value,'','password cleared');
    assert.equal(f.button('Vazgeç').disabled,false);assert.equal(f.dialog.open,true);
    f.page.dispose();
  }
  const thrown=ui({result:()=>{throw Error('boom');}});
  await thrown.button('Hesabımı Sil').emit('click');await thrown.type('accountDeletePassword','x');await thrown.type('accountDeleteConfirm','HESABIMI SIL');await thrown.submit();
  assert.equal(thrown.deletedCalls.length,0);thrown.page.dispose();
});

test('success is announced only after the server confirms, then cleanup/redirect runs once',async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const f=ui({result:()=>pending});
  await f.button('Hesabımı Sil').emit('click');await f.type('accountDeletePassword','secret');await f.type('accountDeleteConfirm','HESABIMI SIL');
  const submitting=f.submit();await tick();
  const status=f.all().find(n=>n.className==='account-delete-status');
  assert.equal(status.textContent,'Hesabın siliniyor…');assert.equal(f.deletedCalls.length,0);
  assert.equal(f.button('Vazgeç').disabled,true);assert.equal(await f.dialog.emit('cancel'),true);assert.equal(f.dialog.open,true,'cannot dismiss while pending');
  await f.submit();assert.equal(f.calls.length,1,'no double submit');
  assert.deepEqual(f.calls[0],{password:'secret',confirmation:'HESABIMI SIL'});
  release({ok:true});await submitting;
  assert.match(status.textContent,/Hesabın silindi/);assert.equal(f.deletedCalls.length,1);
  assert.equal(f.button('Hesabımı kalıcı olarak sil').disabled,true);f.page.dispose();
});

test('profile template hosts the danger zone and no admin secret reaches browser code',()=>{
  const html=readFileSync(new URL('../dist/profil.html',import.meta.url),'utf8');
  const account=html.split('id="profileAccount"')[1].split('</template>')[0];
  assert.match(account,/<section id="profileDanger" class="profile-danger" aria-label="Tehlikeli bölge"><\/section>/);
  for(const file of ['src/lib/account-delete.js','src/lib/account-delete-ui.js','src/lib/profile-ui.js','src/lib/page-bootstrap.js','src/backend-entry.js']){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/SERVICE_ROLE|SECRET_KEY|sb_secret_|auth\.admin|deleteUser\(/,file);
  }
  // The bundled SDK contains the key-prefix check and its unused admin class; no real secret value may appear.
  const bundle=readFileSync(new URL('../dist/backend.js',import.meta.url),'utf8');
  assert.equal(/sb_secret_[A-Za-z0-9_-]{8,}|"service_role"|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|ACCOUNT_DELETE_SECRET_KEY/.test(bundle),false,'no secret in bundle');
  assert.equal(CONFIRMATION,ACCOUNT_DELETE_CONFIRMATION);
  const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
  assert.match(config,/\[functions\.account-delete\]\r?\n[^\[]*verify_jwt = true/);
});
