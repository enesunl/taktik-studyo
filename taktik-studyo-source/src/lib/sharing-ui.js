let widgetScript;
function loadTurnstile() {
  if(window.turnstile)return Promise.resolve(window.turnstile);
  if(!widgetScript)widgetScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error('Doğrulama yüklenemedi.'));},15000);
    script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):reject(new Error('Doğrulama yüklenemedi.'));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Doğrulama yüklenemedi.'));};document.head.append(script);
  }).catch(error=>{widgetScript=null;throw error;});
  return widgetScript;
}
const el=(tag,cls,text)=>{const element=document.createElement(tag);if(cls)element.className=cls;if(text)element.textContent=text;return element;};
export function createSharingUI(backend,siteKey) {
  return {attach(board,trigger){
    if(!trigger)return;
    trigger.addEventListener('click',async()=>{
      const snapshot=board.getState(),dialog=el('dialog','share-dialog');
      const top=el('div','dialog-heading'),title=el('h2','','Kadroyu Paylaş'),close=el('button','','×');close.type='button';close.setAttribute('aria-label','Kapat');top.append(title,close);
      const intro=el('p','share-description','Kadronun bu anını bir bağlantı olarak kaydet. Sonraki düzenlemelerin paylaştığın kaydı değiştirmez.');
      const label=el('p','share-team',snapshot.team.name+' · '+snapshot.formation);
      const widget=el('div','share-verification'),notice=el('p','share-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
      const save=el('button','apply-button','Bağlantı oluştur');save.type='button';save.disabled=true;
      const result=el('div','share-result');result.hidden=true;
      const link=el('input');link.type='url';link.readOnly=true;link.setAttribute('aria-label','Paylaşım bağlantısı');
      const copy=el('button','apply-button','Bağlantıyı kopyala');copy.type='button';
      const open=el('a','','Kadroyu aç →');open.target='_blank';open.rel='noopener noreferrer';
      result.append(link,copy,open,el('small','','Bağlantıyı açanların siteye erişim izni olması gerekir.'));
      dialog.append(top,intro,label,widget,notice,save,result);document.body.append(dialog);dialog.showModal();
      let token='',widgetId=null,sdk=null,busy=false,finished=false;
      const invalidate=message=>{token='';save.disabled=true;notice.textContent=message;};
      const cleanup=()=>{finished=true;if(sdk&&widgetId!==null)sdk.remove(widgetId);dialog.remove();trigger.focus();};
      close.onclick=()=>dialog.close();dialog.addEventListener('close',cleanup,{once:true});
      dialog.addEventListener('click',event=>{if(busy||event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.value);notice.textContent='Bağlantı kopyalandı.';}catch{link.focus();link.select();notice.textContent='Bağlantıyı seçip kopyalayabilirsin.';}};
      save.onclick=async()=>{
        if(!token||busy||finished)return;busy=true;save.disabled=true;close.disabled=true;notice.textContent='Bağlantı oluşturuluyor…';
        try{
          const id=await backend.saveLineup(snapshot,token);
          if(finished)return;
          const url=new URL('/lineup/'+id,window.location.origin).href;
          link.value=url;open.href=url;result.hidden=false;save.hidden=true;widget.hidden=true;notice.textContent='Kadro bağlantın hazır.';
        }catch(error){if(!finished)notice.textContent=error.message || 'Paylaşım tamamlanamadı.';}
        finally{token='';busy=false;close.disabled=false;if(!finished&&sdk&&widgetId!==null)sdk.reset(widgetId);}
      };
      // Esc cannot discard an in-flight save and cause an accidental duplicate retry.
      dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
      if(!backend.enabled||!siteKey){notice.textContent='Paylaşım henüz etkin değil. Doğrulama kurulumu tamamlanıyor.';return;}
      notice.textContent='Güvenlik doğrulaması hazırlanıyor…';
      try{
        backend.validateShare?.(snapshot);
        if(!await backend.sharingReady())throw new Error('Paylaşım şu anda kullanılamıyor.');
        sdk=await loadTurnstile();if(finished)return;
        widgetId=sdk.render(widget,{sitekey:siteKey,action:'share_lineup',theme:'dark',
          callback:value=>{if(finished||!result.hidden)return;token=value;save.disabled=busy;notice.textContent='Doğrulama tamamlandı. Bağlantını oluşturabilirsin.';},
          'expired-callback':()=>invalidate('Doğrulamanın süresi doldu. Yeniden doğrula.'),
          'error-callback':()=>{invalidate('Doğrulama tamamlanamadı. Yeniden dene.');return true;},
          'timeout-callback':()=>invalidate('Doğrulama zaman aşımına uğradı. Yeniden dene.')
        });
      }catch(error){if(!finished)notice.textContent=error.message || 'Doğrulama yüklenemedi.';}
    });
  }};
}
