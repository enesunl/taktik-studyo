// ACCOUNT1 LOCAL integration check for the account-delete Edge Function.
// Supabase Local only: aborts unless the CLI reports a loopback API. Creates two disposable users,
// exercises rejection paths and one real deletion, then removes the surviving disposable user.
// Prerequisites: `supabase start`, local migrations applied (`supabase migration up --local`) and the
// function served locally with the local origin allowed, e.g. an ignored env file containing
// ACCOUNT_DELETE_ALLOWED_ORIGINS=http://localhost:4173 and
// `supabase functions serve account-delete --env-file <that file>`. The production default allows only
// https://taktikstudyo.com, so without this every call is rejected with 403.
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertLocalUrl} from './local-supabase.mjs';
import {createClient} from '@supabase/supabase-js';
import {snapshot as projectSnapshot} from '../tests/helpers/studio-project-fixture.mjs';
import {emptyWeeklyXI,pickWeeklyPlayer} from '../src/lib/weekly-xi.js';
import {toShare} from '../src/lib/validation.js';

// Same CLI invocation as scripts/local-supabase.mjs (pinned package, no shell).
const cliScript = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
const raw = execFileSync(process.execPath, [cliScript, 'status', '-o', 'json'], {cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', env:{...process.env, SUPABASE_TELEMETRY_DISABLED:'1'}});
const status = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
const api = new URL(assertLocalUrl(status.API_URL));
const url = api.origin, publishable = status.PUBLISHABLE_KEY || status.ANON_KEY, secret = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
const options = {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}};
const admin = createClient(url, secret, options);
const OWNED = [['profiles','id'],['studio_projects','user_id'],['player_overrides','user_id'],['weekly_lineups','user_id'],['shared_lineups','owner_id']];
const endpoint = url + '/functions/v1/account-delete', origin = 'http://localhost:4173';
const results = [];
const check = (name, ok, detail = '') => {results.push({name, ok, detail}); if (!ok) throw new Error(`FAILED: ${name} ${detail}`);};
const call = (token, body, extraHeaders = {}) => fetch(endpoint, {method:'POST', headers:{origin, apikey:publishable, 'content-type':'application/json', ...(token ? {authorization:'Bearer ' + token} : {}), ...extraHeaders}, body:JSON.stringify(body)});
const counts = async userId => Object.fromEntries(await Promise.all(OWNED.map(async ([table, column]) => {
  const {count, error} = await admin.from(table).select(column, {count:'exact', head:true}).eq(column, userId);
  if (error) throw error; return [table, count];
})));
const sum = c => Object.values(c).reduce((a, b) => a + b, 0);

const run = randomBytes(4).toString('hex'), password = 'Disposable-' + randomBytes(8).toString('hex');
const users = {};
try {
  for (const name of ['a', 'b']) {
    const {data, error} = await admin.auth.admin.createUser({email:`account-delete-${name}-${run}@example.test`, password, email_confirm:true});
    if (error) throw error;
    users[name] = data.user;
    const id = data.user.id;
    const weekly = pickWeeklyPlayer(emptyWeeklyXI(), 1, {id, teamId:'galatasaray', name:'Test Player', teamName:'Galatasaray', number:10, positionGroup:'M', specificPosition:'AM', color:'#a61931', color2:'#f5bd28'});
    const share = toShare({team:{name:'Test', short:'T', color:'#123456', color2:'#abcdef'}, formation:'4-3-3', customized:false, players:Array.from({length:11}, (_, i) => ({id:i, name:'Test ' + i, x:50, y:50, number:i + 1, role:'MO', renamed:false})), drawings:[]});
    for (const [table, row] of [['profiles', {id, username:`del_${name}_${run}`}], ['studio_projects', {user_id:id, title:'Disposable', snapshot_version:1, snapshot:projectSnapshot()}],
      ['player_overrides', {user_id:id, player_key:'local:disposable', name:'Ad', role:'KL'}]]) {
      const {error: insertError} = await admin.from(table).insert(row); if (insertError) throw insertError;
    }
    // Weekly XI is written by the signed-in owner, exactly like the app (its validator is granted to authenticated).
    const owner = createClient(url, publishable, options);
    const {error: signInError} = await owner.auth.signInWithPassword({email:data.user.email, password});
    if (signInError) throw signInError;
    const {error: weeklyError} = await owner.from('weekly_lineups').insert({user_id:id, title:'XI', season:'2026/27', week:8, formation:weekly.formation, snapshot:weekly});
    if (weeklyError) throw weeklyError;
    const {error: shareError} = await admin.rpc('create_shared_lineup', {payload:share, client_bucket:randomBytes(32).toString('hex'), owner:id});
    if (shareError) throw shareError;
  }
  const sessionFor = async user => {
    const client = createClient(url, publishable, options);
    const {data, error} = await client.auth.signInWithPassword({email:user.email, password});
    if (error) throw error; return data.session.access_token;
  };
  const tokenA = await sessionFor(users.a), tokenB = await sessionFor(users.b);
  const before = {a:await counts(users.a.id), b:await counts(users.b.id)};
  check('seeded owned rows', sum(before.a) === 5 && sum(before.b) === 5, JSON.stringify(before));
  const good = {password, confirmation:'HESABIMI SIL'};

  check('missing session rejected', (await call(null, good)).status === 401);
  check('garbage token rejected', (await call('not-a-jwt', good)).status === 401);
  check('disallowed origin rejected', (await call(tokenA, good, {origin:'https://evil.test'})).status === 403);
  check('wrong password rejected', (await call(tokenA, {password:'wrong-password', confirmation:'HESABIMI SIL'})).status === 403);
  check('wrong confirmation rejected', (await call(tokenA, {password, confirmation:'hesabimi sil'})).status === 400);
  const targeted = await call(tokenA, {...good, user_id:users.b.id});
  check('foreign user id rejected', targeted.status === 400, String(targeted.status));
  const revoked = await sessionFor(users.a);
  await admin.auth.admin.signOut(revoked, 'local');
  // Wrong password on purpose: a revoked session must fail before password verification is relevant.
  const revokedResponse = await call(revoked, {password:'wrong-password', confirmation:'HESABIMI SIL'});
  check('revoked session rejected', revokedResponse.status === 401, String(revokedResponse.status));
  check('rejections preserved all data', sum(await counts(users.a.id)) === 5 && sum(await counts(users.b.id)) === 5);

  const deleted = await call(tokenA, good);
  const body = await deleted.json();
  check('owner deletion succeeded', deleted.status === 200 && body.deleted === true, JSON.stringify(body));
  check('all owned rows removed', sum(await counts(users.a.id)) === 0, JSON.stringify(await counts(users.a.id)));
  const {data: gone} = await admin.auth.admin.getUserById(users.a.id);
  check('auth user removed', !gone?.user);
  check('other account untouched', sum(await counts(users.b.id)) === 5, JSON.stringify(await counts(users.b.id)));
  check('deleted session cannot be reused', (await call(tokenA, good)).status === 401);
  check('B token still valid for B only', !!tokenB);
  delete users.a;
} finally {
  // Remove any disposable account that still exists (cascade cleans its rows).
  for (const user of Object.values(users)) await admin.auth.admin.deleteUser(user.id).catch(() => {});
  console.log(JSON.stringify({run, results}, null, 1));
}
