// Local-only server: static dist + one fixed authenticated matches QA transport.
// In-memory LOCAL browser build only; no production mutation or deployment.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../dist');
async function createLocalServer({config,port=4173,catalogueSource='canonical',catalogueTransport='local',token,serverKey}={}) {
const {assertLocalUrl,assertLocalPublicKey}=await import('./local-supabase.mjs');
assertLocalUrl(config?.url);assertLocalPublicKey(config?.key);
if(!['legacy','canonical'].includes(catalogueSource))throw Error('Invalid catalogue source');
// PROD1.5: 'supabase' reads the canonical catalogue from Supabase Local tables (as hosted does);
// the local server key is used only inside this process for the matches canonical model.
if(!['local','supabase'].includes(catalogueTransport)||catalogueTransport==='supabase'&&(catalogueSource!=='canonical'||!serverKey))throw Error('Invalid catalogue transport');
const viaSupabase=catalogueTransport==='supabase';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const {buildBrowserBackend}=await import('./backend-build.mjs');
// Only this in-memory bundle is served locally. dist/backend.js remains production.
const localBundle=await buildBrowserBackend({...config,local:true,catalogueSource});
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
let matchesHandler;
let catalogueService;
function catalogue(){
 if(!catalogueService)catalogueService=(async()=>{
  const {createClient}=await import('@supabase/supabase-js');
  const {createLocalCatalogueService}=await import('./catalogue/local-service.mjs');
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return createLocalCatalogueService({dataDir:path.resolve(__dirname,'../.local/catalogue-d4'),port,token,
   authenticate:async jwt=>{const {data,error}=await client.auth.getUser(jwt);return error?null:data.user;}});
 })().catch(e=>{catalogueService=null;throw e;});
 return catalogueService;
}
async function localMatches(req,res) {
  try {
    // Loopback binding plus exact Host prevents DNS-rebinding callers. Origin
    // enforcement and bearer verification are also applied by the real handler.
    if (!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)) throw Error();
    if (!matchesHandler) {
      const {createLocalMatches} = await import('./local-matches.mjs');
      let canonical,load,loadDetail;
      if(viaSupabase){
        const {createClient}=await import('@supabase/supabase-js');
        const {createCanonicalMatches,readCatalogueState}=await import('../supabase/functions/matches/canonical.js');
        const server=createClient(config.url,serverKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        canonical=loaders=>createCanonicalMatches({loadState:()=>readCatalogueState(server),...loaders});
      }else if(catalogueSource==='canonical'){
        const provider=await catalogue();({loadSeason:load,loadDetail}=provider);
        canonical=()=>({events:async data=>({...data,matches:data.matches.map(m=>provider.canonicalEvent(m))}),match:data=>provider.canonicalMatch(data)});
      }
      matchesHandler = createLocalMatches({load,loadDetail,canonical,url:config.url,key:config.key,token,port});
    }
    const response = await matchesHandler(new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers}));
    res.writeHead(response.status,{...Object.fromEntries(response.headers),'Cache-Control':'no-store'});
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:{code:'matches_unavailable'}}));
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(403);res.end();return;}
  if((req.url||'').split('?')[0]==='/__local/catalogue'){
   if(catalogueSource!=='canonical'||viaSupabase||!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(403);res.end();return;}
   try{
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw Error();chunks.push(chunk);}
    const response=await (await catalogue()).handle(new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'catalogue_unavailable'}}));}return;
  }
  if(req.url==='/__local/catalogue-config.js'){
   if(catalogueSource!=='canonical'||!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':'text/javascript'});res.end('window.TAKTIK_CATALOGUE_CONFIG=Object.freeze({source:"canonical"'+(viaSupabase?',transport:"supabase"':'')+'});');return;
  }
  if ((req.url || '').split('?')[0] === '/__local/matches') return localMatches(req,res);
  const end = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return end(405, 'Method not allowed');
  }
  let pathname;
  try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { return end(400, 'Invalid path'); }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':') || pathname.split('/').some(part=>part==='..'||/[. ]$/.test(part))) return end(403, 'Forbidden');
  // Match the existing dist/_redirects route without changing application code.
  if (pathname === '/' || pathname.startsWith('/lineup/')) pathname = '/index.html';
  // Mirror the exact extensionless protected routes served by static hosting.
  if (['/ilk-11lerim','/hos-geldin','/haftanin-ilk-11i','/studyo','/karsilastirma','/profil','/maclar','/mac','/mac-studyosu','/calismalarim'].includes(pathname)) pathname += '.html';
  const file = path.resolve(root, '.' + pathname);
  // Check the resolved path too: percent-encoded asset names must never expose
  // the hosted production bundle from dist.
  if(file.toLowerCase()===path.join(root,'backend.js').toLowerCase()){
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Content-Length':localBundle.length});
    res.end(req.method==='HEAD'?undefined:Buffer.from(localBundle));return;
  }
  try {
    const real = await fs.realpath(file);
    const relative = path.relative(root, real);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return end(403, 'Forbidden');
    const stat = await fs.stat(real);
    if (!stat.isFile()) return end(404, 'Not found');
    let data = req.method === 'HEAD' ? null : await fs.readFile(real);
    if(data&&catalogueSource==='canonical'&&path.extname(real)==='.html'){
      data=Buffer.from(data.toString('utf8').replace('</head>','<script src="/__local/catalogue-config.js"></script></head>')
       .replace(/<script src="rosters\.js" defer><\/script>/g,'').replace(/<div class="source-note">[\s\S]*?<\/div>/g,'<div class="source-note">Takım kataloğu · Taktik Stüdyo</div>'));
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(real)] || 'application/octet-stream', ...(!data?{'Content-Length':stat.size}:{'Content-Length':data.length}) });
    res.end(data);
  } catch { end(404, 'Not found'); }
});
return server;
}
module.exports={createLocalServer};
if(require.main===module){
 (async()=>{
  // .env belongs to production builds; only ignored .env.local is read here.
  const localEnv=path.resolve(__dirname,'../.env.local');
  if(require('node:fs').existsSync(localEnv))process.loadEnvFile(localEnv);
  const {loadLocalSupabase}=await import('./local-supabase.mjs');
  const config=await loadLocalSupabase();
  const port=Number(process.argv[2]||4173);
  // CATALOGUE_TRANSPORT=supabase: read the imported catalogue from Supabase Local tables. The local
  // server key comes from `supabase status`, is checked against the same loopback URL and stays here.
  const catalogueTransport=process.env.CATALOGUE_TRANSPORT||'local';let serverKey;
  if(catalogueTransport==='supabase'){
   const {readLocalStatus}=await import('./local-supabase.mjs');const status=await readLocalStatus();
   if(status.API_URL!==config.url)throw Error('Local Supabase status changed; restart the server.');
   serverKey=status.SECRET_KEY||status.SERVICE_ROLE_KEY;
  }
  const server=await createLocalServer({config,port,catalogueSource:process.env.CATALOGUE_SOURCE||'canonical',catalogueTransport,serverKey,token:process.env.BSD_API_TOKEN});
  server.on('error',error=>{console.error('Local server could not start: '+error.code);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Taktik Studyo: http://localhost:${port} — Supabase Local: ${config.url} (Ctrl+C to stop)`));
 })().catch(error=>{console.error(error.message);process.exitCode=1;});
}
