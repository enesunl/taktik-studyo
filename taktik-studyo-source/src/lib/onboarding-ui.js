import {createTeamChoice,syncTeamChoice,teamColors} from './team-choice.js';
import {needsOnboarding,onboardingDestination} from './onboarding.js';
import {usernameValid} from './auth-validation.js';
import {showcaseTeams,studioShowcase,boardShowcase,matchesShowcase,weeklyShowcase} from './onboarding-showcase.js';

// OB3: six in-memory steps. Only the final favorite-team step can complete onboarding.
const steps = [
  {key:'welcome',name:'Hoş geldin',title:"Taktik Stüdyo'ya hoş geldin",
    body:"Futbol fikirlerini sahada kurduğun, maçları incelediğin ve haftanın ilk 11'ini hazırladığın yer. Kısa bir turla araçları tanı.",
    hints:["Dört araç, tek hesap: Stüdyo, Taktik Tahtası, Maçlar ve Haftanın İlk 11'i.",'Çalışmaların hesabına kaydedilir; kaldığın yerden devam edersin.','Adımlar arasında Geri ve Devam ile ya da klavyede ← → tuşlarıyla gezin.']},
  {key:'studio',name:'Stüdyo',title:'Futbol fikirlerini sahaya taşı',
    body:'İki takımı aynı sahada çalış. Takımları serbestçe seç ya da bir fikstür maçından başla.',
    hints:['Serbest Stüdyo veya Maç Stüdyosu ile başla.','Oyuncuları sürükleyerek konumlandır, taktik oklarını çiz.','Çalışmanı kaydet, sonra kaldığın yerden aç.']},
  {key:'board',name:'Taktik Tahtası',title:'Takımını seç, taktiğini oluştur',
    body:'Bir Süper Lig takımı seç, dizilişini kur ve oyunu kendi planına göre şekillendir.',
    hints:['Takımını seç ve dizilişi değiştir.','Yedek kulübesinden oyuncu değişikliği yap.','Oyuncu hareketlerini sahada çizerek göster.']},
  {key:'matches',name:'Maçlar',title:'Maçları incele, analizini hazırla',
    body:'Süper Lig fikstürünü hafta hafta takip et, maç detayından kendi analizine geç.',
    hints:['Haftalar arasında gezinerek fikstürü incele.','Bir maçı açarak detayını ve kadroları gör.','Stüdyoda Aç ile maç üzerinden analize başla.']},
  {key:'weekly',name:"Haftanın İlk 11'i",title:'Haftanın kadrosunu sen belirle',
    body:'Haftanın en iyilerini seç, kadronu hesabına kaydet ve görselini hazırla.',
    hints:['Dizilişi seç ve oyuncuları sahaya ekle.','Kadronu sezon ve haftasıyla hesabına kaydet.','Önizle ve PNG olarak indir.']},
  {key:'favorite',name:'Favori takım',title:'Hangi takımı destekliyorsun?',
    body:'Favori takımını seç ya da şimdilik atla. Seçimini daha sonra profilinden değiştirebilirsin.'},
];
const last=steps.length-1;

