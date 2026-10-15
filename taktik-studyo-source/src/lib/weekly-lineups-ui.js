import {weeklyGroup} from './weekly-lineups.js';
import {createStudioDialog} from './studio-dialog.js';
import {ACCOUNT_LIMITS} from './studio-project-snapshot.js';
export function weeklyRecordLink(document,row){
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const link=node('a','');link.className='profile-weekly-entry';link.href='/haftanin-ilk-11i?id='+row.id;
 const copy=node('div','');copy.append(node('h3',row.title),node('p',row.formation+' · '+weeklyGroup(row)));
 const time=node('time',new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.updated_at)));time.setAttribute('datetime',row.updated_at);
 link.append(copy,time,node('span','Aç →'));return link;
}
export function mountWeeklyCollection({document,current,api}){
 const root=document.getElementById('weeklyCollection'),node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const usage=node('p','','weekly-usage'),status=node('p'),list=node('div'),retry=node('button','Tekrar dene');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry.type='button';usage.hidden=true;root.replaceChildren(usage,status,retry,list);
 const dialog=createStudioDialog({document,host:root});
 let stopped=false,busy=false,rowOff=[];const active=()=>!stopped&&current(),offRows=()=>{for(const off of rowOff.splice(0))off();};
 // SEC2.2: delete only through the owner-filtered API; the list and usage are reloaded afterwards.
 function item(row){
  const wrap=node('div',undefined,'weekly-collection-item'),remove=node('button','Sil','profile-danger-button weekly-delete');
  remove.type='button';remove.setAttribute('aria-label',row.title+' · Sil');
  const click=async()=>{
   if(!active()||busy)return;busy=true;remove.disabled=true;
   const yes=await dialog.ask({title:'İlk 11’i sil',message:'“'+row.title+'” kalıcı olarak silinecek.',confirm:'Kaydı Sil',opener:remove});
   if(!active())return;if(!yes){busy=false;remove.disabled=false;return;}
   status.textContent='Kayıt siliniyor…';let r;try{r=await api.remove(row);}catch{r={ok:false};}
   if(!active())return;busy=false;
   if(!r.ok){remove.disabled=false;status.textContent=r.error?.code==='conflict'?'Bu kayıt başka bir sekmede değişti. Liste yenilendi; tekrar dene.':'Kayıt silinemedi. Tekrar dene.';if(r.error?.code==='conflict')await load(true);return;}
   await load(true,'Kayıt silindi.');
  };
  remove.addEventListener('click',click);rowOff.push(()=>remove.removeEventListener('click',click));
  wrap.append(weeklyRecordLink(document,row),remove);return wrap;
 }
 async function load(keepStatus=false,done=''){
  if(!active()||busy)return;busy=true;retry.hidden=true;offRows();list.replaceChildren();if(!keepStatus)status.textContent='Kadrolar yükleniyor…';
  const records=[];let offset=0;
  try{for(;;){const r=await api.list(offset,50);if(!active())return;if(!r.ok)throw Error();records.push(...r.records);if(!r.more)break;offset=r.nextOffset;}
   if(!active())return;const groups=new Map();for(const row of records){const key=weeklyGroup(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   for(const [key,rows] of groups){const section=node('section'),heading=node('h2',key);section.append(heading,...rows.map(item));list.append(section);}
   usage.hidden=false;usage.textContent=records.length+' / '+ACCOUNT_LIMITS.weekly+' kayıt kullanılıyor';
   status.textContent=done||(records.length?'':'Henüz kaydedilmiş bir ilk 11’in yok.');
  }catch{if(active()){status.textContent='Kadrolar şu anda yüklenemedi.';retry.hidden=false;}}
  finally{busy=false;}
 }
 const again=()=>{void load();};
 retry.addEventListener('click',again);return {ready:load(),dispose(){stopped=true;dialog.dispose();offRows();retry.removeEventListener('click',again);root.replaceChildren();}};
}
