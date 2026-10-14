import {weeklyGroup} from './weekly-lineups.js';
export function weeklyRecordLink(document,row){
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const link=node('a','');link.className='profile-weekly-entry';link.href='/haftanin-ilk-11i?id='+row.id;
 const copy=node('div','');copy.append(node('h3',row.title),node('p',row.formation+' · '+weeklyGroup(row)));
 const time=node('time',new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.updated_at)));time.setAttribute('datetime',row.updated_at);
 link.append(copy,time,node('span','Aç →'));return link;
}
export function mountWeeklyCollection({document,current,api}){
 const root=document.getElementById('weeklyCollection'),status=document.createElement('p'),list=document.createElement('div'),retry=document.createElement('button');
 status.setAttribute('role','status');retry.type='button';retry.textContent='Tekrar dene';root.replaceChildren(status,retry,list);
 let stopped=false,busy=false;const active=()=>!stopped&&current();
 async function load(){
  if(!active()||busy)return;busy=true;retry.hidden=true;list.replaceChildren();status.textContent='Kadrolar yükleniyor…';
  const records=[];let offset=0;
  try{for(;;){const r=await api.list(offset,50);if(!active())return;if(!r.ok)throw Error();records.push(...r.records);if(!r.more)break;offset=r.nextOffset;}
   if(!active())return;const groups=new Map();for(const row of records){const key=weeklyGroup(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   for(const [key,rows] of groups){const section=document.createElement('section'),heading=document.createElement('h2');heading.textContent=key;section.append(heading,...rows.map(r=>weeklyRecordLink(document,r)));list.append(section);}
   status.textContent=records.length?'':'Henüz kaydedilmiş bir ilk 11’in yok.';
  }catch{if(active()){status.textContent='Kadrolar şu anda yüklenemedi.';retry.hidden=false;}}
  finally{busy=false;}
 }
 retry.addEventListener('click',load);return {ready:load(),dispose(){stopped=true;retry.removeEventListener('click',load);root.replaceChildren();}};
}
