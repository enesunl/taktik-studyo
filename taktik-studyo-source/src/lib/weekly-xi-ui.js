import {shortPlayerLabel} from './player-label.js';
import {createWeeklyPitch} from './weekly-xi-pitch.js';
import {WEEKLY_FORMATIONS,WEEKLY_BOUNDS,emptyWeeklyXI,weeklyCatalogue,searchWeeklyPlayers,changeWeeklyFormation,pickWeeklyPlayer,moveWeeklySlot,createWeeklyStore} from './weekly-xi.js';
import {mountWeeklyPreview} from './weekly-xi-preview.js';
import {latestPlayedWeek} from './weekly-xi-panel.js';
import {createWeeklyPoster} from './weekly-xi-poster.js';
import {canonicalWeeklySnapshot} from './weekly-lineups.js';

const ROLE_NAMES={GK:'Kaleci',LB:'Sol bek',CB:'Stoper',RB:'Sağ bek',DM:'Ön libero',CM:'Merkez orta saha',AM:'Ofansif orta saha',LM:'Sol orta saha',RM:'Sağ orta saha',LW:'Sol kanat',RW:'Sağ kanat',ST:'Forvet'};

export function mountWeeklyXI({document,window,current,userId,catalogue,playerOverrides,matchesApi,records,now=Date.now}){
 const root=document.getElementById('weeklyXIContent'),utils=window.TAKTIK_BOARD_UTILS;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,cls)=>{const b=node('button',text,cls);b.type='button';return b;};
 let storage;try{storage=window.localStorage;}catch{storage=null;}
 let stopped=false,selected=null,cancelGesture=null,state=emptyWeeklyXI();const active=()=>!stopped&&current();
 const suppressedClicks=new WeakSet();
 const params=new URLSearchParams(window.location.search||''),requestedSource=params.getAll('saved').length===1?params.get('saved'):null;
 const source=['canonical','legacy'].includes(requestedSource)?requestedSource:catalogue.source;
 const store=createWeeklyStore({userId,source,storage,current:active,now}),saved=store.read();if(!records&&saved.ok&&saved.state)state=saved.state;
 let recordId=null,revision=null,saving=false,loading=!!records&&params.has('id'),loadFailed=false,editRevision=0,imported=false;
 const players=weeklyCatalogue(catalogue.model);
 const metadata={week:null};
 const effective=p=>playerOverrides?.effective(playerOverrides.key(p.id),p)||p;
 const header=node('div',undefined,'weekly-toolbar'),heading=node('div');heading.append(node('p','SENİN SEÇİMİN. SENİN KADRON.','weekly-eyebrow'),node('h1','Haftanın İlk 11’i'));
 const controls=node('div',undefined,'weekly-controls'),label=node('label'),formation=node('select');formation.setAttribute('aria-label','Diziliş');
 for(const shape of Object.keys(WEEKLY_FORMATIONS)){const o=node('option',shape);o.value=shape;formation.append(o);}formation.value=state.formation;label.append(formation);
 controls.setAttribute('role','group');controls.setAttribute('aria-label','Kadro düzenleme araçları');header.dataset.editControl='true';
 const save=button('Kaydet','weekly-save');save.title=records?'Hesabına kaydet':'Bu tarayıcıya kaydet';
 const saveGroup=node('div',undefined,'weekly-save-group'),saveState=node('span',saved.state?'Kaydedildi':'Henüz kaydedilmedi','weekly-save-state');saveState.id='weeklySaveState';save.setAttribute('aria-describedby',saveState.id);saveGroup.append(save,saveState);controls.append(label,saveGroup);header.append(heading,controls);
 const previewButton=button('Önizle','weekly-preview-trigger');controls.append(previewButton);
 const details=node('div',undefined,'weekly-record-details'),nameLabel=node('label','Kadro adı'),nameInput=node('input');nameInput.value='Haftanın ilk 11’i';nameInput.maxLength=120;nameLabel.append(nameInput);
 const seasonLabel=node('label','Sezon (isteğe bağlı)'),seasonInput=node('input');seasonInput.placeholder='2026/27';seasonLabel.append(seasonInput);
 const weekLabel=node('label','Hafta (isteğe bağlı)'),weekInput=node('input');weekInput.type='number';weekInput.min='1';weekInput.max='60';weekLabel.append(weekInput);
 const fresh=button('Yeni kadro','weekly-new');details.append(nameLabel,seasonLabel,weekLabel,fresh);details.dataset.editControl='true';details.hidden=!records;
 const localSources=['canonical','legacy'].map(key=>({key,...createWeeklyStore({userId,source:key,storage,current:active,now}).read()})).filter(value=>value.ok&&value.state);
 const importSource=node('select');importSource.setAttribute('aria-label','Yerel kadro kaynağı');for(const local of localSources){const option=node('option',local.key==='canonical'?'Güncel katalog kaydı':'Eski katalog kaydı');option.value=local.key;importSource.append(option);}importSource.value=localSources[0]?.key||'';importSource.hidden=!records||localSources.length<2;
 const importDraft=button('Bu tarayıcıdaki eski kadroyu içe aktar','weekly-import');importDraft.hidden=!records||!localSources.length||loading;details.append(importSource,importDraft);
 const status=node('p','','weekly-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');status.dataset.visible='false';status.dataset.editControl='true';
 const schedule=(fn,ms)=>window.setTimeout?window.setTimeout(fn,ms):globalThis.setTimeout(fn,ms),unschedule=id=>window.clearTimeout?window.clearTimeout(id):globalThis.clearTimeout(id);let toastTimer=null;
 function notify(message,error=false){
  if(!active())return;unschedule(toastTimer);status.textContent=message;status.dataset.visible='true';status.dataset.error=String(error);
  toastTimer=schedule(()=>{toastTimer=null;if(active()){status.dataset.visible='false';status.textContent='';}},error?6500:3200);
 }
 function dirty(){editRevision++;unschedule(toastTimer);toastTimer=null;status.textContent='';status.dataset.visible='false';saveState.textContent='Kaydedilmedi';saveState.dataset.dirty='true';}
 const workspace=node('div',undefined,'weekly-workspace'),left=node('aside',undefined,'weekly-poster weekly-poster-left');left.setAttribute('aria-hidden','true');
 const editorial=node('div',undefined,'weekly-poster-type');editorial.append(node('strong','TEAM','weekly-poster-title'),node('span','OF THE','weekly-poster-connector'),node('strong','WEEK','weekly-poster-title'));
 left.append(node('span','TAKTİK STÜDYO / SEÇKİ','weekly-eyebrow'),editorial,node('span','11 OYUNCU.\nTEK BİR BAKIŞ AÇISI.','weekly-poster-caption'));
 const fieldWrap=node('section',undefined,'weekly-field-wrap'),field=node('div',undefined,'weekly-pitch');field.setAttribute('aria-label','Haftanın ilk 11 sahası');
 const visual=node('div',undefined,'weekly-pitch-visual');visual.setAttribute('aria-hidden','true');field.append(visual);
 function renderPitch(value=state){visual.replaceChildren(createWeeklyPitch({document,utils,state:value,effective}));}
 const markings=node('div',undefined,'weekly-markings');markings.setAttribute('aria-hidden','true');
 for(const cls of ['weekly-half','weekly-circle','weekly-box-top','weekly-box-bottom','weekly-goal-top','weekly-goal-bottom'])markings.append(node('i',undefined,cls));
 const slots=node('div',undefined,'weekly-slots'),count=node('span','','weekly-count');field.append(markings,slots);fieldWrap.append(field,count);
 const right=node('aside',undefined,'weekly-poster weekly-poster-right');right.setAttribute('aria-label','Süper Lig hafta bilgisi');
 function renderPanel(){right.replaceChildren(createWeeklyPoster({document,slots:state.slots,week:metadata.week,idPrefix:'weekly-page'}));}
 workspace.dataset.composition='weekly-xi';workspace.append(left,fieldWrap,right);
 const note=node('p','Oyuncuları sürükle veya ok tuşlarıyla taşı (Shift: büyük adım). Dokunarak değiştir ya da kaldır. Kayıt bu tarayıcıda hesabına göre ayrılır; cihazlar arasında eşitlenmez. Ortak tarayıcıda gizli veri saklama.','weekly-local-note');note.id='weeklyMovementHint';note.dataset.editControl='true';
 const dialog=node('dialog',undefined,'weekly-picker');dialog.setAttribute('aria-labelledby','weeklyPickerTitle');
 const title=node('h2','Oyuncu seç');title.id='weeklyPickerTitle';const close=button('×','weekly-picker-close');close.setAttribute('aria-label','Oyuncu seçimini kapat');
 const dialogHead=node('div',undefined,'weekly-picker-head');dialogHead.append(title,close);
 const searchLabel=node('label','Oyuncu veya takım ara'),search=node('input');search.type='search';search.autocomplete='off';search.placeholder='Oyuncu ara…';searchLabel.append(search);
 const resultStatus=node('p','','weekly-results-status');resultStatus.setAttribute('role','status');resultStatus.setAttribute('aria-live','polite');
 const results=node('div',undefined,'weekly-results'),remove=button('Oyuncuyu kaldır','weekly-remove');
 dialog.append(dialogHead,searchLabel,resultStatus,results,remove);
 if(records){note.textContent='Kayıtlar hesabında saklanır. Eski tarayıcı kayıtları yalnızca açıkça içe aktarıp Kaydet’e bastığında yüklenir; tarayıcıdaki kayıt silinmez.';saveState.textContent=loading?'Kadro yükleniyor…':'Henüz kaydedilmedi';}
 root.replaceChildren(header,details,status,workspace,note,dialog);
 previewButton.addEventListener('click',()=>{if(active()){cancelGesture?.();unschedule(toastTimer);status.textContent='';status.dataset.visible='false';}});
 const preview=mountWeeklyPreview({document,window,root,trigger:previewButton,getState:()=>state,effective,utils,current:active,metadata});
 let slotButtons=[];const slotGroups=new Map();
 function jersey(p){const icon=utils.createJersey(p.number);icon.style.setProperty('--team',p.color);icon.style.setProperty('--team2',p.color2);icon.style.setProperty('--jersey-number',utils.jerseyNumberColor(p.color));return icon;}
 function position(button,slot){button.style.left=slot.x+'%';button.style.top=slot.y+'%';const group=slotGroups.get(button);group?.style.setProperty('--slot-x',slot.x+'%');group?.style.setProperty('--slot-y',slot.y+'%');if(group)group.dataset.actionsAbove=String(slot.y>75);}
 function moved(){renderPitch();dirty();}
 function movementBounds(b,rect){
  const x=Math.min(50,Math.max(WEEKLY_BOUNDS.minX,(b.offsetWidth/2+4)/rect.width*100)),y=Math.min(50,Math.max(WEEKLY_BOUNDS.minY,(b.offsetHeight/2+4)/rect.height*100));
  return {minX:x,maxX:Math.min(WEEKLY_BOUNDS.maxX,100-x),minY:y,maxY:Math.min(WEEKLY_BOUNDS.maxY,100-y)};
 }
 function startDrag(event,slotId,b){
  if(!active()||cancelGesture||!state.slots[slotId].player||event.button!==0||event.isPrimary===false)return;
  const rect=field.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const original=state.slots[slotId],start={x:event.clientX,y:event.clientY,px:original.x,py:original.y};
  let next=original,dragged=false,finished=false;suppressedClicks.delete(b);b.focus({preventScroll:true});b.setPointerCapture(event.pointerId);
  function move(e){
   if(e.pointerId!==event.pointerId)return;if(!active()){cancelGesture?.();return;}
   if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
   if(!dragged&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<5)return;
   dragged=true;e.preventDefault();b.classList.add('weekly-dragging');
   next=utils.dragCoordinates(start,e,rect,movementBounds(b,rect));position(b,next);renderPitch(moveWeeklySlot(state,slotId,next.x,next.y));
  }
  function end(e){
   if(finished||e.pointerId!==undefined&&e.pointerId!==event.pointerId)return;
   if(e.type==='pointerup')move(e);if(finished)return;
   finished=true;stop();window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);cancelGesture=null;
   b.classList.remove('weekly-dragging');try{b.releasePointerCapture(event.pointerId);}catch{/* Capture may already be lost. */}
   if(dragged){suppressedClicks.add(b);if(e.type==='pointerup'&&active()){state=moveWeeklySlot(state,slotId,next.x,next.y);moved();}}
   position(b,state.slots[slotId]);renderPitch();
  }
  const cancel=()=>end({type:'pointercancel'}),stop=utils.listenForDrag(b,move,end);
  cancelGesture=cancel;window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);
 }
 function moveKey(event,slotId,b){
  if(event.key==='Escape'&&cancelGesture){event.preventDefault();cancelGesture();return;}
  if(!active()||cancelGesture||!state.slots[slotId].player||event.ctrlKey||event.metaKey||event.altKey)return;
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta)return;
  event.preventDefault();const slot=state.slots[slotId],step=event.shiftKey?3:1,rect=field.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const bounds=movementBounds(b,rect);
  state=moveWeeklySlot(state,slotId,utils.clamp(slot.x+delta[0]*step,bounds.minX,bounds.maxX),utils.clamp(slot.y+delta[1]*step,bounds.minY,bounds.maxY));position(b,state.slots[slotId]);moved();
 }
 function render(){
  cancelGesture?.();
  renderPanel();renderPitch();
  slots.replaceChildren();slotButtons=[];slotGroups.clear();formation.value=state.formation;
  count.textContent=state.slots.filter(s=>s.player).length+' / 11 SEÇİLDİ';
  for(const slot of state.slots){
   const p=slot.player&&effective(slot.player),b=button(undefined,'weekly-slot'),group=node('div',undefined,'weekly-slot-group');slotGroups.set(b,group);
   const lineSize=Math.max(...WEEKLY_FORMATIONS[state.formation].map(row=>row.length));group.style.setProperty('--slot-width',lineSize>5?'13%':lineSize>4?'16%':'18%');
   position(b,slot);b.dataset.slotId=String(slot.slotId);b.dataset.filled=String(!!p);group.append(b);
   b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-label',p?p.name+', '+ROLE_NAMES[slot.role].toLocaleLowerCase('tr')+' slotu; oyuncuyu değiştir':ROLE_NAMES[slot.role]+' için oyuncu seç');
   if(p)b.setAttribute('aria-describedby','weeklyMovementHint');
   if(p){b.append(jersey(p),node('span',shortPlayerLabel(p),'weekly-player-name'));b.title=p.name+' · '+p.teamName;}
   else {const plus=node('span','+','weekly-plus');plus.setAttribute('aria-hidden','true');plus.dataset.editControl='true';b.append(plus);}
   if(p){
    const actions=node('div',undefined,'weekly-slot-actions');actions.setAttribute('role','group');actions.setAttribute('aria-label',p.name+' işlemleri');actions.dataset.editControl='true';
    const replace=button('Değiştir','weekly-replace'),drop=button('Kaldır','weekly-drop');replace.setAttribute('aria-label',p.name+' yerine oyuncu seç');drop.setAttribute('aria-label',p.name+' oyuncusunu kaldır');
    replace.addEventListener('click',()=>open(slot.slotId));drop.addEventListener('click',()=>{if(!active()||cancelGesture)return;state=pickWeeklyPlayer(state,slot.slotId,null);render();dirty();slotButtons[slot.slotId]?.focus();});actions.append(replace,drop);group.append(actions);
   }
   b.append(node('span',slot.role,'weekly-role'));b.addEventListener('click',e=>{if(e.detail!==0&&suppressedClicks.delete(b))return;open(slot.slotId);});
   b.addEventListener('pointerdown',e=>startDrag(e,slot.slotId,b));b.addEventListener('keydown',e=>moveKey(e,slot.slotId,b));slots.append(group);slotButtons.push(b);
  }
 }
 function closePicker(){const index=selected;dialog.close();selected=null;if(active())slotButtons[index]?.focus();}
 function choose(player){if(!active()||selected===null)return;const next=pickWeeklyPlayer(state,selected,player);if(!next)return;state=next;render();dirty();closePicker();}
 function renderResults(){
  if(!active())return;results.replaceChildren();
  const found=searchWeeklyPlayers(players.map(effective),search.value||'');
  resultStatus.textContent=!found.length?'Oyuncu bulunamadı.':found.length>80?found.length+' oyuncu · İlk 80 sonuç. Aramanı daraltabilirsin.':found.length+' oyuncu';
  for(const display of found.slice(0,80)){
   const original=players.find(p=>p.id===display.id),used=state.slots.some(s=>s.slotId!==selected&&s.player?.id===display.id),b=button(undefined,'weekly-result');
   b.disabled=used;b.dataset.playerId=display.id;const details=node('span',undefined,'weekly-result-copy');
   details.append(node('strong',display.name),node('span',display.teamName+' · '+(display.number??'—')+' · '+(original.specificPosition||{G:'GK',D:'DEF',M:'MID',F:'FWD'}[original.positionGroup])));
   b.append(jersey(display),details,node('span',used?'Kadronuzda':'+','weekly-result-action'));b.addEventListener('click',()=>choose(original));results.append(b);
  }
 }
 function open(index){if(!active()||cancelGesture)return;selected=index;title.textContent=state.slots[index].role+' için oyuncu seç';remove.hidden=!state.slots[index].player;search.value='';renderResults();dialog.showModal();search.focus();}
 search.addEventListener('input',renderResults);close.addEventListener('click',closePicker);remove.addEventListener('click',()=>choose(null));
 dialog.addEventListener('cancel',e=>{e.preventDefault();closePicker();});
 formation.addEventListener('change',()=>{if(!active()||!Object.hasOwn(WEEKLY_FORMATIONS,formation.value))return;state=changeWeeklyFormation(state,formation.value);render();dirty();notify('Diziliş değişti. Oyuncuların korundu.');});
 function lock(){for(const b of slotButtons)b.disabled=loading||loadFailed;formation.disabled=loading||loadFailed;for(const input of [nameInput,seasonInput,weekInput])input.disabled=loading;save.disabled=loading||saving||loadFailed;fresh.disabled=loading||saving;importDraft.disabled=loading||saving;}
 for(const input of [nameInput,seasonInput,weekInput])input.addEventListener('input',dirty);
 fresh.addEventListener('click',()=>{if(!active()||loading||saving)return;recordId=revision=null;loadFailed=false;imported=false;state=emptyWeeklyXI();nameInput.value='Haftanın ilk 11’i';seasonInput.value=weekInput.value='';window.history?.replaceState(null,'','/haftanin-ilk-11i');render();dirty();lock();});
 importDraft.addEventListener('click',()=>{if(!active()||loading||saving)return;const local=localSources.find(item=>item.key===importSource.value);if(!canonicalWeeklySnapshot(local?.state)){notify('Eski oyuncu kimlikleri güncel katalogla uyumlu değil. Oyuncuları yeniden seçerek yeni kadro oluştur.',true);return;}state=local.state;recordId=revision=null;imported=true;seasonInput.value=weekInput.value='';window.history?.replaceState(null,'','/haftanin-ilk-11i');render();dirty();notify('Yerel kadro açıldı. Hesabına yüklemek için Kaydet’e bas.');});
 save.addEventListener('click',async()=>{
  if(!active()||saving||loading||loadFailed)return;cancelGesture?.();
  if(!records){const ok=store.write(state);if(ok){saveState.textContent='Kaydedildi';saveState.dataset.dirty='false';}notify(ok?'Kadron kaydedildi.':'Kaydetme başarısız. Tarayıcı depolamasını kontrol edip tekrar dene.',!ok);return;}
  saving=true;lock();const turn=editRevision;saveState.textContent='Kaydediliyor…';
  try{recordId??=window.crypto.randomUUID();const r=await records.save({id:recordId,revision,title:nameInput.value,season:seasonInput.value.trim()||null,week:weekInput.value===''?null:Number(weekInput.value),snapshot:state});
   if(!active())return;if(!r.ok){saveState.textContent='Kaydedilemedi';notify(r.error?.code==='conflict'?'Kadro başka bir sekmede değişti. Yeniden açarak devam et.':'Kaydetme başarısız. Kadro adını, sezonu, haftayı ve bağlantını kontrol et.',true);return;}
   revision=r.record.revision;window.history?.replaceState(null,'','/haftanin-ilk-11i?id='+recordId);
   saveState.textContent=turn===editRevision?'Kaydedildi':'Kaydedilmedi';saveState.dataset.dirty=String(turn!==editRevision);notify('Kadron hesabına kaydedildi.');
  }catch{if(active()){saveState.textContent='Kaydedilemedi';notify('Kayıt tamamlanamadı. Tekrar dene.',true);}}
  finally{saving=false;if(active())lock();}
 });
 const off=playerOverrides?.subscribe(()=>{if(active()){render();if(selected!==null)renderResults();preview.refresh();}})||(()=>{});
 render();
 if(!players.length)notify('Oyuncu kataloğu şu anda kullanılamıyor. Sayfayı yeniden açarak tekrar dene.',true);
 else if(!saved.ok)notify('Kayıt okunamadı. Yeni bir kadro oluşturabilirsin.',true);
 else if(!records&&saved.state)notify('Kadron yüklendi.');
 lock();
 const recordReady=(async()=>{if(!loading)return;try{const r=params.getAll('id').length===1?await records.get(params.get('id')):{ok:false};if(!active())return;if(!r.ok)throw Error();const row=r.record;recordId=row.id;revision=row.revision;state=row.snapshot;nameInput.value=row.title;seasonInput.value=row.season??'';weekInput.value=row.week===null?'':String(row.week);render();saveState.textContent='Kaydedildi';}catch{if(active()){loadFailed=true;saveState.textContent='Kadro açılamadı';notify('Kadro bulunamadı veya erişilemiyor. Yeni kadro açabilir ya da koleksiyondan tekrar deneyebilirsin.',true);}}finally{loading=false;if(active())lock();}})();
 const ready=(async()=>{
  let resultMatches=[];
  try{const result=await matchesApi?.load();if(!active())return;resultMatches=result?.ok?result.matches:[];metadata.week=latestPlayedWeek(resultMatches,now());}
  catch{if(!active())return;metadata.week=null;}
  if(active()){
   // Only a new, untouched record gets real match context. Imports retain unknown metadata.
   if(records&&!recordId&&!loading&&!loadFailed&&!imported&&editRevision===0&&metadata.week!==null){
    weekInput.value=String(metadata.week);
    const played=resultMatches.find(m=>m.round===metadata.week&&m.status==='finished'&&Date.parse(m.kickoff)<=now());
    if(/^\d{4}-\d{4}$/.test(played?.season||''))seasonInput.value=played.season.replace('-','/');
   }
   renderPanel();preview.refresh();
  }
 })();
 return {ready:Promise.all([ready,recordReady]),dispose(){stopped=true;unschedule(toastTimer);cancelGesture?.();preview.dispose();off();if(dialog.open)dialog.close();slotGroups.clear();root.replaceChildren();}};
}
