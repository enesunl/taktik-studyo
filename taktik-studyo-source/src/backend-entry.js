import { supabase, publicConfig } from './lib/supabase.js';
import { auth } from './lib/auth.js';
import { createCatalogue } from './lib/catalogue.js';
import { readDraft, writeDraft } from './lib/drafts.js';
import { shareValid, toShare, SHARE_BYTES } from './lib/validation.js';
import { createSharingUI } from './lib/sharing-ui.js';
// Session restore does not gate public catalogue/sharing and exposes no window state.
void auth.initialize();
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
const catalogue=createCatalogue(supabase);
window.TAKTIK_BACKEND={
  enabled:!!supabase,
  source:supabase?'loading':'fallback',
  validateShare:prepareShare,
  ready:Promise.resolve(),
  async sharingReady(){
    if(!supabase)return false;
    const response=await fetch(publicConfig.url+'/functions/v1/lineups',{method:'OPTIONS',headers:{apikey:publicConfig.key},signal:AbortSignal.timeout(8000)});
    return response.ok && response.headers.get('X-Sharing-Ready')==='true';
  },
  async saveLineup(state,token){
    if(!supabase)throw new Error('Paylaşım henüz etkin değil.');
    if(typeof token!=='string'||!token||token.length>2048)throw new Error('Önce güvenlik doğrulamasını tamamla.');
    const body=prepareShare(state);
    const response=await fetch(publicConfig.url+'/functions/v1/lineups',{
      method:'POST',headers:{'Content-Type':'application/json',apikey:publicConfig.key,'x-bot-token':token},body,signal:AbortSignal.timeout(12000)
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
if(supabase){
  window.TAKTIK_BACKEND.ready=catalogue.load().then(data=>{
    window.TAKTIK_BACKEND.source='supabase';
    window.TAKTIK_TEAMS=data.teams;
    window.TAKTIK_ROSTERS={...window.TAKTIK_ROSTERS,teams:data.rosters};
  }).catch(()=>{window.TAKTIK_BACKEND.source='fallback';status('Güncel kadrolar alınamadı. Kayıtlı takım listesiyle çalışıyorsun.');});
}
