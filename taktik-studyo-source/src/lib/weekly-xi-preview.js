import {createWeeklyGraphic,weeklyPalette,renderWeeklyPNG,downloadWeeklyPNG} from './weekly-xi-export.js';

export function mountWeeklyPreview({document,window,root,trigger,getState,effective,utils,current,metadata={},renderer=renderWeeklyPNG,download=downloadWeeklyPNG}){
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const dialog=node('dialog',null,'weekly-preview');dialog.setAttribute('aria-labelledby','weeklyPreviewTitle');
 const title=node('h2','Haftanın İlk 11’i — Önizleme');title.id='weeklyPreviewTitle';
 const controls=node('div',null,'weekly-preview-controls'),back=node('button','Geri Dön'),png=node('button','PNG İndir');back.type=png.type='button';
 controls.append(title,back,png);
 const status=node('p',null,'weekly-preview-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const surface=node('div',null,'week-xi-export-surface');dialog.append(controls,status,surface);root.append(dialog);
 let stopped=false,generation=0,busy=false,palette;
 const active=()=>!stopped&&current();
 function close(){generation++;busy=false;png.disabled=false;png.textContent='PNG İndir';status.textContent='';dialog.close();surface.replaceChildren();if(active())trigger.focus();}
 function refresh(){
  if(!active()||!dialog.open||busy)return;
  try{surface.replaceChildren(createWeeklyGraphic({document,utils,state:getState(),effective,palette,metadata}));png.disabled=false;}
  catch{surface.replaceChildren();png.disabled=true;status.textContent='Görsel oluşturulamadı. Tekrar deneyin.';}
 }
 function open(){
  if(!active()||dialog.open)return;generation++;status.textContent='';
  dialog.showModal();back.focus();
  try{palette=weeklyPalette(document,window);refresh();}
  catch{surface.replaceChildren();png.disabled=true;status.textContent='Görsel oluşturulamadı. Tekrar deneyin.';}
 }
 async function exportPNG(){
  if(!active()||!dialog.open||busy||png.disabled)return;
  busy=true;png.disabled=true;png.textContent='Görsel hazırlanıyor…';status.textContent='Görsel hazırlanıyor…';
  const ticket=generation,valid=()=>active()&&dialog.open&&generation===ticket;
  try{const blob=await renderer({document,window,svg:surface.firstElementChild,current:valid});if(valid()){download({document,window,blob});status.textContent='PNG hazır. İndirme başlatıldı.';}}
  catch{if(valid())status.textContent='Görsel oluşturulamadı. Tekrar deneyin.';}
  finally{if(valid()){busy=false;png.disabled=false;png.textContent='PNG İndir';refresh();}}
 }
 trigger.addEventListener('click',open);back.addEventListener('click',close);png.addEventListener('click',exportPNG);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 // The weekly page owns root and removes this dialog together with its other children.
 return {refresh,dispose(){stopped=true;generation++;trigger.removeEventListener('click',open);if(dialog.open)dialog.close();dialog.replaceChildren();}};
}
