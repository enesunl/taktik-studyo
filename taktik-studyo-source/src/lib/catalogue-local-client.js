// Explicit local-only transport. Auth remains on the existing Auth client.
// All catalogue-mode data mutations terminate in the loopback PGlite server.
export function createLocalCatalogueClient({auth,origin,fetchImpl=fetch}){
 const url=new URL(origin);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname))throw Error('local_catalogue_required');
 async function request(action,input={}){
  const {data,error}=await auth.getSession();
  if(error||!data?.session?.access_token)throw Error('auth_unavailable');
  const r=await fetchImpl('/__local/catalogue',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},
   body:JSON.stringify({action,...input}),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error('catalogue_unavailable');return r.json();
 }
 return {request,from(table){
  const query={table,operation:'select',columns:'*',filters:[],orders:[],limit:1000,offset:0,single:false};
  const q={select(v){query.columns=v;return q;},eq(k,v){query.filters.push([k,'eq',v]);return q;},gt(k,v){query.filters.push([k,'gt',v]);return q;},
   like(k,v){query.filters.push([k,'like',v]);return q;},order(k,o={}){query.orders.push([k,o.ascending!==false]);return q;},limit(n){query.limit=n;return q;},range(a,b){query.offset=a;query.limit=b-a+1;return q;},maybeSingle(){query.single=true;return q;},
   insert(v){query.operation='insert';query.values=v;return q;},update(v){query.operation='update';query.values=v;return q;},delete(){query.operation='delete';return q;},
   then(resolve,reject){return request('query',{query}).then(resolve,reject);}};return q;
 }};
}
