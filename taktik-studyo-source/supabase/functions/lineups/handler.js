import { shareValid, SHARE_BYTES } from '../../../src/lib/validation.js';
export class RequestError extends Error { constructor(status){super('Request rejected');this.status=status;} }
export async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||'')) throw new RequestError(415);
  if (request.headers.get('content-encoding') && request.headers.get('content-encoding')!=='identity') throw new RequestError(415);
  const length=request.headers.get('content-length');
  if(length && (!/^\d+$/.test(length)||Number(length)>SHARE_BYTES))throw new RequestError(413);
  if(!request.body)throw new RequestError(400);
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>SHARE_BYTES){await reader.cancel();throw new RequestError(413);}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new RequestError(400);}
  if(!shareValid(data))throw new RequestError(400);
  return data;
}
export function createHandler({client, origins, publicKey, rateSalt, sharingReady=false, verifyBot=async()=>false}) {
  return async request=>{
    const origin=request.headers.get('origin');
    const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
    if(!origin || !origins.includes(origin))return reply(403,{error:'İstek kabul edilmedi.'});
    headers['Access-Control-Allow-Origin']=origin;
    headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers']='apikey, content-type, x-bot-token';
    headers['Access-Control-Expose-Headers']='X-Sharing-Ready';
    headers['X-Sharing-Ready']=String(sharingReady);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    // This identifies the app, not a person and is NOT an anti-bot secret.
    if(!publicKey || request.headers.get('apikey')!==publicKey)return reply(401,{error:'İstek kabul edilmedi.'});
    if(!['GET','POST'].includes(request.method))return reply(405,{error:'Yöntem desteklenmiyor.'});
    try{
      const url=new URL(request.url);
      if(request.method==='GET'){
        if([...url.searchParams.keys()].some(k=>k!=='id') || url.searchParams.getAll('id').length!==1)throw new RequestError(400);
        const id=url.searchParams.get('id');
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw new RequestError(400);
        const result=await client.from('shared_lineups').select('team_name,formation,lineup_data,drawing_data,expires_at').eq('public_id',id).maybeSingle();
        if(result.error)throw new Error('Database unavailable');
        if(!result.data || (result.data.expires_at && Date.parse(result.data.expires_at)<=Date.now()))return reply(404,{error:'Kadro bulunamadı.'});
        const {expires_at,...payload}=result.data;
        return reply(200,payload);
      }
      if(url.search)throw new RequestError(400);
      const payload=await readJson(request);
      if(!await verifyBot(request))return reply(403,{error:'İstek kabul edilmedi.'});
      if(!rateSalt)throw new Error('Rate limiter not configured');
      // IP is never part of the saved lineup. Hashes rotate each day.
      // Global DB quotas remain effective even if a forwarded address is spoofed.
      const address=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,128);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rateSalt+':'+new Date().toISOString().slice(0,10)+':'+address));
      const bucket=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      const result=await client.rpc('create_shared_lineup',{payload,client_bucket:bucket});
      if(result.error)throw new Error('Database unavailable');
      if(!result.data){headers['Retry-After']='600';return reply(429,{error:'Paylaşım sınırına ulaşıldı.'});}
      return reply(201,{public_id:result.data});
    }catch(error){return reply(error instanceof RequestError?error.status:503,{error:error instanceof RequestError?'Geçersiz paylaşım isteği.':'İşlem şu anda tamamlanamıyor.'});}
  };
}
