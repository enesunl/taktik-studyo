import {requestedMatchId} from './match-id.js';
import {createMatchLayout,matchPageUrl,createLocalCatalogue,createFreeTeam,emptyStudioTeam} from './match-layout.js';
import {createStudioPreferences} from './studio-preferences.js';
import {mountTeamPicker} from './studio-team-picker.js';
import {LINEUP_LABELS} from './studio-lineups.js';
import {createMatchBoard} from './match-board.js';

export function mountMatchStudio({document,window,api,current}) {
  const root=document.getElementById('matchStudioContent');
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const back=node('a','← Maç Merkezine Dön','match-studio-back');back.href=matchPageUrl('/mac',window.location.search);
  const status=node('p','','match-studio-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=node('button','Tekrar Dene');retry.type='button';retry.hidden=true;
  const topbar=node('div',undefined,'match-studio-topbar');topbar.append(back);
  const content=node('div',undefined,'match-editor-workspace');root.replaceChildren(topbar,status,retry,content);
  const id=requestedMatchId(window.location.search);let stopped=false,busy=false,board=null,offReset=()=>{},offSidebar=()=>{},picker=null;
  const free=!new URLSearchParams(window.location.search).has('id'),local=createLocalCatalogue(window);
  const active=()=>!stopped&&current();
  async function load(){
    if(!active()||busy)return;
    if(free){setup({matchId:null,home:emptyStudioTeam(),away:emptyStudioTeam()});return;}
    if(!id){status.textContent='Maç bulunamadı.';return;}
    busy=true;retry.hidden=true;status.textContent='Maç stüdyosu hazırlanıyor…';
    let result;try{result=await api.load(id);}catch{result={ok:false};}
    if(!active())return;busy=false;
    if(!result.ok){const code=result.error?.code;status.textContent=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code)?'Maç bulunamadı.':code==='UNAUTHORIZED'?'Oturum doğrulanamadı. Giriş yapıp tekrar dene.':'Maç bilgileri şu anda alınamıyor.';retry.hidden=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code);return;}
    const match=result.match,model=createMatchLayout(match,local);
    if(!model){status.textContent='Bu maç için başlangıç kadroları mevcut değil. Eksiksiz iki kadro gerekli.';return;}
    setup(model);
  }
  function setup(model){
    const identity=node('div',undefined,'match-workspace-identity'),reset=node('button',free?'Başlangıç Yerleşimine Dön':'Kaynak Dizilişe Dön');reset.type='button';
    const names=node('p',free?'Takımları seçerek başla':model.home.name+' — '+model.away.name);
    identity.append(node('h1',free?'Serbest Stüdyo':'Maç Stüdyosu'),names);topbar.append(identity,reset);
    if(!free)for(const side of ['home','away'])identity.append(node('p',model[side].name+' · '+LINEUP_LABELS[model[side].lineupKind]));
    if(free){back.href='/maclar';back.textContent='Maçlara dön';}
    const sidebar=node('aside',undefined,'match-workspace-sidebar'),toggle=node('button','‹','match-sidebar-toggle'),toolbarHost=node('div',undefined,'match-tactical-host');
    toggle.type='button';toolbarHost.id='studioTools';toggle.setAttribute('aria-controls','studioTools');sidebar.append(toggle,toolbarHost);
    const pref=createStudioPreferences({getStorage:()=>window.localStorage,onSidebar(collapsed){content.classList.toggle('sidebar-collapsed',collapsed);toolbarHost.hidden=collapsed;toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Araç panelini aç':'Araç panelini daralt');toggle.textContent=collapsed?'›':'‹';}});
    const togglePanel=()=>{if(active())pref.toggleSidebar();};toggle.addEventListener('click',togglePanel);offSidebar=()=>toggle.removeEventListener('click',togglePanel);toolbarHost.setAttribute('aria-label','Maç stüdyosu araçları');
    const stage=node('section',undefined,'match-workspace-stage');stage.setAttribute('aria-label','Taktik çalışma alanı');
    const help=node('details',undefined,'match-workspace-help');help.append(node('summary','Kullanım ve kısayollar'));
    const note=node('p','Yerleşim, formasyon ve genel mevkilerden üretilir. Oyuncular ve çizimler yalnızca bu sayfa açıkken korunur.');
    const instructions=node('p','Oyuncuyu seç: yedekler sahanın altında açılır. Üstüne bırakarak yer değiştir; ok tuşlarıyla taşı. Klavyeyle takas: bir oyuncuyu seç, diğerinde Shift+Enter kullan. Küçük ekranda sahanın boş alanını yatay kaydır.','match-studio-help');
    const boardRoot=node('div',undefined,'match-board-root');help.append(instructions,note);stage.append(boardRoot,help);content.append(sidebar,stage);
    try{board=createMatchBoard({root:boardRoot,document,model,utils:window.TAKTIK_BOARD_UTILS,current:active,toolbarHost,getPreferenceStorage:()=>window.localStorage});}
    catch{content.replaceChildren();status.textContent='Maç stüdyosu şu anda açılamıyor. Sayfayı yeniden yükle.';return;}
    if(free){
      const chosen={home:null,away:null};
      picker=mountTeamPicker({document,host:toolbarHost,catalogue:local,current:active,selected:side=>chosen[side],onSelect(side,team){
        const value=createFreeTeam(team,side,local);if(!value){status.textContent='Bu takım için eksiksiz bir yerel 11 bulunamadı.';return false;}
        board.setTeam(side,value);chosen[side]=team.name;names.textContent=(chosen.home||'Ev sahibi seçilmedi')+' — '+(chosen.away||'Deplasman seçilmedi');status.textContent='Yerel kadro · 4-3-3';return true;
      }});
    }
    const resetBoard=()=>{if(active()){board.reset();status.textContent='Başlangıç yerleşimi geri yüklendi.';}};
    reset.addEventListener('click',resetBoard);offReset=()=>reset.removeEventListener('click',resetBoard);status.textContent='';
  }
  retry.addEventListener('click',load);
  return {ready:load(),dispose(){stopped=true;picker?.dispose();board?.dispose();offReset();offSidebar();retry.removeEventListener('click',load);root.replaceChildren();}};
}
