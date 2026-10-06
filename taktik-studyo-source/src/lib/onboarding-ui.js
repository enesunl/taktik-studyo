import {createTeamChoice,syncTeamChoice} from './team-choice.js';
import {needsOnboarding,onboardingDestination} from './onboarding.js';

const steps = [
  {title:"TAKTİK STÜDYO'YA\nHOŞ GELDİN.",body:'Kadrolar oluştur, taktiklerini çiz, Süper Lig maçlarını incele ve çalışmalarını tek yerde sakla.'},
  {title:'TAKTİĞİNİ\nSAHADA GÖSTER.',body:'Oyuncuları sahaya yerleştir, formasyonunu değiştir ve taktik çizimlerini oluştur.'},
  {title:'MAÇI SADECE\nİZLEME.\nANALİZ ET.',body:'Süper Lig maçlarını incele, kadroları gör ve maçtan kendi analiz çalışmanı oluştur.'},
  {title:'ÇALIŞMANI\nKAYDET.\nGERİ DÖN.',body:"Taktik çalışmalarını kaydet, daha sonra kaldığın yerden devam et ve kendi Haftanın İlk 11'ini oluştur."},
  {title:'SON BİR ŞEY.',subtitle:'HANGİ TAKIMI\nDESTEKLİYORSUN?',body:'Favori takımını seç. Bunu daha sonra profilinden değiştirebilirsin.'},
];

