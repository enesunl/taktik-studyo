import { supabase, publicConfig } from './lib/supabase.js';
import { auth } from './lib/auth.js';
import { createCatalogueSource } from './lib/catalogue-source.js';
import { readDraft, writeDraft } from './lib/drafts.js';
import { shareValid, toShare, SHARE_BYTES } from './lib/validation.js';
import { createSharingUI } from './lib/sharing-ui.js';
import { createAuthPageApi } from './lib/auth-page-api.js';
import { mountAuthPage } from './lib/auth-ui.js';
import { mountRecoveryPage } from './lib/recovery-ui.js';
import { startPage } from './lib/page-bootstrap.js';
import { resolvePage } from './lib/page-routes.js';
import { createAccountDeletion } from './lib/account-delete.js';
const authPage = document.body?.dataset.authPage;
if (['login','register','callback','forgot','reset'].includes(authPage)) {
  const mount = ['forgot','reset'].includes(authPage) ? mountRecoveryPage : mountAuthPage;
  mount({document,location:window.location,history:window.history,eventTarget:window,page:authPage,
    api:createAuthPageApi({auth,client:supabase,origin:window.location.origin,
      captchaConfigured:typeof __AUTH_TURNSTILE_SITE_KEY__ === 'string' && !!__AUTH_TURNSTILE_SITE_KEY__})});
}
function prepareShare(state){
  const payload=toShare(state),body=JSON.stringify(payload);
  if(!shareValid(payload)||new TextEncoder().encode(body).length>SHARE_BYTES)throw new Error('Kadro veya çizim paylaşım sınırını aşıyor.');
  return body;
}
function status(message) {
  let el=document.getElementById('dataStatus');
  if(!el){el=document.createElement('p');el.id='dataStatus';el.className='data-status';el.setAttribute('role','status');document.querySelector('header')?.after(el);}
  el.textContent=message;
}
window.TAKTIK_DRAFTS={
  read(key){try{return readDraft(window.localStorage,key);}catch{return null;}},
  write(key,state){let ok=false;try{ok=writeDraft(window.localStorage,key,state);}catch{}if(!ok)status('Taslak bu tarayıcıya kaydedilemedi. Açık kadro üzerinde çalışmaya devam edebilirsin.');return ok;}
};
const catalogue=createCatalogueSource({config:window.TAKTIK_CATALOGUE_CONFIG,client:supabase,window});
let catalogueReady = null;
window.TAKTIK_BACKEND={
  enabled:!!supabase,
  source:supabase?'loading':'fallback',
  validateShare:prepareShare,
  ready:Promise.resolve(),
  catalogue,
  loadCatalogue(){
    if (!supabase&&!catalogue.canonical) return Promise.resolve();
    if (!catalogueReady) catalogueReady=catalogue.load().then(()=>{
      window.TAKTIK_BACKEND.source='supabase';
    }).catch(error=>{catalogueReady=null;if(catalogue.canonical){window.TAKTIK_BACKEND.source='error';status('Takım kataloğu şu anda yüklenemedi. Tekrar dene.');throw error;}window.TAKTIK_BACKEND.source='fallback';status('Güncel kadrolar alınamadı. Kayıtlı takım listesiyle çalışıyorsun.');});
    window.TAKTIK_BACKEND.ready=catalogueReady;
    return catalogueReady;
  },
  async sharingReady(){
    if(catalogue.canonical)return false;
    if(!supabase)return false;
    const response=await fetch(publicConfig.url+'/functions/v1/lineups',{method:'OPTIONS',headers:{apikey:publicConfig.key},signal:AbortSignal.timeout(8000)});
    return response.ok && response.headers.get('X-Sharing-Ready')==='true';
  },
  async saveLineup(state,token){
    if(catalogue.canonical)throw new Error('Yerel katalog modunda paylaşım yayımlanmaz.');
    if(!supabase)throw new Error('Paylaşım henüz etkin değil.');
    if(typeof token!=='string'||!token||token.length>2048)throw new Error('Önce güvenlik doğrulamasını tamamla.');
    const body=prepareShare(state);
    // ACCOUNT1: shares are owned by the signed-in account; the server derives the owner from this JWT.
    let access=null;try{access=(await supabase.auth.getSession()).data?.session?.access_token||null;}catch{}
    if(!access)throw new Error('Paylaşmak için giriş yapmalısın.');
    const response=await fetch(publicConfig.url+'/functions/v1/lineups',{
      method:'POST',headers:{'Content-Type':'application/json',apikey:publicConfig.key,Authorization:'Bearer '+access,'x-bot-token':token},body,signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw new Error(response.status===429?'Çok sık paylaşım yapıldı. Biraz sonra tekrar dene.':'Kadro paylaşılamadı.');
    const result=await response.json();
    if(!/^[0-9a-f-]{36}$/.test(result.public_id))throw new Error('Kadro paylaşılamadı.');
    return result.public_id;
  },
  async readLineup(id){
    if(!supabase||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw new Error('Geçersiz paylaşım bağlantısı.');
    const response=await fetch(publicConfig.url+'/functions/v1/lineups?id='+id,{headers:{apikey:publicConfig.key},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Paylaşılmış kadro bulunamadı.');
    const payload=await response.json();if(!shareValid(payload))throw new Error('Kadro yüklenemedi.');
    return {team:payload.lineup_data.team,formation:payload.formation,customized:payload.lineup_data.customized,players:payload.lineup_data.players,drawings:payload.drawing_data};
  }
};
window.TAKTIK_SHARE=createSharingUI(window.TAKTIK_BACKEND,__TURNSTILE_SITE_KEY__);
if (!authPage && document.body) {
  // Classic defer scripts finish in document order before DOMContentLoaded.
  // Auth callback/recovery sanitization above stays synchronous, before any await.
  let lifecycle;
  const start = () => {lifecycle?.dispose?.();lifecycle=startPage({auth,document,window,backend:window.TAKTIK_BACKEND,client:supabase,
    accountDeletion:supabase?createAccountDeletion({client:supabase,url:publicConfig.url,key:publicConfig.key}):null});};
  if (document.readyState === 'loading' || document.readyState === 'interactive')
    document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.addEventListener('pageshow',event=>{
    if(event.persisted && ['protected','landing'].includes(resolvePage(window.location).kind))start();
  });
}
