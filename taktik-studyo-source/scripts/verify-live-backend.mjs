// Live production backend verification for the authenticated-sharing architecture (PROD1.1).
//
// READ-ONLY BY DEFAULT. Default mode sends only GET/OPTIONS requests and unauthenticated or
// invalid-token POSTs to Edge Functions, which are rejected before any database access. It never
// creates, changes or deletes data, never sends a password and never performs an account deletion.
//
// Usage:
//   node scripts/verify-live-backend.mjs                 # post-release expectations (strict)
//   node scripts/verify-live-backend.mjs --pre-release   # current production (before the release)
//   node scripts/verify-live-backend.mjs --probe-writes  # ALSO send anonymous write attempts that RLS/grants
//                                                        # must reject (only with explicit approval)
//   LIVE_TEST_ACCESS_TOKEN=<jwt of a disposable confirmed account> node scripts/verify-live-backend.mjs
//                                                        # adds authenticated checks that still write nothing
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {SHARE_BYTES} from '../src/lib/validation.js';

const UUID_MISSING = '00000000-0000-4000-8000-000000000000';
const ORIGIN = 'https://taktikstudyo.com';
const sampleShare = () => ({team_name:'Backend integration test', formation:'4-3-3',
  lineup_data:{team:{name:'Backend integration test', short:'QA', color:'#123456', color2:'#abcdef'}, customized:false,
    players:Array.from({length:11}, (_, id) => ({id, name:'QA ' + id, x:50, y:50, role:'MO', number:id + 1, renamed:false}))},
  drawing_data:[]});