// The protected-page guard owns identity/generation and disposal. No partial
// progress is persisted here; O1 owns all profile validation and writes.
export function mountOnboarding({document,window,api,catalogue,current}) {
  const root=document.getElementById('protectedContent');
  let disposed=false,step=0,selected,initialized=false,initializing=false,busy=false,finished=false;
  let teams=null,loadingTeams=false,teamError=false,choices=[],viewOff=[];
  const off=[],active=()=>!disposed&&current();
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  function listen(node,event,fn,list=off){node.addEventListener(event,fn);list.push(()=>node.removeEventListener(event,fn));}
  const button=(text,className,fn)=>{const n=el('button',className,text);n.type='button';listen(n,'click',fn);return n;};
  const progress=el('p','onboarding-progress','Karşılama hazırlanıyor…');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
  const grid=el('div','onboarding-grid'),copy=el('section','onboarding-copy'),visual=el('section','onboarding-visual');
  grid.append(copy,visual);
  const message=el('p','onboarding-message');message.setAttribute('role','alert');
  const retry=button('Tekrar dene','onboarding-link',()=>{void initialize();});retry.hidden=true;
  const footer=el('div','onboarding-footer'),left=el('div','onboarding-back-actions');
  const back=button('← Geri','onboarding-link',()=>move(-1));
  const skip=button('Atla','onboarding-link',()=>{void complete(null);});
  const dots=el('span','onboarding-dots');dots.setAttribute('aria-hidden','true');
  const next=button('Başla →','onboarding-primary',()=>{if(step===4)void complete(selected);else move(1);});
  left.append(back,skip);footer.append(left,dots,next);footer.hidden=true;
  root.replaceChildren(progress,grid,message,retry,footer);

  function controls(){
    back.hidden=step===0;skip.hidden=step===4;
    back.disabled=skip.disabled=busy||finished;
    next.disabled=busy||finished||(step===4&&selected===undefined);
    next.textContent=busy?'Kaydediliyor…':step===4?"Taktik Stüdyo'ya Başla →":step===0?'Başla →':'Devam →';
    root.setAttribute('aria-busy',String(busy||initializing));
    for(const choice of choices)syncTeamChoice(choice,selected,busy||finished);
  }
  function artwork(){
    const art=el('div','onboarding-art onboarding-art-'+step);art.setAttribute('aria-hidden','true');
    const pitch=el('div','onboarding-mini-pitch');
    pitch.append(el('span','onboarding-pitch-circle'),el('span','onboarding-pitch-box'));
    for(let i=0;i<5;i++)pitch.append(el('span','onboarding-marker onboarding-marker-'+i,String(i===0?9:i===1?8:i===2?10:i===3?6:4)));
    pitch.append(el('span','onboarding-arrow'));
    art.append(el('p','onboarding-art-label','ÜRÜN GÖRÜNÜMÜ · TEMSİLİ'));
    if(step===0||step===1){
      art.append(el('p','onboarding-art-title',step===0?'SENİN OYUNUN.':'TAKTİK TAHTASI'),pitch,el('p','onboarding-art-caption','4–3–3 / OYUNU SEN KUR'));
      if(step===0)art.append(el('div','onboarding-art-row','KADRO → TAKTİK → ANALİZ'));
    }else if(step===2){
      art.append(el('p','onboarding-art-title','MAÇIN İÇİNE GİR.'),el('div','onboarding-match-row','EV SAHİBİ / DEPLASMAN'),pitch,el('div','onboarding-art-row','KADROLAR / MAÇ STÜDYOSU →'));
    }else{
      art.append(el('p','onboarding-art-title','FİKİRLERİN BURADA.'),el('p','onboarding-art-label','ÖRNEK ÇALIŞMALAR'),el('div','onboarding-art-row','Derbi Analizi ↗'),el('div','onboarding-art-row','4-2-3-1 Çalışması ↗'));
      const weekly=el('div','onboarding-weekly');weekly.append(el('strong',null,'XI'),el('p',null,"HAFTANIN İLK 11'İ"),el('span',null,'11 OYUNCU. SENİN SEÇİMİN.'));art.append(weekly);
    }
    visual.append(art);
  }
  function picker(){
    const fieldset=el('fieldset','onboarding-teams');fieldset.append(el('legend',null,'Süper Lig · Favori takımın'));
    const list=el('div','onboarding-team-grid');choices=[];
    for(const team of [...(teams||[]),null]){
      const choice=createTeamChoice({document,team,prefix:'onboarding-team'});
      listen(choice.input,'change',()=>{if(!active()||busy||finished)return;selected=choice.slug;message.textContent='';controls();},viewOff);
      choices.push(choice);list.append(choice.label);
    }
    fieldset.append(list);visual.append(fieldset);
    const status=el('p','onboarding-catalogue-status',loadingTeams?'Takımlar yükleniyor…':teamError?'Takımlar şu anda yüklenemedi. Takım seçmeden de devam edebilirsin.':'');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');visual.append(status);
    if(teamError){
      const again=el('button','onboarding-link','Takımları tekrar yükle');again.type='button';again.disabled=busy;
      listen(again,'click',()=>{void loadTeams();},viewOff);visual.append(again);
    }
    controls();
  }
  function clearView(){for(const remove of viewOff)remove();viewOff=[];choices=[];}
  function render(focus=false){
    if(!active()||!initialized)return;
    clearView();copy.replaceChildren();visual.replaceChildren();
    progress.textContent=`${step+1} / 5`;
    const heading=el('h1','onboarding-title',steps[step].title);heading.tabIndex=-1;copy.append(heading);
    if(steps[step].subtitle)copy.append(el('h2','onboarding-subtitle',steps[step].subtitle));
    copy.append(el('p','onboarding-body',steps[step].body));
    if(step===4)picker();else artwork();
    dots.replaceChildren(...steps.map((_,i)=>el('span',i<=step?'is-complete':'')));
    footer.hidden=false;controls();if(focus)heading.focus();
  }
  function move(delta){
    if(!active()||!initialized||busy||finished)return;
    step=Math.max(0,Math.min(4,step+delta));message.textContent='';render(true);
    if(step===4&&!teams&&!loadingTeams)void loadTeams();
  }
  async function loadTeams(){
    if(!active()||loadingTeams||teams||busy||finished)return;
    loadingTeams=true;teamError=false;
    if(step===4){clearView();visual.replaceChildren();picker();}
    try{const result=await catalogue.loadTeams();if(!active())return;teams=result;}
    catch{if(!active())return;teamError=true;}
    loadingTeams=false;
    // Only rebuild the picker; retain step heading and navigation focus.
    if(step===4&&active()){
      const focused=choices.find(c=>c.input===document.activeElement)?.slug;
      clearView();visual.replaceChildren();picker();
      if(focused!==undefined)choices.find(c=>c.slug===focused)?.input.focus();
    }
  }
  async function complete(slug){
    if(!active()||!initialized||busy||finished||slug===undefined)return;
    busy=true;message.textContent='';controls();
    let result;
    try{result=await api.completeOnboarding({favoriteTeamSlug:slug});}catch{result={ok:false};}
    if(!active())return;
    busy=false;
    if(!result.ok){message.textContent='Tercihin kaydedilemedi. Tekrar dene.';controls();return;}
    finished=true;controls();
    if(active())window.location.replace(onboardingDestination(window.location.search));
  }
  async function initialize(){
    if(!active()||initializing||initialized)return;
    initializing=true;retry.hidden=true;message.textContent='';controls();
    let result;
    try{result=await api.loadPreferences();}catch{result={ok:false};}
    if(!active())return;
    initializing=false;controls();
    if(!result.ok){progress.textContent='Karşılama';message.textContent='Karşılama şu anda yüklenemedi. Tekrar dene.';retry.hidden=false;return;}
    if(!needsOnboarding(result.profile)){finished=true;if(active())window.location.replace(onboardingDestination(window.location.search));return;}
    initialized=true;render(true);
  }
  const ready=initialize();
  return {ready,dispose(){if(disposed)return;disposed=true;selected=undefined;teams=null;clearView();for(const remove of off)remove();root.replaceChildren();}};
}
