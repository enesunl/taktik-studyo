import {createStudioAutosave} from './studio-autosave.js';
import {createStudioDialog} from './studio-dialog.js';
import {ACCOUNT_LIMITS} from './studio-project-snapshot.js';

const limitMessages={quota_exceeded:`Çalışma sınırına ulaştın (${ACCOUNT_LIMITS.projects}). Kaydetmek için Çalışmalarım'dan bir çalışmayı sil. Değişikliklerin bu cihazda korunuyor.`,
  rate_limited:'Çok sık kaydediliyor. Birkaç dakika sonra tekrar dene; değişikliklerin bu cihazda korunuyor.'};

export function mountStudioSave({document,window,host,api,current,capture,project,restored,recovery,userId,newId,storage}){
  const listeners=[],node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const controls=node('section'),label=node('label'),titleLabel=node('span','Çalışma adı'),title=node('input'),status=node('p'),save=node('button'),toggle=node('button'),copy=node('button','Kopya Olarak Kaydet'),reload=node('a','Sunucudaki Sürümü Aç');
  controls.className='studio-save-controls';title.maxLength=120;titleLabel.className='studio-save-label';label.append(titleLabel,title);title.setAttribute('aria-label','Çalışma adı');
  save.className='studio-save-button';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
  path.setAttribute('d','M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7M14 5v3');icon.append(path);save.append(icon);
  const autosave=node('div'),toggleLabel=node('span','Otomatik kaydet'),thumb=node('span');autosave.className='studio-autosave';toggle.className='studio-autosave-switch';thumb.setAttribute('aria-hidden','true');toggle.append(thumb);toggle.setAttribute('aria-label','Otomatik kaydet');autosave.append(toggleLabel,toggle);
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');toggle.setAttribute('role','switch');save.type=toggle.type=copy.type='button';copy.hidden=reload.hidden=true;
  const options=node('details'),summary=node('summary','⋯'),menu=node('div');summary.setAttribute('aria-label','Kayıt seçenekleri');summary.title='Kayıt seçenekleri';menu.className='studio-save-menu';menu.append(copy,reload);options.append(summary,menu);controls.append(label,save,autosave,status,options);host.append(controls);
  const dialog=createStudioDialog({document,host});let stopped=false,allowLeave=false;
  const active=()=>!stopped&&current();
  const listen=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
  const controller=createStudioAutosave({api,current:active,capture,project,restored,recovery,userId,newId,storage,
    onState(s){
      // Avoid replacing selection/caret while editing the title.
      if(title.value!==s.title)title.value=s.title;
      status.textContent=(limitMessages[s.error]||{new:'Henüz kaydedilmedi',saved:'Kaydedildi ✓',dirty:'Kaydedilmedi',saving:'Kaydediliyor…',error:'Kaydetme hatası',conflict:'Bu çalışma başka bir sekmede güncellendi.'}[s.status])+(!s.recoveryOk?' Yerel kurtarma kopyası yazılamadı.':'');
      save.disabled=s.saving||s.conflict;const saveLabel=s.saving?'Kaydediliyor…':s.status==='error'?'Tekrar Dene':'Kaydet';save.setAttribute('aria-label',saveLabel);save.title=saveLabel;save.setAttribute('aria-busy',String(s.saving));toggle.setAttribute('aria-checked',String(s.autosave));toggle.title='Otomatik kaydet: '+(s.autosave?'Açık':'Kapalı');
      copy.hidden=reload.hidden=options.hidden=!s.conflict;copy.disabled=s.saving;reload.href='/mac-studyosu?project='+s.id;if(s.conflict)options.open=true;
    },onSaved({id}){if(active())window.history?.replaceState(null,'','/mac-studyosu?project='+id);},
  });
  listen(title,'input',()=>controller.rename(title.value));listen(save,'click',()=>{void controller.save({manual:true});});
  listen(toggle,'click',()=>controller.setAutosave(!controller.getState().autosave));listen(copy,'click',()=>{void controller.save({copy:true,manual:true});});
  const unsaved=()=>{const s=controller.getState();return s.dirty||s.saving;};
  listen(window,'beforeunload',event=>{if(active()&&!allowLeave&&unsaved()){event.preventDefault();event.returnValue='';}});
  listen(document,'click',async event=>{
    if(!active()||allowLeave||!unsaved()||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const a=event.target?.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
    let url;try{url=new URL(a.href,window.location.href);if(url.origin!==window.location.origin)return;}catch{return;}
    event.preventDefault();const yes=await dialog.ask({title:'Kaydedilmemiş değişiklikler',message:'Son değişiklikler sunucuya kaydedilmedi. Yine de bu sayfadan ayrılmak istiyor musun?',confirm:'Sayfadan Ayrıl',opener:a});
    if(yes&&active()){allowLeave=true;window.location.assign(url.href);}
  },true);
  return {controller,dispose(){stopped=true;controller.dispose();dialog.dispose();for(const off of listeners)off();controls.replaceChildren();}};
}
