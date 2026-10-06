// Development only. No remote commands, config overrides or server keys.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const cwd=fileURLToPath(new URL('../',import.meta.url));
export function assertLocalUrl(value){
 if(typeof value!=='string'||!/^http:\/\/(127\.0\.0\.1|localhost):[1-9][0-9]{0,4}$/.test(value))throw Error('Local development requires a loopback Supabase URL; hosted/production targets are forbidden.');
 const u=new URL(value);if(Number(u.port)<1||Number(u.port)>65535)throw Error('Invalid local Supabase port.');return value;
}
export function assertLocalPublicKey(key){
 if(typeof key==='string'&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return key;
 // Some local CLI stacks expose a legacy anon JWT. Never accept service_role.
 try{
  const parts=key.split('.');
  if(parts.length===3&&parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p))&&JSON.parse(Buffer.from(parts[1],'base64url')).role==='anon')return key;
 }catch{}
 throw Error('Local Supabase public/anon key is unavailable or invalid.');
}
export function localConfigFromStatus(status){
 return Object.freeze({url:assertLocalUrl(status?.API_URL),key:assertLocalPublicKey(status?.PUBLISHABLE_KEY||status?.ANON_KEY)});
}
export async function readLocalStatus(){
 try{
  const {stdout}=await exec(process.execPath,[fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js',import.meta.url)),'status','-o','json'],
   {cwd,env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'},windowsHide:true,timeout:20000,maxBuffer:1024*1024});
  return JSON.parse(stdout);
 }catch{throw Error('Local Supabase is not available. Run `npx supabase start` before starting the app.');}
}
export async function loadLocalSupabase({env=process.env,readStatus=readLocalStatus,fetchImpl=fetch}={}){
 // .env is production build input, deliberately not loaded by the local server.
 // An explicit process/.env.local override must not sneak a remote target in.
 if(env.SUPABASE_URL)assertLocalUrl(env.SUPABASE_URL);
 const config=localConfigFromStatus(await readStatus());
 if(env.SUPABASE_URL&&env.SUPABASE_URL!==config.url)throw Error('Local URL override does not match Supabase CLI status.');
 if(env.SUPABASE_PUBLISHABLE_KEY&&env.SUPABASE_PUBLISHABLE_KEY!==config.key)throw Error('Local key override does not match Supabase CLI status.');
 try{
  const r=await fetchImpl(config.url+'/auth/v1/health',{headers:{apikey:config.key},signal:AbortSignal.timeout(4000),redirect:'error'});
  if(!r.ok)throw Error();
  const health=await r.json();if(typeof health.version!=='string')throw Error();
 }catch{throw Error('Local Supabase Auth is not available. Run `npx supabase start` before starting the app.');}
 return config;
}