export async function verifyLiveBackend({url, key, expectedRef, fetchImpl = fetch, preRelease = false, probeWrites = false, accessToken = null, log = console.log}) {
  const host = new URL(url).hostname;
  if (expectedRef && host !== `${expectedRef}.supabase.co`) throw new Error(`Refusing to run: ${host} is not the expected project ${expectedRef}`);
  const results = [];
  const record = (status, name, detail = '') => {results.push({status, name, detail}); log(`${status}: ${name}${detail ? ' (' + detail + ')' : ''}`);};
  const check = (name, ok, detail) => record(ok ? 'PASS' : 'FAIL', name, detail);
  const skip = (name, reason) => record('NOT RUN', name, reason);
  const request = (path, {method = 'GET', headers = {}, body} = {}) => {
    const h = new Headers({apikey:key, origin:ORIGIN, 'Content-Type':'application/json'});
    for (const [k, v] of Object.entries(headers)) {if (v === null) h.delete(k); else h.set(k, v);}
    return fetchImpl(url + path, {method, headers:h, body, redirect:'manual'});
  };
  const status = async (path, options) => (await request(path, options)).status;

  // 1. Catalogue reads. SEC1: the legacy FotMob-sourced tables are not readable without a session.
  for (const table of ['teams', 'players']) {
    const s = await status(`/rest/v1/${table}?select=id&limit=1`);
    if (preRelease && s === 200) skip(`legacy ${table} not anonymously readable`, 'SEC1 not applied: anonymous read still OPEN');
    else check(`legacy ${table} not anonymously readable`, s === 401 || s === 403, String(s));
  }
  // SEC1.1: the BSD catalogue is signed-in only (its row count is checked with LIVE_TEST_ACCESS_TOKEN).
  for (const table of ['catalogue_teams', 'catalogue_players']) {
    const s = await status(`/rest/v1/${table}?select=id&limit=1`);
    if (preRelease && s === 404) skip(`canonical ${table} not anonymously readable`, 'not deployed yet');
    else if (preRelease && s === 200) skip(`canonical ${table} not anonymously readable`, 'hardening not applied: anonymous read OPEN');
    else check(`canonical ${table} not anonymously readable`, s === 401 || s === 403, String(s));
  }
  for (const path of ['/rest/v1/shared_lineups?select=public_id&limit=1', '/rest/v1/profiles?select=id&limit=1']) {
    const s = await status(path);
    // shared_lineups has no anon grant (401/403); profiles has no anon grant either.
    check(`anonymous read denied: ${path.split('?')[0]}`, [401, 403].includes(s), String(s));
  }

  // 2. Anonymous write attempts (opt-in; each must be rejected by grants/RLS).
  if (probeWrites) {
    const probes = [
      ['/rest/v1/teams', 'POST', {id:'integration-probe', name:'Integration probe', short_name:'QA', color_primary:'#123456', color_secondary:'#abcdef'}],
      ['/rest/v1/players?id=eq.integration-probe', 'PATCH', {name:'Integration probe'}],
      ['/rest/v1/shared_lineups', 'POST', {team_name:'Integration probe', formation:'4-3-3', lineup_data:{}, drawing_data:[]}],
      ['/rest/v1/shared_lineups?public_id=eq.' + UUID_MISSING, 'DELETE'],
      ['/rest/v1/catalogue_teams', 'POST', {id:'integration-probe', display_name:'Probe', short_name:'QA', color_primary:'#123456', color_secondary:'#abcdef'}],
      ['/rest/v1/rpc/create_shared_lineup', 'POST', {payload:{}, client_bucket:'a'.repeat(64), owner:UUID_MISSING}],
    ];
    for (const [path, method, body] of probes) {
      const s = await status(path, {method, body:body ? JSON.stringify(body) : undefined});
      // Before the release the canonical table and the 3-argument RPC do not exist yet (404).
      const notYet = preRelease && (path.includes('catalogue_teams') || path.includes('/rpc/'));
      check(`anonymous ${method} rejected: ${path.split('?')[0]}`, [401, 403, ...(notYet ? [404] : [])].includes(s), String(s));
    }
    // The removed two-argument RPC must no longer exist after the release.
    const legacy = await status('/rest/v1/rpc/create_shared_lineup', {method:'POST', body:JSON.stringify({payload:{}, client_bucket:'a'.repeat(64)})});
    if (preRelease) check('legacy 2-arg RPC still protected (pre-release)', [401, 403].includes(legacy), String(legacy));
    else check('legacy 2-arg RPC removed', legacy === 404, String(legacy));
  } else skip('anonymous write probes', 'pass --probe-writes with explicit approval');

  // 3. lineups Edge Function.
  const lineups = '/functions/v1/lineups';
  const preflight = await request(lineups, {method:'OPTIONS'});
  check('lineups preflight 204 for production origin', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === ORIGIN, String(preflight.status));
  const allowed = preflight.headers.get('access-control-allow-headers') || '';
  if (preRelease) skip('lineups allows authorization header', 'old lineups deployed');
  else check('lineups allows authorization header', allowed === 'apikey, authorization, content-type, x-bot-token', allowed);
  check('lineups sharing configured (Turnstile secret present)', preflight.headers.get('x-sharing-ready') === 'true');
  check('lineups unknown share 404', await status(lineups + '?id=' + UUID_MISSING) === 404);
  check('lineups invalid id 400', await status(lineups + '?id=not-a-uuid') === 400);
  check('lineups foreign origin 403', await status(lineups, {method:'POST', body:'{}', headers:{origin:'https://evil.test'}}) === 403);
  check('lineups wrong apikey 401', await status(lineups, {method:'POST', body:'{}', headers:{apikey:'wrong'}}) === 401);
  const anonymousShare = await status(lineups, {method:'POST', body:JSON.stringify(sampleShare())});
  if (preRelease) check('lineups anonymous POST rejected without bot token (old contract)', anonymousShare === 403, String(anonymousShare));
  else check('lineups anonymous POST rejected (login required)', anonymousShare === 401, String(anonymousShare));
  if (!preRelease) check('lineups invalid bearer rejected', await status(lineups, {method:'POST', body:JSON.stringify(sampleShare()), headers:{authorization:'Bearer invalid'}}) === 401);

  // 4. account-delete and matches Edge Functions (absent before the release).
  for (const [name, path] of [['account-delete', '/functions/v1/account-delete'], ['matches', '/functions/v1/matches']]) {
    const options = await request(path, {method:'OPTIONS', headers:{'access-control-request-method':name === 'matches' ? 'GET' : 'POST'}});
    if (preRelease && options.status === 404) {skip(`${name} function`, 'not deployed yet'); continue;}
    check(`${name} preflight allows production origin`, options.status === 204 && options.headers.get('access-control-allow-origin') === ORIGIN, String(options.status));
    const method = name === 'matches' ? 'GET' : 'POST', body = method === 'POST' ? '{}' : undefined;
    check(`${name} without session 401`, await status(path, {method, body}) === 401);
    check(`${name} invalid bearer 401`, await status(path, {method, body, headers:{authorization:'Bearer invalid'}}) === 401);
  }

  // 5. Authenticated checks (disposable confirmed account token). Still writes nothing.
  if (!accessToken) skip('authenticated checks', 'set LIVE_TEST_ACCESS_TOKEN for a disposable confirmed account');
  else {
    const auth = {authorization:'Bearer ' + accessToken};
    // The legacy board catalogue still loads for signed-in users until the BSD cutover.
    for (const table of ['teams', 'players']) {
      const s = await status(`/rest/v1/${table}?select=id&limit=1`, {headers:auth});
      check(`legacy ${table} readable when signed in`, s === 200, String(s));
    }
    const teams = await request('/rest/v1/catalogue_teams?select=id&catalogue_active=eq.true', {headers:auth});
    if (preRelease && teams.status === 404) skip('canonical catalogue_teams (signed in)', 'not deployed yet');
    else {
      let n = -1; try {if (teams.status === 200) n = (await teams.json()).length;} catch {}
      check('canonical catalogue_teams has 18 active teams (signed in)', n === 18, String(teams.status) + '/' + n);
    }
    const share = sampleShare();
    const cases = [
      [400, JSON.stringify({...share, unexpected:true}), {}],
      [400, JSON.stringify({...share, formation:'99-1'}), {}],
      [413, ' '.repeat(SHARE_BYTES + 1), {}],
      [415, '{}', {'Content-Type':'text/plain'}],
      [403, JSON.stringify(share), {}],                        // valid payload, no bot token: rejected, nothing stored
      [403, JSON.stringify(share), {'x-bot-token':'invalid'}],
    ];
    for (const [expected, raw, headers] of cases) {
      const s = await status(lineups, {method:'POST', body:raw, headers:{...auth, ...headers}});
      check(`lineups authenticated POST ${expected}`, s === expected, String(s));
    }
    // Wrong confirmation is rejected before password verification: no deletion path is reachable.
    const del = await request('/functions/v1/account-delete', {method:'POST', headers:auth, body:JSON.stringify({password:'not-used', confirmation:'not the phrase'})});
    if (preRelease && del.status === 404) skip('account-delete confirmation guard', 'not deployed yet');
    else check('account-delete wrong confirmation 400 (no deletion)', del.status === 400, String(del.status));
    const matches = await request('/functions/v1/matches', {headers:auth});
    if (preRelease && matches.status === 404) skip('matches season (authenticated)', 'not deployed yet');
    else {
      let ok = false; try {const data = await matches.json(); ok = matches.status === 200 && data?.season === '2026-2027' && Array.isArray(data.matches);} catch {}
      check('matches season (authenticated)', ok, String(matches.status));
    }
  }
  log('NOT RUN: successful share creation and account deletion are never automated against production.');
  const failed = results.filter(r => r.status === 'FAIL').length;
  log(`SUMMARY: ${results.filter(r => r.status === 'PASS').length} passed, ${failed} failed, ${results.filter(r => r.status === 'NOT RUN').length} not run`);
  return {results, failed};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.loadEnvFile(new URL('../.env', import.meta.url));
  const project = JSON.parse(readFileSync(new URL('../supabase/project.json', import.meta.url), 'utf8'));
  const args = new Set(process.argv.slice(2));
  const {failed} = await verifyLiveBackend({url:process.env.SUPABASE_URL, key:process.env.SUPABASE_PUBLISHABLE_KEY, expectedRef:project.project_id,
    preRelease:args.has('--pre-release'), probeWrites:args.has('--probe-writes'), accessToken:process.env.LIVE_TEST_ACCESS_TOKEN || null});
  process.exitCode = failed ? 1 : 0;
}
