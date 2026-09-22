import {requestedMatchId} from './match-id.js';
import {createMatchLayout,matchPageUrl} from './match-layout.js';
import {MATCH_STATUS_LABELS,matchDate} from './matches.js';
import {createMatchBoard} from './match-board.js';
import {matchGoals,appendScorers} from './match-goals.js';

export function mountMatchStudio({document,window,api,current}) {
  const root=document.getElementById('matchStudioContent');
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const back=node('a','← Maç Merkezine Dön','match-studio-back');back.href=matchPageUrl('/mac',window.location.search);
  const status=node('p','','match-studio-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=node('button','Tekrar Dene');retry.type='button';retry.hidden=true;
  const content=node('div');root.replaceChildren(back,status,retry,content);
  const id=requestedMatchId(window.location.search);let stopped=false,busy=false,board=null,offReset=()=>{};
  const active=()=>!stopped&&current();
  async function load(){
    if(!active()||busy)return;
    if(!id){status.textContent='Maç bulunamadı.';return;}
    busy=true;retry.hidden=true;status.textContent='Maç stüdyosu hazırlanıyor…';
    let result;try{result=await api.load(id);}catch{result={ok:false};}
    if(!active())return;busy=false;
    if(!result.ok){const code=result.error?.code;status.textContent=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code)?'Maç bulunamadı.':code==='UNAUTHORIZED'?'Oturum doğrulanamadı. Giriş yapıp tekrar dene.':'Maç bilgileri şu anda alınamıyor.';retry.hidden=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code);return;}
    const match=result.match,model=createMatchLayout(match);
    if(!model){status.textContent='Bu maç için başlangıç kadroları mevcut değil. Onaylanmış ve eksiksiz iki ilk 11 gerekli.';return;}
    const header=node('div',undefined,'match-studio-summary'),goals=matchGoals(match);
    for(const side of ['home','away']){
      const team=model[side],col=node('div',undefined,'match-studio-team');col.style.setProperty('--club-primary',team.color);col.style.setProperty('--club-secondary',team.color2);
      col.append(node('h2',team.name),node('p',team.formation||'Diziliş bilgisi mevcut değil'));appendScorers(document,col,goals.rows[side]);header.append(col);
      if(side==='home'){
        const score=node('div',undefined,'match-studio-score');score.append(node('strong',match.status==='upcoming'?matchDate(match.kickoff).time:[match.score.home??'—',match.score.away??'—'].join(' – ')),node('span',MATCH_STATUS_LABELS[match.status]));header.append(score);
      }
    }
    const tools=node('div',undefined,'match-studio-tools'),reset=node('button','Gerçek Dizilişe Dön');reset.type='button';
    const note=node('p','Yerleşim, formasyon ve genel mevkilerden üretilen bir görselleştirmedir. Değişiklikler bu sayfa açıkken korunur.');
    tools.append(node('h1','Maç Stüdyosu'),reset);
    const instructions=node('p','Oyuncuyu seç: yedekler sahanın altında açılır. Üstüne bırakarak yer değiştir; ok tuşlarıyla taşı. Klavyeyle takas: bir oyuncuyu seç, diğerinde Shift+Enter kullan. Küçük ekranda sahanın boş alanını yatay kaydır.','match-studio-help');
    const boardRoot=node('div',undefined,'match-board-root');content.append(tools,header,instructions,boardRoot,note);
    try{board=createMatchBoard({root:boardRoot,document,model,utils:window.TAKTIK_BOARD_UTILS,current:active});}
    catch{content.replaceChildren();status.textContent='Maç stüdyosu şu anda açılamıyor. Sayfayı yeniden yükle.';return;}
    const resetBoard=()=>{if(active()){board.reset();status.textContent='Başlangıç yerleşimi geri yüklendi.';}};
    reset.addEventListener('click',resetBoard);offReset=()=>reset.removeEventListener('click',resetBoard);status.textContent='';
  }
  retry.addEventListener('click',load);
  return {ready:load(),dispose(){stopped=true;board?.dispose();offReset();retry.removeEventListener('click',load);root.replaceChildren();}};
}