// The protected-page guard owns identity/generation and disposal. No partial
// progress is persisted here; O1 owns all profile validation and writes.
export function mountOnboarding({document,window,api,catalogue,current}) {
  const root=document.getElementById('protectedContent');
  let disposed=false,step=0,selected,initialized=false,initializing=false,busy=false,finished=false;
  let teams=null,loadingTeams=false,teamError=false,choices=[],viewOff=[];
  const off=[],active=()=>!disposed&&current();
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  // Illustration builder: non-interactive spans/divs only, never buttons or inputs.
  const h=(tag,className,...kids)=>{const n=el(tag,className);for(const kid of kids)n.append(typeof kid==='string'?el('span',null,kid):kid);return n;};
  const at=(node,x,y)=>{node.style.setProperty('--x',x+'%');node.style.setProperty('--y',y+'%');return node;};
  function listen(node,event,fn,list=off){node.addEventListener(event,fn);list.push(()=>node.removeEventListener(event,fn));}
  const button=(text,className,fn)=>{const n=el('button',className,text);n.type='button';listen(n,'click',fn);return n;};
  const progress=el('p','onboarding-progress','Karşılama hazırlanıyor…');progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
  const stepper=el('ol','onboarding-stepper');stepper.setAttribute('aria-label','Tanıtım adımları');stepper.hidden=true;
  const grid=el('div','onboarding-grid'),copy=el('section','onboarding-copy'),visual=el('section','onboarding-visual');
  grid.append(copy,visual);
  const message=el('p','onboarding-message');message.setAttribute('role','alert');
  // SEC2.2: an account without a profile (first Google sign-in) picks a username and accepts the Terms here,
  // with the same controls as e-mail registration, before onboarding can complete.
  let needsProfile=false;
  const account=el('div','onboarding-account');
  const usernameLabel=el('label',null,'Kullanıcı adı'),username=el('input');usernameLabel.htmlFor=username.id='onboardingUsername';
  Object.assign(username,{type:'text',autocomplete:'username',maxLength:24,spellcheck:false});username.setAttribute('autocapitalize','none');
  const usernameHint=el('p','onboarding-hint','3–24 karakter: A–Z, a–z, 0–9 veya _.');
  const notice=el('p','onboarding-hint');notice.append(el('span',null,'Kişisel verilerin '),link('/kvkk-aydinlatma-metni.html','KVKK Aydınlatma Metni'),el('span',null,' ve '),link('/gizlilik-politikasi.html','Gizlilik Politikası'),el('span',null,'’nda açıklandığı şekilde işlenir.'));
  const terms=el('div','onboarding-terms'),termsBox=el('input'),termsLabel=el('label');termsBox.type='checkbox';termsLabel.htmlFor=termsBox.id='onboardingTerms';
  termsLabel.append(link('/kullanim-kosullari.html','Kullanım Koşulları'),el('span',null,'’nı okudum ve kabul ediyorum.'));terms.append(termsBox,termsLabel);
  account.append(usernameLabel,username,usernameHint,notice,terms);
  function link(href,text){const a=el('a',null,text);a.href=href;a.target='_blank';a.rel='noopener';return a;}
  const retry=button('Tekrar dene','onboarding-link',()=>{void initialize();});retry.hidden=true;
  const footer=el('div','onboarding-footer'),left=el('div','onboarding-back-actions');
  const back=button('← Geri','onboarding-link',()=>move(-1));
  // Introductory steps skip the tour only; the final step's skip completes without a team.
  const skip=button('Atla','onboarding-link',()=>{if(step===last)void complete(null);else go(last);});
  const next=button('Başla →','onboarding-primary',()=>{if(step===last)void complete(selected);else move(1);});
  left.append(back,skip);footer.append(left,next);footer.hidden=true;
  root.replaceChildren(progress,stepper,grid,message,retry,footer);
  listen(root,'keydown',event=>{
    const tag=String(event.target?.tagName||'').toLowerCase();
    if(event.altKey||event.ctrlKey||event.metaKey||['input','textarea','select'].includes(tag))return;
    if(event.key==='ArrowRight'&&step<last){event.preventDefault();move(1);}
    else if(event.key==='ArrowLeft'&&step>0){event.preventDefault();move(-1);}
  });

  function controls(){
    back.hidden=step===0;
    skip.textContent=step===last?'Şimdilik atla':'Turu geç';
    back.disabled=skip.disabled=busy||finished;username.disabled=termsBox.disabled=busy||finished;
    next.disabled=busy||finished||(step===last&&selected===undefined);
    next.textContent=busy?'Kaydediliyor…':step===last?"Taktik Stüdyo'ya Başla →":step===0?'Başla →':'Devam →';
    root.setAttribute('aria-busy',String(busy||initializing));
    for(const choice of choices)syncTeamChoice(choice,selected,busy||finished);
  }

  const pitchLines=className=>h('div',className,el('span','ob-line-half'),el('span','ob-line-circle'),el('span','ob-line-box ob-line-box-a'),el('span','ob-line-box ob-line-box-b'));
  // Canonical team colors drive every illustrated kit/marker through --tp/--ts.
  const paint=(node,key)=>{const team=showcaseTeams[key];node.style.setProperty('--tp',team.primary);node.style.setProperty('--ts',team.secondary);return node;};
  const crest=(key,variant='')=>paint(el('i','ob-crest'+variant),key);
  const teamTag=(key,className='ob-team-tag')=>paint(h('span',className,el('i','ob-crest'),el('strong',null,showcaseTeams[key].name)),key);
  const kit=(key,text='')=>paint(el('i','ob-kit',text),key);
  const player=(key,{name,number='',x,y,out=false})=>at(h('span','ob-player'+(out?' is-out':''),kit(key,String(number)),el('span','ob-name',name)),x,y);
  function welcomeArt(){
    const brand=h('div','ob-brand',el('span','ob-brand-mark'),h('strong',null,'taktik'),'stüdyo');
    const rows=[['01','studio','Stüdyo','İki takım, tek saha'],['02','board','Taktik Tahtası','Diziliş ve değişiklik'],['03','matches','Maçlar','Fikstür ve maç detayı'],['04','weekly',"Haftanın İlk 11'i",'Kadro, kayıt ve PNG']];
    const index=h('div','ob-index',...rows.map(([no,key,name,detail])=>h('div','ob-index-row',el('span','ob-index-no',no),el('span','ob-glyph ob-glyph-'+key),h('span','ob-index-name',el('strong',null,name),el('small',null,detail)))));
    return [brand,index,el('p','ob-foot','4 ARAÇ · TEK HESAP')];
  }
  function studioArt(){
    const {home,away,homePlayers,awayPlayers}=studioShowcase;
    const toolbar=h('div','ob-toolbar',h('span','ob-seg',el('b','is-on','Serbest'),el('b',null,'Maç')),h('span','ob-tools',el('b',null,'✎'),el('b','is-on','↗'),el('b',null,'⌫')),h('span','ob-swatches',el('i','is-on'),el('i'),el('i')));
    const teams=h('div','ob-versus',teamTag(home),el('span','ob-versus-mark','vs'),teamTag(away,'ob-team-tag is-away'));
    const pitch=pitchLines('ob-pitch ob-pitch-wide');
    for(const [side,list] of [[home,homePlayers],[away,awayPlayers]])for(const [x,y,label] of list){
      pitch.append(at(paint(el('i','ob-dot'),side),x,y));
      if(label)pitch.append(at(el('span','ob-dot-label',label),x,y));
    }
    pitch.append(at(el('span','ob-arrow ob-arrow-curve'),44,22),at(el('span','ob-arrow ob-arrow-straight'),33,44));
    const save=h('div','ob-savebar',h('span','ob-field',`${showcaseTeams[home].name} – ${showcaseTeams[away].name} analizi`),el('span','ob-chip is-ok','✓ Kaydedildi'));
    return [toolbar,teams,pitch,save];
  }
  function boardArt(){
    const {team,formation,players,substitution,bench}=boardShowcase;
    const top=h('div','ob-board-top',h('span','ob-select',crest(team),el('strong',null,showcaseTeams[team].name),el('b',null,'▾')),h('span','ob-chips',...['4–3–3','4–2–3–1','3–5–2'].map(f=>el('b',f===formation?'is-on':null,f))));
    const pitch=pitchLines('ob-pitch ob-pitch-tall');
    for(const p of players)pitch.append(player(team,p));
    pitch.append(at(el('span','ob-arrow ob-arrow-run'),28,38));
    const row=(className,mark,{number,name})=>h('div','ob-sub'+className,el('b',null,mark),paint(el('em',null,String(number)),team),el('span','ob-sub-name',name));
    const subs=h('div','ob-subs',el('span','ob-label','DEĞİŞİKLİK'),row(' ob-sub-out','▼',substitution.out),row(' ob-sub-in','▲',substitution.in),el('span','ob-label','YEDEKLER'),...bench.map(p=>row('','',p)));
    return [top,h('div','ob-board-grid',pitch,subs)];
  }
  function matchesArt(){
    const {fixtures,detail}=matchesShowcase;
    const list=h('div','ob-fixtures',h('div','ob-weekbar',el('b',null,'‹'),el('span',null,'Süper Lig · Hafta'),el('b',null,'›')));
    for(const [home,away,time,on] of fixtures)list.append(h('div','ob-fx'+(on?' is-active':''),teamTag(home,'ob-fx-team'),el('time',null,time),teamTag(away,'ob-fx-team is-away')));
    const lineup=(key,rows)=>h('div','ob-lineup',...rows.map(([number,name])=>h('span','ob-lineup-row',paint(el('em',null,String(number)),key),el('span',null,name))));
    const side=key=>h('span','ob-detail-side',crest(key,' ob-crest-lg'),el('strong',null,showcaseTeams[key].name));
    const card=h('div','ob-detail',h('div','ob-detail-head',side(detail.home),el('span','ob-detail-vs','20:00'),side(detail.away)),el('span','ob-label','KADROLAR'),h('div','ob-lineups',lineup(detail.home,detail.homeLineup),lineup(detail.away,detail.awayLineup)),el('span','ob-chip is-strong','Stüdyoda Aç →'));
    return [h('div','ob-matches-grid',list,card)];
  }
  function weeklyArt(){
    const {season,players,picker:rows}=weeklyShowcase;
    const field=el('div','ob-poster-field');
    for(const p of players)field.append(player(p.team,p));
    const poster=h('div','ob-poster',el('span','ob-poster-title',"HAFTANIN İLK 11'İ"),el('span','ob-poster-sub',`${season} · SÜPER LİG`),field);
    const picker=h('div','ob-picker',h('span','ob-field','⌕  Oyuncu ara'),...rows.map(p=>h('div','ob-pl'+(p.added?' is-added':''),paint(el('i','ob-pl-color'),p.team),h('span','ob-pl-name',el('strong',null,p.name),el('small',null,showcaseTeams[p.team].name)),el('b',null,p.added?'✓':'+'))));
    return [h('div','ob-weekly-grid',poster,picker),h('div','ob-actions',el('span','ob-chip','Önizle'),el('span','ob-chip','Kaydet'),el('span','ob-chip is-strong','PNG İndir ↓'))];
  }
  const artworks={welcome:welcomeArt,studio:studioArt,board:boardArt,matches:matchesArt,weekly:weeklyArt};
  function artwork(){
    const {key,name}=steps[step];
    const art=el('div','onboarding-art onboarding-art-'+key);art.setAttribute('aria-hidden','true');
    art.append(h('div','ob-art-head',el('span','onboarding-art-label','ÜRÜN GÖRÜNÜMÜ · TEMSİLİ'),el('span','ob-art-tool',name)),...artworks[key]());
    visual.append(art);
  }
  function picker(){
    const fieldset=el('fieldset','onboarding-teams');fieldset.append(el('legend',null,'Süper Lig · Favori takımın'));
    const list=el('div','onboarding-team-grid');choices=[];
    for(const team of [...(teams||[]),null]){
      const choice=createTeamChoice({document,team,prefix:'onboarding-team'});
      // Onboarding-only accent: the whole option picks up the club colors (shared picker markup is unchanged).
      const colors=teamColors(team);if(colors){choice.label.style.setProperty('--club-primary',colors[0]);choice.label.style.setProperty('--club-secondary',colors[1]);}
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
    const current=steps[step];
    progress.textContent=`${step+1} / ${steps.length}`;
    stepper.replaceChildren(...steps.map((item,i)=>{
      const li=h('li',i<step?'is-complete':i===step?'is-current':'',el('span','onboarding-stepper-bar'),el('span','onboarding-stepper-name',item.name));
      if(i===step)li.setAttribute('aria-current','step');return li;
    }));
    stepper.hidden=false;
    grid.className='onboarding-grid onboarding-step-'+current.key;
    const heading=el('h1','onboarding-title',current.title);heading.tabIndex=-1;
    copy.append(el('p','onboarding-eyebrow',`${String(step+1).padStart(2,'0')} · ${current.name}`),heading,el('p','onboarding-body',current.body));
    if(current.hints)copy.append(h('ul','onboarding-hints',...current.hints.map(hint=>el('li',null,hint))));
    if(step===last){if(needsProfile)copy.append(account);picker();}else artwork();
    footer.hidden=false;controls();if(focus)heading.focus();
  }
  function go(index){
    if(!active()||!initialized||busy||finished)return;
    step=Math.max(0,Math.min(last,index));message.textContent='';render(true);
    if(step===last&&!teams&&!loadingTeams)void loadTeams();
  }
  function move(delta){go(step+delta);}
  async function loadTeams(){
    if(!active()||loadingTeams||teams||busy||finished)return;
    loadingTeams=true;teamError=false;
    if(step===last){clearView();visual.replaceChildren();picker();}
    try{const result=await catalogue.loadTeams();if(!active())return;teams=result;}
    catch{if(!active())return;teamError=true;}
    loadingTeams=false;
    // Only rebuild the picker; retain step heading and navigation focus.
    if(step===last&&active()){
      const focused=choices.find(c=>c.input===document.activeElement)?.slug;
      clearView();visual.replaceChildren();picker();
      if(focused!==undefined)choices.find(c=>c.slug===focused)?.input.focus();
    }
  }
  async function complete(slug){
    if(!active()||!initialized||busy||finished||step!==last||slug===undefined)return;
    if(needsProfile){
      if(!usernameValid(username.value.trim())){message.textContent='Kullanıcı adı 3–24 karakter olmalı; yalnızca A–Z, a–z, 0–9 ve _ kullanılabilir.';username.focus();return;}
      if(!termsBox.checked){message.textContent='Devam etmek için Kullanım Koşulları’nı kabul etmelisin.';termsBox.focus();return;}
    }
    busy=true;message.textContent='';controls();
    if(needsProfile){
      let saved;try{saved=await api.save({username:username.value.trim(),display_name:'',termsAccepted:true});}catch{saved={ok:false};}
      if(!active())return;
      if(!saved.ok){busy=false;message.textContent=saved.error?.code==='username_conflict'?'Bu kullanıcı adı kullanılıyor. Başka bir kullanıcı adı seç.':'Profilin oluşturulamadı. Tekrar dene.';controls();return;}
      needsProfile=false;account.hidden=true;
    }
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
    needsProfile=!result.profile;
    initialized=true;render(true);
  }
  const ready=initialize();
  return {ready,dispose(){if(disposed)return;disposed=true;selected=undefined;teams=null;clearView();for(const remove of off)remove();root.replaceChildren();}};
}
