import {requestedRound} from './matches.js';
import {studioRoute,serializeStudioProject,projectBoardState} from './studio-project-snapshot.js';
import {createProjectRecovery} from './studio-autosave.js';
import {mountStudioSave} from './studio-save-ui.js';
import {createStudioDialog} from './studio-dialog.js';
import {createMatchLayout,matchPageUrl,createLocalCatalogue,createFreeTeam,emptyStudioTeam} from './match-layout.js';
import {createStudioPreferences} from './studio-preferences.js';
import {mountTeamPicker} from './studio-team-picker.js';
import {LINEUP_LABELS} from './studio-lineups.js';
import {createMatchBoard} from './match-board.js';

export function mountMatchStudio({document,window,api,current,projects,userId,playerOverrides}) {
  const root=document.getElementById('matchStudioContent');
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const back=node('a','← Maç Merkezine Dön','match-studio-back');back.href=matchPageUrl('/mac',window.location.search);
  const status=node('p','','match-studio-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=node('button','Tekrar Dene');retry.type='button';retry.hidden=true;
  const topbar=node('div',undefined,'match-studio-topbar');
  const content=node('div',undefined,'match-editor-workspace');root.replaceChildren(topbar,status,retry,content);
  const route=studioRoute(window.location.search),local=createLocalCatalogue(window);
  let stopped=false,busy=false,board=null,offReset=()=>{},offSidebar=()=>{},picker=null,saveUI=null,recoveryDialog=null;
  const active=()=>!stopped&&current();
  let storage,sessionStorage;try{storage=window.localStorage;sessionStorage=window.sessionStorage;}catch{}
  const newId=()=>window.crypto.randomUUID();
  const recovery=projects&&userId?createProjectRecovery({storage,sessionStorage,userId,newId,current:active}):null;
  let pendingRecovery=recovery?.read();
  function clearEditor(){recoveryDialog?.dispose();recoveryDialog=null;saveUI?.dispose();saveUI=null;picker?.dispose();picker=null;board?.dispose();board=null;offReset();offSidebar();content.replaceChildren();topbar.replaceChildren();}
  async function load(){
    if(!active()||busy)return;
    if(route.mode==='invalid_project'){status.textContent='Çalışma bulunamadı veya şu anda kullanılamıyor.';return;}
    if(route.mode==='invalid_match'){status.textContent='Maç bulunamadı.';return;}
    if(route.mode==='free'){setup({matchId:null,home:emptyStudioTeam(),away:emptyStudioTeam()},{source:{mode:'free',matchId:null,week:null}});return;}
    if(route.mode==='project'){
      busy=true;retry.hidden=true;status.textContent='Çalışma yükleniyor…';
      let result;try{result=await projects?.getProject(route.id);}catch{}
      if(!active())return;busy=false;
      const initial=result?.ok&&projectBoardState(result.project.snapshot);
      if(!initial){status.textContent='Çalışma bulunamadı veya şu anda kullanılamıyor.';retry.hidden=false;return;}
      try{await playerOverrides?.prepare?.(['home','away'].flatMap(side=>{const t=initial.model[side];return [...t.players,...t.bench].map(p=>(p.key.startsWith('local:')?'local:':p.key.startsWith('internal:')?'internal:':'bsd:')+p.playerId);}));}catch{status.textContent='Oyuncu düzenlemeleri şu anda yüklenemedi.';return;}
      if(!active())return;
      setup(initial.model,{source:result.project.snapshot.source,project:result.project,initial});return;
    }
    busy=true;retry.hidden=true;status.textContent='Maç stüdyosu hazırlanıyor…';
    let result;try{result=await api.load(route.id);}catch{result={ok:false};}
    if(!active())return;busy=false;
    if(!result.ok){const code=result.error?.code;status.textContent=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code)?'Maç bulunamadı.':code==='UNAUTHORIZED'?'Oturum doğrulanamadı. Giriş yapıp tekrar dene.':'Maç bilgileri şu anda alınamıyor.';retry.hidden=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code);return;}
    const match=result.match,model=createMatchLayout(match,local);
    if(!model){status.textContent='Bu maç için başlangıç kadroları mevcut değil. Eksiksiz iki kadro gerekli.';return;}
    setup(model,{source:{mode:'match',matchId:route.id,week:requestedRound(window.location.search)||null}});
  }
  function setup(model,{source,project=null,initial={},restored=null}){
    clearEditor();const free=source.mode==='free';
    if(!free){back.href='/mac?id='+source.matchId+(source.week?'&hafta='+source.week:'');back.textContent='← Maç Merkezine Dön';topbar.append(back);}
    const identity=node('div',undefined,'match-workspace-identity'),reset=node('button',free?'Başlangıç Yerleşimine Dön':'Kaynak Dizilişe Dön','match-tactical-button match-source-reset');reset.type='button';
    const names=node('p',free&&!model.home.name&&!model.away.name?'Takımları seçerek başla':(model.home.name||'Ev sahibi seçilmedi')+' — '+(model.away.name||'Deplasman seçilmedi'));
    const saveHost=node('div',undefined,'match-workspace-save');saveHost.hidden=!projects||!userId;
    identity.append(node('h1',free?'Serbest Stüdyo':'Maç Stüdyosu'),names);topbar.append(identity,saveHost);
    if(!free)for(const side of ['home','away'])identity.append(node('p',model[side].name+' · '+LINEUP_LABELS[model[side].lineupKind]));
    const sidebar=node('aside',undefined,'match-workspace-sidebar'),toggle=node('button','‹','match-sidebar-toggle'),toolbarHost=node('div',undefined,'match-tactical-host');
    toggle.type='button';toolbarHost.id='studioTools';toggle.setAttribute('aria-controls','studioTools');sidebar.append(toggle,toolbarHost);
    const pref=createStudioPreferences({getStorage:()=>window.localStorage,onSidebar(collapsed){content.classList.toggle('sidebar-collapsed',collapsed);toolbarHost.hidden=collapsed;toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Araç panelini aç':'Araç panelini daralt');toggle.textContent=collapsed?'›':'‹';}});
    const togglePanel=()=>{if(active())pref.toggleSidebar();};toggle.addEventListener('click',togglePanel);offSidebar=()=>toggle.removeEventListener('click',togglePanel);toolbarHost.setAttribute('aria-label','Maç stüdyosu araçları');
    const stage=node('section',undefined,'match-workspace-stage');stage.setAttribute('aria-label','Taktik çalışma alanı');
    const help=node('details',undefined,'match-workspace-help');help.append(node('summary','Kullanım ve kısayollar'));
    const note=node('p','Yerleşim, formasyon ve genel mevkilerden üretilir. Çalışmanı kaydederek oyuncuları, çizimleri ve saha görünümünü daha sonra aynı şekilde açabilirsin.');
    const instructions=node('p','Oyuncuyu seç: yedekler sahanın altında açılır. Üstüne bırakarak yer değiştir; ok tuşlarıyla taşı. Klavyeyle takas: bir oyuncuyu seç, diğerinde Shift+Enter kullan. Küçük ekranda sahanın boş alanını yatay kaydır.','match-studio-help');
    const boardRoot=node('div',undefined,'match-board-root');help.append(instructions,note);stage.append(boardRoot,help);content.append(sidebar,stage);
    try{board=createMatchBoard({root:boardRoot,document,model,utils:window.TAKTIK_BOARD_UTILS,current:active,toolbarHost,getPreferenceStorage:()=>window.localStorage,initial,playerOverrides,onChange:()=>saveUI?.controller.changed()});}
    catch{content.replaceChildren();status.textContent='Maç stüdyosu şu anda açılamıyor. Sayfayı yeniden yükle.';return;}
    if(projects&&userId)saveUI=mountStudioSave({document,window,host:saveHost,api:projects,current:active,
      capture:()=>serializeStudioProject({source,...board.exportState()}),project,restored,recovery,userId,newId,storage});
    if(free){
      const chosen={home:model.home.name||null,away:model.away.name||null};
      picker=mountTeamPicker({document,host:toolbarHost,catalogue:local,current:active,selected:side=>chosen[side],onSelect(side,team){
        const value=createFreeTeam(team,side,local);if(!value){status.textContent='Bu takım için eksiksiz bir yerel 11 bulunamadı.';return false;}
        board.setTeam(side,value);chosen[side]=team.name;names.textContent=(chosen.home||'Ev sahibi seçilmedi')+' — '+(chosen.away||'Deplasman seçilmedi');status.textContent='Yerel kadro · 4-3-3';return true;
      }});
    }
    const resetGroup=node('section',undefined,'match-source-tools');resetGroup.append(reset);toolbarHost.append(resetGroup);
    const resetBoard=()=>{if(active()){board.reset();status.textContent='';}};
    reset.addEventListener('click',resetBoard);offReset=()=>reset.removeEventListener('click',resetBoard);status.textContent='';
    if(pendingRecovery&&(!project||pendingRecovery.id===project.id)){
      const notice=node('section',undefined,'studio-recovery'),recover=node('button','Yerel Çalışmayı Kurtar'),discard=node('button','Yoksay');
      recover.type=discard.type='button';notice.append(node('p','Kaydedilememiş bir yerel çalışma bulundu. Kurtarmak istediğinde son düzenlemelerini geri yükleyebilirsin.'),recover,discard);topbar.append(notice);
      recoveryDialog=createStudioDialog({document,host:topbar});
      recover.addEventListener('click',async()=>{
        if(!active()||saveUI?.controller.getState().saving)return;
        if(saveUI?.controller.getState().dirty){
          const yes=await recoveryDialog.ask({title:'Yerel çalışmayı kurtar',message:'Bu sayfadaki kaydedilmemiş değişikliklerin yerine kurtarma kopyası açılacak.',confirm:'Kurtarma Kopyasını Aç',opener:recover});
          if(!yes||!active()||saveUI?.controller.getState().saving)return;
        }
        const saved=pendingRecovery,state=projectBoardState(saved.snapshot);pendingRecovery=null;recovery.adopt();
        setup(state.model,{source:saved.snapshot.source,initial:state,restored:saved});
      });
      discard.addEventListener('click',()=>{if(!active())return;pendingRecovery=null;recovery.discardPrevious();notice.remove();});
    }
  }
  retry.addEventListener('click',load);
  return {ready:load(),dispose(){stopped=true;clearEditor();retry.removeEventListener('click',load);root.replaceChildren();}};
}
