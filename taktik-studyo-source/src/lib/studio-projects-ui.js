import {createStudioDialog} from './studio-dialog.js';
import {projectTitle,ACCOUNT_LIMITS} from './studio-project-snapshot.js';
export function mountStudioProjects({document,window,api,current}){
  const root=document.getElementById('studioProjectsContent');
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const status=node('p','','projects-status'),usage=node('p','','projects-usage'),list=node('div',undefined,'studio-project-list'),more=node('button','Daha Fazla'),retry=node('button','Tekrar Dene');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');more.type=retry.type='button';more.hidden=retry.hidden=true;
  usage.hidden=true;root.replaceChildren(usage,status,list,more,retry);const dialog=createStudioDialog({document,host:root});
  let stopped=false,busy=false,offset=0,rows=[],rowOff=[],total=null;const active=()=>!stopped&&current();
  const offRows=()=>{for(const off of rowOff.splice(0))off();};
  function render(){
    offRows();list.replaceChildren();
    // SEC2.2: usage from the server's exact total (or the full list); a full account is told how to continue.
    const used=total??(more.hidden?rows.length:null);usage.hidden=used===null;
    usage.textContent=`${used} / ${ACCOUNT_LIMITS.projects} çalışma kullanılıyor`+(used>=ACCOUNT_LIMITS.projects?'. Yeni çalışma kaydetmek için önce bir çalışmayı sil.':'');
    if(!rows.length){const empty=node('p','Henüz kaydedilmiş bir çalışman yok.'),link=node('a','İlk Çalışmanı Oluştur');link.href='/mac-studyosu';list.append(empty,link);return;}
    for(const p of rows){
      const card=node('article',undefined,'studio-project-card'),title=node('h2',p.title),kind=node('p',p.studio_mode==='match'?'Maç Stüdyosu':'Serbest Stüdyo'),time=node('p','Son düzenleme: '+new Date(p.updated_at).toLocaleString('tr-TR'));
      const actions=node('div',undefined,'project-actions'),open=node('a','Aç');open.href='/mac-studyosu?project='+p.id;actions.append(open);
      for(const [action,label]of [['rename','Yeniden Adlandır'],['duplicate','Kopyala'],['delete','Sil']]){
        const b=node('button',label);b.type='button';b.setAttribute('aria-label',p.title+' · '+label);
        const click=async()=>{
          if(!active()||busy)return;busy=true;b.disabled=true;let r;
          if(action==='rename'){
            const value=await dialog.ask({title:'Çalışmayı yeniden adlandır',value:p.title,confirm:'Kaydet',opener:b});
            if(!active())return;if(value===null){busy=false;b.disabled=false;return;}if(!projectTitle(value)){status.textContent='Çalışma adı 1–120 karakter olmalı.';busy=false;b.disabled=false;return;}
            r=await api.renameProject({id:p.id,revision:p.revision,title:value});
          }else if(action==='delete'){
            const yes=await dialog.ask({title:'Çalışmayı sil',message:'Bu çalışma kalıcı olarak silinecek.',confirm:'Çalışmayı Sil',opener:b});
            if(!active())return;if(!yes){busy=false;b.disabled=false;return;}r=await api.deleteProject(p);
          }else r=await api.duplicateProject(p.id,window.crypto.randomUUID());
          if(!active())return;busy=false;b.disabled=false;
          if(!r.ok){const code=r.error?.code;status.textContent=code==='conflict'?'Bu çalışma başka bir sekmede değişti. Listeyi yenileyip tekrar dene.'
            :code==='quota_exceeded'?`Çalışma sınırına ulaştın (${ACCOUNT_LIMITS.projects}). Kopyalamak için önce bir çalışmayı sil.`
            :code==='rate_limited'?'Çok sık işlem yapıldı. Birkaç dakika sonra tekrar dene.':'İşlem tamamlanamadı. Tekrar dene.';retry.hidden=['quota_exceeded','rate_limited'].includes(code);return;}
          await load(true);
        };
        b.addEventListener('click',click);rowOff.push(()=>b.removeEventListener('click',click));actions.append(b);
      }
      card.append(title,kind,time,actions);list.append(card);
    }
  }
  async function load(reset=false){
    if(!active()||busy)return;busy=true;more.disabled=true;retry.hidden=true;status.textContent='Çalışmalar yükleniyor…';
    const r=await api.listProjects(reset?0:offset);if(!active())return;busy=false;more.disabled=false;
    if(!r.ok){status.textContent='Çalışmalar şu anda alınamadı.';retry.hidden=false;return;}
    rows=reset?r.projects:[...new Map([...rows,...r.projects].map(p=>[p.id,p])).values()];offset=r.nextOffset;total=r.total??null;more.hidden=!r.more;status.textContent='';render();
  }
  const next=()=>{void load();},again=()=>{void load(true);};more.addEventListener('click',next);retry.addEventListener('click',again);
  return {ready:load(),dispose(){stopped=true;dialog.dispose();offRows();more.removeEventListener('click',next);retry.removeEventListener('click',again);root.replaceChildren();}};
}
