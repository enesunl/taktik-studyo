'use strict';
// Contrast is computed from sRGB luminance, using the higher-contrast black/white number.
function jerseyNumberColor(color){
 const hex=/^#[0-9a-f]{6}$/i.test(color)?color.slice(1):'18231d';
 const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}

function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function pitchPoint(event,rect){return {x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};}
function dragCoordinates(start,event,rect,bounds){
 return {x:clamp(start.px+(event.clientX-start.x)/rect.width*100,bounds.minX,bounds.maxX),y:clamp(start.py+(event.clientY-start.y)/rect.height*100,bounds.minY,bounds.maxY)};
}
function listenForDrag(target,move,end){
 target.addEventListener('pointermove',move);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])target.addEventListener(type,end);
 return ()=>{target.removeEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])target.removeEventListener(type,end);};
}
// Fixed decorative SVG only; player data is always assigned with textContent.
function createJersey(number){
 const jersey=document.createElement('span');jersey.className='player-jersey';
 jersey.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="jersey-body" d="M22 5 10 10 2 24 12 30 17 22 17 59 47 59 47 22 52 30 62 24 54 10 42 5 38 10 26 10Z"/><path class="jersey-accent" d="m2 24 10 6 3-5-10-6Zm50 6 10-6-3-5-10 6ZM22 5l4 5h12l4-5-3 10H25Z"/></svg>';
 const label=document.createElement('b');label.className='shirt-number';label.textContent=number??'–';jersey.append(label);return jersey;
}
const localTeams=window.TAKTIK_TEAMS || [
['Galatasaray','GS','#a51935','#efb62a'],['Fenerbahçe','FB','#19294d','#f3d233'],['Beşiktaş','BJK','#222222','#eeeeee'],['Trabzonspor','TS','#702039','#8cc1dc'],['Samsunspor','SAM','#ca303a','#eeeeee'],['Başakşehir','İBF','#ed7835','#213a63'],['Göztepe','GÖZ','#bb2039','#edc932'],['Çaykur Rizespor','RİZ','#198c55','#276dad'],['Kasımpaşa','KAS','#173c74','#ffffff'],['Konyaspor','KON','#23855c','#ffffff'],['Alanyaspor','ALA','#ef802b','#228756'],['Gaziantep FK','GFK','#c3313c','#252b2b'],['Eyüpspor','EYP','#713576','#e6be42'],['Kocaelispor','KOC','#148255','#242b28'],['Gençlerbirliği','GEN','#b72637','#262725'],['Erzurumspor FK','ERZ','#2c65ad','#ffffff'],['Amedspor','AMD','#168553','#c5353d'],['Çorum FK','ÇOR','#c1303b','#242a28']].map(([name,short,color,color2])=>({name,short,color,color2}));
function coordinates(shape){const rows=shape.split('-').map(Number),result=[{x:50,y:89,role:'KL'}];rows.forEach((n,row)=>{const y=rows.length===2?65-row*42:73-row*(56/(rows.length-1));for(let i=0;i<n;i++){let role=row===0?(i===0&&n===4?'SLB':i===n-1&&n===4?'SĞB':'STP'):row===rows.length-1?(n>=3?(i===0?'SLK':i===n-1?'SĞK':'SF'):'SF'):rows.length>=4&&row===1?'ÖL':row===rows.length-2&&rows.length>=4?'OO':'MO';result.push({x:n===1?50:n===2?34+i*32:16+i*(68/(n-1)),y,role});}});return result;}

// Shared local roster selection; the classic board retains its existing slot fallback.
function selectRosterXI(squad,shape='4-3-3'){
 if(window.TAKTIK_CATALOGUE_RUNTIME?.canonical)return window.TAKTIK_CATALOGUE_RUNTIME.selectXI(squad,shape);
 const available=[...(squad?.players||[])].sort((a,b)=>(Number(!!b.photo)-Number(!!a.photo))||((b.starts??0)-(a.starts??0))||((b.value??0)-(a.value??0)));
 return coordinates(shape).map(slot=>{const group=slot.role==='KL'?'G':['SLB','SĞB','STP'].includes(slot.role)?'D':['SLK','SĞK','SF'].includes(slot.role)?'F':'M';let ix=available.findIndex(p=>p.roles?.includes(slot.role));if(ix<0)ix=available.findIndex(p=>p.position===group);if(ix<0)ix=available.findIndex(p=>p.position!=='G');if(ix<0)ix=0;return available.splice(ix,1)[0]||null;});
}
window.TAKTIK_BOARD_UTILS=Object.freeze({selectRosterXI,getLocalTeams:()=>window.TAKTIK_TEAMS || localTeams,createJersey,jerseyNumberColor,clamp,pitchPoint,dragCoordinates,listenForDrag});

window.createTacticsBoard=function(root=document,options={}){
const mode=options.mode??'edit',readonly=mode==='readonly';
if(!['edit','readonly'].includes(mode)||readonly&&!options.initialState)throw new Error('Invalid board mode or snapshot');
const scoped=Object.hasOwn(options,'draftContext'),draftContext=options.draftContext;
if(readonly&&scoped)throw new Error('Readonly boards cannot own draft contexts');
if(scoped&&(root===document||options.storageKey!==undefined||!draftContext?.isActive()))throw new Error('Invalid scoped board context');
let disposed=false,cancelGesture=null,resizeObserver=null,offDraftScope=()=>{},disposeSharing=()=>{},offOverrides=()=>{},editing=false;
const playerOverrides=readonly?null:options.playerOverrides;
const tacticalWorkspace=!readonly&&options.tacticalWorkspace===true;
let substitution=null,tactical=null,activeTeamId=null,teamGeneration=0,customTeamSequence=0;
const teamStates=new Map(),teamPlayerHistory=new Map();
const teamWorkspace=tacticalWorkspace&&!!options.tacticalTools;
const teams=window.TAKTIK_TEAMS || localTeams;
const shapes=['4-3-3','4-2-3-1','4-4-2','3-5-2','3-4-3','5-3-2','4-1-4-1','4-4-1-1','4-1-2-1-2','4-3-1-2','4-2-2-2','4-2-4','4-5-1','3-4-2-1','3-4-1-2','3-3-3-1','3-3-1-3','3-2-4-1','3-6-1','5-4-1','5-2-3','5-2-1-2','5-2-2-1','2-3-5'];
const descriptions={'4-3-3':['Dengeli','Kanatları geniş kullan. Üçlü orta sahayla oyunun kontrolünü elinde tut.'],'4-2-3-1':['Kontrollü','İki ön liberoyla savunmayı koru, forvet arkasındaki üçlüyle pozisyon üret.'],'4-4-2':['Klasik','İki kompakt hat ve çift forvet. Savunma ile hücum arasında sağlam bir denge.'],'3-5-2':['Merkez odaklı','Orta sahada sayısal üstünlük kur. Kanat beklerinle oyuna genişlik kat.'],'3-4-3':['Hücumcu','Üç hücumcuyla önde baskı kur, kanat oyuncularını hücuma dahil et.'],'5-3-2':['Savunmacı','Beşli savunmayla alanları kapat, iki forvetle hızlı çıkışlar yap.']};
const $=id=>root===document?document.getElementById(id):root.querySelector('[data-control="'+id+'"]'),pitch=$('pitch');let selected=null,filter='popular',dialogMode='team',history=[],toastTimer;
let drawingMode='move',drawingColor='#ffffff',activeGesture=null;
let expanded=false,boardHome=null,benchHome=null,previousOverflow='',suppressSquadClickUntil=0;
let state={team:{...(teams.find(t=>t.name===options.team)||teams[0])},formation:'4-3-3',customized:false,players:[],drawings:[]};

const roleNames={KL:'Kaleci',STP:'Stoper',SLB:'Sol bek',SĞB:'Sağ bek',ÖL:'Ön libero',MO:'Orta saha',OO:'Oyun kurucu',SLK:'Sol kanat',SĞK:'Sağ kanat',SF:'Forvet'};
function initialPlayers(shape){return coordinates(shape).map((p,i)=>({...p,id:i,number:i===0?1:[3,4,5,2,8,6,10,7,9,11][i-1],name:roleNames[p.role],renamed:false}));}
if(!readonly)state.players=teamPlayers(state.team,state.formation);
const draftKey=scoped?null:options.storageKey || 'taktik:draft:main:v1';
let draftTimer=null;
const scopedWriter=scoped?draftContext.createWriter({getState:()=>draftState(),canSave:()=>!disposed&&activeGesture===null,eventTarget:window}):null;
const restored=readonly?null:scoped?draftContext.read():window.TAKTIK_DRAFTS?.read(draftKey);
if(options.initialState)state=JSON.parse(JSON.stringify(options.initialState));
if(restored)state=restored;
if(teamWorkspace){
 const saved=state.workspace;delete state.workspace;
 for(const entry of saved?.teams||[])teamStates.set(entry.teamId,JSON.parse(JSON.stringify(entry.state)));
 activeTeamId=saved?.activeTeamId||boardTeamId(state.team);
}
function boardTeamId(team){
 // Names are only a bridge for old snapshots lacking IDs; never map keys.
 const canonical=team.id?teams.find(t=>t.id===team.id):teams.find(t=>t.name===team.name);
 if(canonical?.id)return canonical.id;
 if(team.id)return team.id;
 const source=squadFor(team)?.source,legacy=typeof source==='string'&&source.match(/\/teams\/(\d+)\//);
 if(legacy)return 'fotmob-'+legacy[1];
 team.id='custom-'+(window.crypto?.randomUUID?.()||Date.now()+'-'+(++customTeamSequence));return team.id;
}
function draftState(){
 if(!teamWorkspace)return state;
 const entries=new Map(teamStates);entries.set(activeTeamId,state);
 return {...state,workspace:{version:1,activeTeamId,teams:Array.from(entries,([teamId,value])=>({teamId,state:JSON.parse(JSON.stringify(value))}))}};
}
if(!shapes.includes(state.formation))shapes.push(state.formation);
function persistDraft(){if(disposed)return;if(scoped){scopedWriter.schedule();return;}clearTimeout(draftTimer);draftTimer=setTimeout(()=>{if(!disposed&&activeGesture===null)window.TAKTIK_DRAFTS?.write(draftKey,draftState());},250);}
const saveOnPagehide=()=>{clearTimeout(draftTimer);if(!disposed&&activeGesture===null)window.TAKTIK_DRAFTS?.write(draftKey,draftState());};
if(!readonly&&!scoped)window.addEventListener('pagehide',saveOnPagehide);


function sameAthlete(a,b){return a===b;}
function squadFor(team=state.team){const rosters=window.TAKTIK_ROSTERS?.teams;return rosters&&Object.hasOwn(rosters,team.name)?rosters[team.name]:null;}
function teamPlayers(team,shape){
 const squad=squadFor(team);if(!squad?.players?.length)return initialPlayers(shape);
 const chosen=selectRosterXI(squad,shape);
 return coordinates(shape).map((slot,i)=>{const athlete=chosen[i];return athlete?{...slot,id:i,name:athlete.name,number:athlete.number,athleteId:athlete.id,...(athlete.photo!==undefined?{photo:athlete.photo}:{}),renamed:false}:initialPlayers(shape)[i];});
}
function effectivePlayer(p){
 if(!playerOverrides||!p.athleteId)return p;
 const canonical=squadFor()?.players.find(a=>a.id===p.athleteId);
 return playerOverrides.effective(playerOverrides.key(p.athleteId),canonical&&!window.TAKTIK_CATALOGUE_RUNTIME?.canonical?{...p,name:canonical.name,number:canonical.number}:p);
}
function effectiveAthlete(p){return playerOverrides?playerOverrides.effective(playerOverrides.key(p.id),p):p;}
function renderRosterSelect(p){
 const roster=squadFor();$('rosterSelectLabel').hidden=tacticalWorkspace||!roster;
 const select=$('rosterSelect');select.replaceChildren();if(!roster)return;
 const empty=document.createElement('option');empty.value='';empty.textContent='Futbolcu seç';select.append(empty);
 for(const original of roster.players){const athlete=effectiveAthlete(original);const option=document.createElement('option');option.value=athlete.id;option.textContent=(athlete.number??'–')+' · '+athlete.name+(state.players.some(s=>sameAthlete(s.athleteId,athlete.id))?' · Sahada':'');select.append(option);}
 select.value=p.athleteId||'';
}
function replaceAthlete(athleteId,slotId=selected){
 const target=state.players.find(p=>p.id===slotId),athlete=squadFor()?.players.find(p=>p.id===athleteId);
 if(!target||!athlete){announce('Önce sahadan değiştirmek istediğin oyuncuyu seç.');return false;}
 if(target.athleteId===athlete.id)return false;
 snapshot();selected=target.id;const other=state.players.find(p=>sameAthlete(p.athleteId,athlete.id));
 const identity=p=>({name:p.name,number:p.number,athleteId:p.athleteId,...(p.photo!==undefined?{photo:p.photo}:{}),renamed:p.renamed});
 if(other){const old=identity(target);Object.assign(target,identity(other));Object.assign(other,old);}else Object.assign(target,{name:athlete.name,number:athlete.number,athleteId:athlete.id,...(athlete.photo!==undefined?{photo:athlete.photo}:{}),renamed:false});
 render();announce(athlete.name+' sahaya yerleştirildi.');return true;
}
function renderSquad(){
 if(tacticalWorkspace){$('squadPanel').hidden=true;$('squadList').replaceChildren();return;}
 const roster=squadFor();$('squadPanel').hidden=!roster;if(!roster)return;
 const displayed=expanded||options.benchOnly?roster.players.filter(a=>!state.players.some(p=>sameAthlete(p.athleteId,a.id))):roster.players;
 $('squadTitle').textContent=expanded?'Yedekler':options.benchOnly?'Yedek Oyuncular':'Takım kadrosu';$('squadCount').textContent=displayed.length+' futbolcu';
 const selectedPlayer=state.players.find(p=>p.id===selected),active=selectedPlayer&&effectivePlayer(selectedPlayer);
 $('squadHint').textContent=active?active.name+' yerine seç veya sahadaki oyuncunun üzerine sürükle.':'Yedeği sahadaki oyuncunun üzerine sürükle. Dokunmatik ekranda ⠿ tutamacını kullan.';
 const list=$('squadList');list.replaceChildren();
 const groupNames={G:'Kaleci',D:'Defans',M:'Orta saha',F:'Forvet'};
 for(const original of displayed){
  const athlete=effectiveAthlete(original);
  const onPitch=state.players.find(p=>sameAthlete(p.athleteId,athlete.id)),button=document.createElement('button');button.className='squad-player'+(onPitch?' on-pitch':'')+(onPitch?.id===selected?' picked':'');button.type='button';button.dataset.athleteId=athlete.id;button.title=athlete.name;button.setAttribute('aria-label',athlete.name+', '+(athlete.number??'–')+' numara, '+(athlete.roles?.[0]||athlete.position)+(onPitch?' — sahada':' — kadrodan seç'));
  const jersey=createJersey(athlete.number);
  const info=document.createElement('span');info.className='squad-info';const name=document.createElement('strong');name.textContent=athlete.name;const detail=document.createElement('small');detail.textContent=(athlete.roles?.[0]||groupNames[athlete.position])+(onPitch?' · Sahada':'');info.append(name,detail);button.append(jersey,info);
  const handle=document.createElement('span');handle.className='squad-drag-handle';handle.textContent='⠿';handle.title='Sahadaki oyuncunun üzerine sürükle';handle.setAttribute('aria-hidden','true');button.append(handle);button.addEventListener('pointerdown',e=>onSquadDrag(e,athlete.id));
  button.onclick=()=>{if(Date.now()<suppressSquadClickUntil)return;if(selected===null){if(onPitch)selectPlayer(onPitch.id);else announce('Önce sahadan değiştirmek istediğin oyuncuyu seç.');}else replaceAthlete(athlete.id);};list.append(button);
 }
 const source=$('squadSource');source.replaceChildren();if(roster.identity==='internal'){source.textContent='Takım kadrosu · Başlangıç yerleşimi düzenlenebilir.';}else{source.append('Kadro verisi: ');const link=document.createElement('a');link.href=roster.source;link.textContent='FotMob';link.target='_blank';link.rel='noopener noreferrer';source.append(link,' · 12 Eylül 2026 · Başlangıç 11’i düzenlenebilir.');}
}

function snapshot(){history.push(JSON.parse(JSON.stringify(state)));if(history.length>40)history.shift();$('undo').disabled=false;}
function announce(message){const notice=expanded?$('expandedStatus'):$('toast');notice.textContent=message;notice.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>notice.classList.remove('show'),2600);}
function badge(element,team){element.textContent=team.short;element.style.setProperty('--c',team.color);element.style.setProperty('--c2',team.color2);}
function renderTeams(){const term=$('teamSearch').value.toLocaleLowerCase('tr');$('teamList').replaceChildren();teams.filter(t=>t.name.toLocaleLowerCase('tr').includes(term)).forEach(t=>{const b=document.createElement('button');b.className='team-button'+(t.name===state.team.name?' active':'');b.setAttribute('aria-pressed',t.name===state.team.name);const icon=document.createElement('span');icon.className='badge';badge(icon,t);const label=document.createElement('span');label.textContent=t.name;b.append(icon,label);if(t.name===state.team.name){const check=document.createElement('span');check.className='team-check';check.textContent='✓';b.append(check);}b.onclick=()=>selectTeam(t);$('teamList').append(b);});if(!$('teamList').children.length){const msg=document.createElement('p');msg.className='empty-teams';msg.textContent='Bu isimde takım bulunamadı.';$('teamList').append(msg);}}
function selectTeam(team){
 if(teamWorkspace){
  const id=boardTeamId(team);if(id===activeTeamId)return;
  cancelGesture?.();tactical?.cancel();substitution?.cancel();
  teamStates.set(activeTeamId,JSON.parse(JSON.stringify(state)));teamPlayerHistory.set(activeTeamId,history);
  const pitch=tactical?.getPitch();
  state=teamStates.has(id)?JSON.parse(JSON.stringify(teamStates.get(id))):{team:{...team},formation:'4-3-3',customized:false,players:teamPlayers(team,'4-3-3'),drawings:[]};
  // Refresh display metadata by ID without regenerating an existing XI.
  state.team={...team};history=teamPlayerHistory.get(id)||[];activeTeamId=id;teamGeneration++;
  editing=false;$('playerForm').inert=false;$('playerForm').setAttribute('aria-busy','false');editorMessage('');selected=null;
  if(tactical){state.tactical=tactical.switchTeam(id,state);state.tactical.pitch=pitch;state.drawings=[...state.tactical.legacy,...options.tacticalTools.strokes(state.tactical.drawings)];}
  render();return;
 }
 snapshot();state.team={...team};state.players=teamPlayers(team,state.formation);state.drawings=[];state.customized=false;selected=null;render();announce(team.name+' kadrosu seçildi.');
}
function renderFormations(){if(!$('formationList'))return;$('formationCount').textContent=shapes.length;$('formationList').replaceChildren();const list=filter==='popular'?shapes.slice(0,6):shapes;list.forEach(shape=>{const b=document.createElement('button');b.className='formation-card'+(shape===state.formation?' active':'');b.setAttribute('aria-label',shape+' dizilişi');b.setAttribute('aria-pressed',shape===state.formation);const mini=document.createElement('span');mini.className='mini-pitch';mini.setAttribute('aria-hidden','true');coordinates(shape).forEach(p=>{const dot=document.createElement('i');dot.className='mini-player';dot.style.left=p.x+'%';dot.style.top=p.y+'%';mini.append(dot);});const label=document.createElement('span');label.textContent=shape;b.append(mini,label);b.onclick=()=>applyFormation(shape);$('formationList').append(b);});}
function applyFormation(shape){snapshot();const coords=coordinates(shape);state.players=state.players.map((p,i)=>({...p,...coords[i],name:p.athleteId||p.renamed?p.name:roleNames[coords[i].role]}));state.formation=shape;state.customized=false;render();announce(shape+' dizilişi uygulandı.');}
function updatePlayerElement(button,p){p=effectivePlayer(p);button.style.left=p.x+'%';button.style.top=p.y+'%';button.setAttribute('aria-label',`${p.number} numara ${p.name}, ${p.role}. Düzenlemek için seç, hareket için ok tuşlarını kullan.`);button.setAttribute('aria-pressed',p.id===selected);button.className='player'+(p.id===selected?' selected':'')+(p.role==='KL'?' goalkeeper':'');button.querySelector('b').textContent=p.number??'–';button.querySelector('.player-name').textContent=tacticalWorkspace&&options.playerLabel?options.playerLabel(p):p.name;button.querySelector('.player-role').textContent=p.role;button.title=p.name;if(button.substitutionAction){const action=button.substitutionAction;action.style.left=p.x+'%';action.style.top=p.y+'%';action.setAttribute('aria-label',p.name+' yerine oyuncu se\u00e7');}}
function renderPlayers(){$('players').replaceChildren();state.players.forEach(p=>{const b=document.createElement(readonly?'div':'button');if(!readonly)b.type='button';b.dataset.id=p.id;b.append(createJersey(p.number));const name=document.createElement('span');name.className='player-name';const role=document.createElement('span');role.className='player-role';b.append(name,role);updatePlayerElement(b,p);if(readonly){b.removeAttribute('aria-pressed');b.setAttribute('aria-label',`${p.number??'–'} numara ${p.name}, ${p.role}`);}else{b.addEventListener('pointerdown',onPointerDown);b.addEventListener('keydown',onPlayerKey);b.addEventListener('click',()=>selectPlayer(p.id));if(tacticalWorkspace){const reveal=()=>pitch.setAttribute('data-player-actions','active');b.addEventListener('pointermove',reveal);b.addEventListener('focus',reveal);}}$('players').append(b);if(tacticalWorkspace){const action=document.createElement('button');action.type='button';action.className='player-substitute';action.textContent='De\u011fi\u015ftir';action.dataset.slotId=p.id;action.setAttribute('aria-haspopup','dialog');action.onclick=()=>substitution?.open(p.id);b.substitutionAction=action;updatePlayerElement(b,p);$('players').append(action);}});}
function selectPlayer(id){if(id!==null&&drawingMode!=='move')return;selected=id;if(tacticalWorkspace)pitch.setAttribute('data-player-actions',id===null?'neutral':'active');root.querySelectorAll('.player').forEach(b=>{b.classList.toggle('selected',Number(b.dataset.id)===id);b.setAttribute('aria-pressed',Number(b.dataset.id)===id);});renderEditor();renderSquad();}
function clearPlayerSelection(){selectPlayer(null);pitch.focus({preventScroll:true});}
function onPitchBackgroundClick(event){
 if(disposed||drawingMode!=='move'||activeGesture!==null||substitution?.isOpen())return;
 if(event.target?.closest?.('button,a,input,select,textarea,[role="button"],[contenteditable="true"]'))return;
 clearPlayerSelection();
}
function renderEditor(){const original=state.players.find(p=>p.id===selected),p=original&&effectivePlayer(original);$('noPlayer').hidden=!!p;$('playerForm').hidden=!p;if(!p)return;$('selectedNumber').textContent=p.number;$('selectedRole').textContent=roleNames[p.role];$('playerName').value=p.name;$('playerNumber').value=p.number;$('playerRole').value=p.role;renderRosterSelect(p);if($('resetPlayerOverride'))$('resetPlayerOverride').hidden=!playerOverrides||!p.athleteId||!playerOverrides.has(playerOverrides.key(p.athleteId));}
function onPointerDown(e){
 if(e.button!==0||drawingMode!=='move'||activeGesture!==null)return;
 const b=e.currentTarget,id=Number(b.dataset.id);selectPlayer(id);
 const rect=pitch.getBoundingClientRect(),p=state.players.find(p=>p.id===id);
 const start={x:e.clientX,y:e.clientY,px:p.x,py:p.y,role:p.role};let moved=false,finished=false,undoEntry=null;
 activeGesture=e.pointerId;b.setPointerCapture(e.pointerId);b.classList.add('dragging');
 const findTarget=()=>state.players.filter(q=>q.id!==id).map(q=>({q,distance:Math.hypot((q.x-p.x)*rect.width/100,(q.y-p.y)*rect.height/100)})).filter(t=>t.distance<=38).sort((a,b)=>a.distance-b.distance)[0]?.q;
 const move=ev=>{
  if(ev.pointerId!==undefined&&ev.pointerId!==e.pointerId)return;
  const dx=ev.clientX-start.x,dy=ev.clientY-start.y;if(!moved&&Math.hypot(dx,dy)<3)return;
  if(!moved){snapshot();undoEntry=history[history.length-1];moved=true;}
  const padY=Math.max(9,(b.offsetHeight/2+3)/rect.height*100);Object.assign(p,dragCoordinates(start,ev,rect,{minX:9,maxX:91,minY:padY,maxY:Math.min(92,100-padY)}));
  state.customized=true;updatePlayerElement(b,p);b.classList.add('dragging');const target=findTarget();
  root.querySelectorAll('.player').forEach(el=>el.classList.toggle('swap-target',Number(el.dataset.id)===target?.id));
  $('boardFormation').textContent=state.formation+' · Özel';
 };
 const end=ev=>{
  if(finished)return;if(ev?.type==='pointerup'&&Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))move(ev);finished=true;
  stopListening();activeGesture=null;cancelGesture=null;
  const cancelled=ev?.type!=='pointerup';
  if(moved&&cancelled){state=JSON.parse(JSON.stringify(undoEntry));if(history[history.length-1]===undoEntry)history.pop();}
  else if(moved){const target=findTarget();if(target){const destination={x:target.x,y:target.y,role:target.role};Object.assign(target,{x:start.px,y:start.py,role:start.role});Object.assign(p,destination);announce(p.name+' ile '+target.name+' yer değiştirdi.');}}
  if(moved)render();else b.classList.remove('dragging');
 };
 cancelGesture=()=>end({type:'pointercancel'});
 const stopListening=listenForDrag(b,move,end);
}
function onPlayerKey(e){if(drawingMode!=='move'||activeGesture!==null)return;const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const id=Number(e.currentTarget.dataset.id),p=state.players.find(p=>p.id===id);selectPlayer(id);if(!e.repeat)snapshot();const step=e.shiftKey?3:1;p.x=clamp(p.x+delta[0]*step,9,91);const padY=Math.max(9,(e.currentTarget.offsetHeight/2+3)/pitch.getBoundingClientRect().height*100);p.y=clamp(p.y+delta[1]*step,padY,Math.min(92,100-padY));state.customized=true;updatePlayerElement(e.currentTarget,p);$('boardFormation').textContent=state.formation+' · Özel';persistDraft();}
function render(){if(disposed)return;(root===document?document.documentElement:root).style.setProperty('--team',state.team.color);(root===document?document.documentElement:root).style.setProperty('--team2',state.team.color2);(root===document?document.documentElement:root).style.setProperty('--jersey-number',jerseyNumberColor(state.team.color));$('activeTeam').textContent=state.team.name;badge($('activeBadge'),state.team);$('boardFormation').textContent=state.formation+(state.customized?' · Özel':'');const d=descriptions[state.formation]||['Esnek','Oyuncuların konumlarını oyun planına göre serbestçe düzenle.'];if($('formationTitle'))$('formationTitle').textContent=state.formation;if($('formationTag'))$('formationTag').textContent=d[0];if($('formationDescription'))$('formationDescription').textContent=d[1];$('undo').disabled=history.length===0;renderTeams();renderFormations();renderPlayers();renderEditor();renderSquad();renderDrawing();renderExpandedIdentity();options.onChange?.({team:state.team.name,formation:state.formation,customized:state.customized});persistDraft();}
const drawingCanvas=$('drawingCanvas');
function renderDrawing(){
 if(disposed)return;
 const ctx=drawingCanvas.getContext?.('2d');if(!ctx)return;
 const rect=pitch.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const ratio=Math.min(window.devicePixelRatio||1,3),width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio);
 if(drawingCanvas.width!==width)drawingCanvas.width=width;if(drawingCanvas.height!==height)drawingCanvas.height=height;
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 for(const stroke of (tactical?state.tactical?.legacy||state.drawings:state.drawings)){
  ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.lineJoin='round';
  const points=stroke.points;if(!points.length)continue;
  ctx.beginPath();
  if(points.length===1){ctx.arc(points[0].x*rect.width,points[0].y*rect.height,stroke.width/2,0,Math.PI*2);ctx.fill();}
  else{ctx.moveTo(points[0].x*rect.width,points[0].y*rect.height);for(const point of points.slice(1))ctx.lineTo(point.x*rect.width,point.y*rect.height);ctx.stroke();}
 }
 ctx.globalCompositeOperation='source-over';
}
function setDrawingMode(mode){
 if(tactical){tactical.setTool(mode==='move'?'select':mode==='pen'?'freehand':mode);return;}
 if(activeGesture!==null)return;
 drawingMode=mode;const active=mode!=='move';$('drawingTools').hidden=tacticalWorkspace?false:!active;$('drawingToggle').setAttribute('aria-expanded',String(active));$('drawingToggle').setAttribute('aria-label',active?'Çizim araçlarını kapat':'Çizim araçlarını aç');$('drawingToggle').classList.toggle('active',active);
 if(tacticalWorkspace)$('finishDrawing').setAttribute('aria-pressed',String(!active));
 pitch.classList.toggle('drawing-active',active);pitch.classList.toggle('erasing',mode==='eraser');
 for(const [id,tool] of [['penTool','pen'],['eraserTool','eraser']]){const button=$(id);button.classList.toggle('active',mode===tool);button.setAttribute('aria-pressed',String(mode===tool));}
 if(active)renderDrawing();
}
function onDrawingStart(e){
 if(tactical||e.button!==0||drawingMode==='move'||activeGesture!==null)return;
 if(drawingMode==='eraser'&&!state.drawings.some(s=>s.tool==='pen'))return;
 e.preventDefault();const rect=pitch.getBoundingClientRect();
 const point=ev=>pitchPoint(ev,rect);
 snapshot();const undoEntry=history[history.length-1];const stroke={tool:drawingMode,color:drawingColor,width:drawingMode==='eraser'?24:4,points:[point(e)]};state.drawings.push(stroke);
 activeGesture=e.pointerId;drawingCanvas.setPointerCapture(e.pointerId);drawingCanvas.focus({preventScroll:true});renderDrawing();let finished=false;
 const move=ev=>{if(ev.pointerId!==undefined&&ev.pointerId!==e.pointerId)return;const p=point(ev),last=stroke.points[stroke.points.length-1];if(Math.hypot((p.x-last.x)*rect.width,(p.y-last.y)*rect.height)<1.5)return;stroke.points.push(p);renderDrawing();};
 const end=ev=>{
  if(finished)return;finished=true;
  drawingCanvas.removeEventListener('pointermove',move);drawingCanvas.removeEventListener('pointerup',end);drawingCanvas.removeEventListener('pointercancel',end);drawingCanvas.removeEventListener('lostpointercapture',end);activeGesture=null;cancelGesture=null;
  if(ev.type!=='pointerup'){state=JSON.parse(JSON.stringify(undoEntry));if(history[history.length-1]===undoEntry)history.pop();}
  else if(Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))move(ev);
  renderDrawing();$('undo').disabled=history.length===0;persistDraft();
 };
 cancelGesture=()=>end({type:'pointercancel'});
 drawingCanvas.addEventListener('pointermove',move);drawingCanvas.addEventListener('pointerup',end);drawingCanvas.addEventListener('pointercancel',end);drawingCanvas.addEventListener('lostpointercapture',end);
}
// Return before installing any editor controls, tools, gestures or persistence.
if(readonly){
 const surface=root===document?document.documentElement:root;
 surface.classList.add('readonly-board');
 surface.style.setProperty('--team',state.team.color);surface.style.setProperty('--team2',state.team.color2);surface.style.setProperty('--jersey-number',jerseyNumberColor(state.team.color));
 $('activeTeam').textContent=state.team.name;badge($('activeBadge'),state.team);
 $('boardFormation').textContent=state.formation;
 renderPlayers();renderDrawing();
 if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(renderDrawing);resizeObserver.observe(pitch);}else window.addEventListener('resize',renderDrawing);
 return Object.freeze({mode,getState(){if(disposed)throw new Error('Inactive board context');return JSON.parse(JSON.stringify(state));},
  dispose(){if(disposed)return;disposed=true;resizeObserver?.disconnect();window.removeEventListener('resize',renderDrawing);$('players').replaceChildren();drawingCanvas.getContext?.('2d')?.clearRect(0,0,drawingCanvas.width,drawingCanvas.height);}});
}
$('drawingToggle').onclick=()=>setDrawingMode(drawingMode==='move'?'pen':'move');$('penTool').onclick=()=>setDrawingMode('pen');$('eraserTool').onclick=()=>setDrawingMode('eraser');$('finishDrawing').onclick=()=>setDrawingMode('move');
if(tacticalWorkspace){
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const panel=$('tacticalToolsPanel');
 $('drawingToggle').hidden=true;$('drawingTools').hidden=true;
 $('expandedBench').setAttribute('aria-label','Taktik araçları');$('expandedDialog').classList.add('tactical-expanded');
 pitch.classList.add('tactical-pitch');
 if(options.tacticalTools){
  drawingCanvas.tabIndex=-1;drawingCanvas.setAttribute('aria-hidden','true');
  tactical=options.tacticalTools.mount({state,teamId:activeTeamId,root,pitch,toolbarHost:panel,document,utils:window.TAKTIK_BOARD_UTILS,
   current:()=>!disposed&&(!scoped||draftContext.isActive())&&!substitution?.isOpen(),
   onMode(tool){cancelGesture?.();drawingMode=tool==='select'?'move':tool;pitch.classList.toggle('drawing-active',tool!=='select');selectPlayer(null);},
   onChange(value){state.tactical=value;state.drawings=[...value.legacy,...options.tacticalTools.strokes(value.drawings)];renderDrawing();persistDraft();},
  });
 }
 const dialog=node('dialog',undefined,'substitution-dialog'),heading=node('h2','Oyuncu seç'),head=node('div',undefined,'weekly-picker-head'),dismiss=node('button','×','weekly-picker-close'),label=node('label','Oyuncu ara'),search=node('input'),list=node('div',undefined,'weekly-results'),status=node('p',undefined,'weekly-results-status'),cancel=node('button','Vazgeç','weekly-remove');
 heading.id='substitutionPickerTitle';dialog.setAttribute('aria-labelledby',heading.id);dismiss.type='button';dismiss.setAttribute('aria-label','Oyuncu seçimini kapat');head.append(heading,dismiss);
 search.type='search';search.autocomplete='off';search.placeholder='Oyuncu ara…';search.setAttribute('aria-label','Yedek oyuncu ara');label.append(search);status.setAttribute('role','status');status.setAttribute('aria-live','polite');cancel.type='button';dialog.append(head,label,status,list,cancel);root.append(dialog);
 pitch.tabIndex=-1;pitch.setAttribute('aria-label','Taktik sahası');pitch.addEventListener('click',onPitchBackgroundClick);
 let target=null;
 const focusSlot=id=>{if(!disposed)Array.from($('players').children).find(n=>n.className?.split(' ').includes('player')&&Number(n.dataset.id)===id)?.focus({preventScroll:true});};
 const close=(success=false)=>{const id=target?.id;target=null;dialog.close();search.value='';list.replaceChildren();if(success)clearPlayerSelection();else focusSlot(id);};
 const valid=()=>!disposed&&(!scoped||draftContext.isActive())&&target&&target.team===state.team.name&&state.players.some(p=>p.id===target.id&&p.athleteId===target.athleteId);
 const renderBench=()=>{
  if(!valid()){close();return;}
  const bench=(squadFor()?.players||[]).filter(a=>!state.players.some(p=>sameAthlete(p.athleteId,a.id))).map(effectiveAthlete);
  const term=search.value.trim().toLocaleLowerCase('tr'),matches=bench.filter(a=>a.name.toLocaleLowerCase('tr').includes(term));list.replaceChildren();
  for(const athlete of matches){
   const button=node('button',undefined,'weekly-result');button.type='button';button.dataset.athleteId=athlete.id;
   const info=node('span',undefined,'weekly-result-copy'),position=athlete.roles?.[0]||({G:'Kaleci',D:'Defans',M:'Orta saha',F:'Forvet'}[athlete.position]||athlete.position);
   info.append(node('strong',athlete.name),node('span',state.team.name+' · '+(athlete.number??'—')+' · '+position));
   button.append(createJersey(athlete.number),info,node('span','+','weekly-result-action'));button.title=athlete.name;button.setAttribute('aria-label',athlete.name+', '+state.team.name+', '+(athlete.number??'–')+' numara, '+position+' ile değiştir');
   button.onclick=()=>{
    if(!valid()){close();return;}
    if(state.players.some(p=>p.athleteId===athlete.id)||!squadFor()?.players.some(p=>p.id===athlete.id)){status.textContent='Oyuncu değiştirilemedi. Başka bir yedek seç.';return;}
    if(replaceAthlete(athlete.id,target.id))close(true);else status.textContent='Oyuncu değiştirilemedi. Tekrar dene.';
   };list.append(button);
  }
  status.textContent=!bench.length?'Yedek oyuncu bulunmuyor.':!matches.length?'Oyuncu bulunamadı.':matches.length+' yedek oyuncu';
 };
 cancel.onclick=dismiss.onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});search.addEventListener('input',renderBench);
 substitution={isOpen:()=>dialog.open,cancel:()=>{if(dialog.open)close();},open(id){if(disposed||activeGesture!==null||drawingMode!=='move'||scoped&&!draftContext.isActive())return;const player=state.players.find(p=>p.id===id);if(!player)return;selectPlayer(id);target={id,athleteId:player.athleteId,team:state.team.name};heading.textContent=player.role+' için oyuncu seç';dialog.setAttribute('aria-label',effectivePlayer(player).name+' — '+heading.textContent);dialog.style.setProperty('--team',state.team.color);dialog.style.setProperty('--team2',state.team.color2);dialog.style.setProperty('--jersey-number',jerseyNumberColor(state.team.color));search.value='';renderBench();dialog.showModal();search.focus();},dispose(){target=null;dialog.close();dialog.remove();}};
}
$('drawingColor').addEventListener('input',e=>{drawingColor=e.target.value;setDrawingMode('pen');});drawingCanvas.addEventListener('pointerdown',onDrawingStart);
const onBoardKeydown=e=>{if(e.key!=='Escape'||activeGesture!==null)return;if(drawingMode!=='move'){if(tactical)return;setDrawingMode('move');$('drawingToggle').focus();}else if(tacticalWorkspace&&selected!==null&&!substitution?.isOpen()&&!$('customDialog').open){e.preventDefault();clearPlayerSelection();}};root.addEventListener('keydown',onBoardKeydown);
if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(renderDrawing);resizeObserver.observe(pitch);}else window.addEventListener('resize',renderDrawing);

function playerAtPoint(clientX,clientY){
 const rect=pitch.getBoundingClientRect();
 if(clientX<rect.left||clientX>rect.left+rect.width||clientY<rect.top||clientY>rect.top+rect.height)return null;
 return state.players.map(p=>({p,d:Math.hypot(rect.left+p.x*rect.width/100-clientX,rect.top+p.y*rect.height/100-clientY)})).filter(item=>item.d<=46).sort((a,b)=>a.d-b.d)[0]?.p||null;
}
function onSquadDrag(e,athleteId){
 if(e.button!==0||activeGesture!==null)return;
 if(e.pointerType==='touch'&&!e.target.closest('.squad-drag-handle'))return;
 setDrawingMode('move');const button=e.currentTarget,start={x:e.clientX,y:e.clientY};let point={...start},moved=false,finished=false,ghost=null,frame=null;
 activeGesture=e.pointerId;button.setPointerCapture(e.pointerId);
 const highlight=()=>{const target=playerAtPoint(point.x,point.y);root.querySelectorAll('.player').forEach(el=>el.classList.toggle('swap-target',Number(el.dataset.id)===target?.id));return target;};
 const tick=()=>{
  if(finished)return;
  const delta=point.y<75?-14:point.y>window.innerHeight-75?14:0;
  if(delta){if(expanded)$('expandedDialog').scrollTop+=delta;else window.scrollBy(0,delta);}
  highlight();frame=requestAnimationFrame(tick);
 };
 const move=ev=>{
  if(ev.pointerId!==undefined&&ev.pointerId!==e.pointerId)return;
  point={x:ev.clientX,y:ev.clientY};if(!moved&&Math.hypot(point.x-start.x,point.y-start.y)<6)return;
  if(!moved){moved=true;suppressSquadClickUntil=Date.now()+800;ghost=button.cloneNode(true);ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.tabIndex=-1;ghost.classList.add('bench-drag-ghost');ghost.style.setProperty('--team',state.team.color);ghost.style.setProperty('--team2',state.team.color2);(expanded?$('expandedDialog'):root===document?document.body:root).append(ghost);button.classList.add('bench-drag-origin');frame=requestAnimationFrame(tick);}
  ev.preventDefault?.();ghost.style.left=(point.x-65)+'px';ghost.style.top=(point.y-26)+'px';highlight();
 };
 const end=ev=>{
  if(finished)return;if(ev.type==='pointerup'&&Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))move(ev);finished=true;activeGesture=null;cancelGesture=null;
  button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',end);button.removeEventListener('lostpointercapture',end);
  if(frame!==null)cancelAnimationFrame(frame);ghost?.remove();button.classList.remove('bench-drag-origin');root.querySelectorAll('.player').forEach(el=>el.classList.remove('swap-target'));
  if(moved){suppressSquadClickUntil=Date.now()+500;const target=ev.type==='pointerup'?playerAtPoint(point.x,point.y):null;if(target)replaceAthlete(athleteId,target.id);else if(ev.type==='pointerup')announce('Değiştirmek için sahadaki bir oyuncunun üzerine bırak.');}
 };
 cancelGesture=()=>end({type:'pointercancel'});
 button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
}
function renderExpandedIdentity(){
 if(!expanded)return;
 $('expandedEmpty').hidden=tacticalWorkspace||!!squadFor();
 const label=$('expandedTeamName'),letters=Array.from(state.team.name.toLocaleUpperCase('tr'));
 label.replaceChildren();label.setAttribute('aria-label',state.team.name);label.style.setProperty('--team-letters',String(Math.max(1,letters.length)));
 for(const letter of letters){const span=document.createElement('span');span.className='expanded-team-letter';span.textContent=letter;span.setAttribute('aria-hidden','true');label.append(span);}
 badge($('expandedBadge'),state.team);
 const select=$('expandedFormation');select.replaceChildren();for(const shape of shapes){const option=document.createElement('option');option.value=shape;option.textContent=shape;select.append(option);}select.value=state.formation;
}
function openExpanded(){
 if(expanded||activeGesture!==null)return;
 expanded=true;const board=$('boardPanel'),bench=$(tacticalWorkspace?'tacticalToolsPanel':'squadPanel');
 boardHome=document.createComment('board position');benchHome=document.createComment('squad position');board.before(boardHome);bench.before(benchHome);
 $('expandedCenter').append(board);$('expandedBench').append(bench);
 previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 $('expandedDialog').showModal();$('expandBoard').setAttribute('aria-label','Kadroyu küçült');$('expandBoard').title='Kadroyu küçült';$('expandBoard').classList.add('is-expanded');
 render();$('closeExpanded').focus({preventScroll:true});
}
function closeExpanded(){
 if(!expanded||activeGesture!==null)return;
 const board=$('boardPanel'),bench=$(tacticalWorkspace?'tacticalToolsPanel':'squadPanel');benchHome.replaceWith(bench);boardHome.replaceWith(board);boardHome=null;benchHome=null;expanded=false;
 $('expandedDialog').close();document.body.style.overflow=previousOverflow;$('expandBoard').setAttribute('aria-label','Kadroyu genişlet');$('expandBoard').title='Kadroyu genişlet';$('expandBoard').classList.remove('is-expanded');render();$('expandBoard').focus({preventScroll:true});
}
$('expandBoard').onclick=()=>expanded?closeExpanded():openExpanded();$('closeExpanded').onclick=closeExpanded;$('expandedFormation').onchange=e=>applyFormation(e.target.value);
$('expandedDialog').addEventListener('cancel',e=>{e.preventDefault();closeExpanded();});
$('expandedDialog').addEventListener('click',e=>{if(e.target!==$('expandedDialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeExpanded();});
$('rosterSelect').onchange=e=>{if(e.target.value)replaceAthlete(e.target.value);};
$('teamSearch').addEventListener('input',renderTeams);root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;root.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('active',t===b));renderFormations();});
$('undo').onclick=()=>{if(!history.length)return;const previous=history.pop();state=tactical?{...previous,drawings:state.drawings,...(state.tactical?{tactical:state.tactical}:{})}:previous;render();announce('Son değişiklik geri alındı.');};$('reset').onclick=()=>applyFormation(state.formation);
const editStatus=$('playerEditStatus');
const editorMessage=text=>{if(editStatus)editStatus.textContent=text;else announce(text);};
const editActive=()=>!disposed&&(!scoped||draftContext.isActive());
async function editGlobal(remove=false){
 if(editing||!editActive())return;
 const p=state.players.find(p=>p.id===selected);if(!p)return;
 const editGeneration=teamGeneration,editedTeam=state.team.name,editedSlot=selected;
 const key=p.athleteId&&playerOverrides?.key(p.athleteId),number=$('playerNumber').value===''?null:Number($('playerNumber').value),name=$('playerName').value.trim(),role=$('playerRole').value;
 if(!remove&&(number!==null&&(!Number.isInteger(number)||number<1||number>99)||!name||[...name].length>24||/[\u0000-\u001f\u007f-\u009f]/.test(name)||!Object.hasOwn(roleNames,role)))return editorMessage('Ad en fazla 24 karakter, forma numarası 1–99 ve pozisyon geçerli olmalı.');
 if(key){
  editing=true;$('playerForm').inert=true;$('playerForm').setAttribute('aria-busy','true');editorMessage('Kaydediliyor…');
  const result=remove?await playerOverrides.reset(key):await playerOverrides.save(key,{name,number,role});
  if(!editActive()||editGeneration!==teamGeneration)return;
  editing=false;$('playerForm').inert=false;$('playerForm').setAttribute('aria-busy','false');
  if(state.team.name!==editedTeam||selected!==editedSlot||state.players.find(p=>p.id===selected)?.athleteId!==p.athleteId){editorMessage('');return;}
  if(!result.ok){editorMessage('Oyuncu düzenlemesi kaydedilemedi. Bilgilerin formda duruyor; tekrar dene.');return;}
  renderPlayers();renderSquad();renderEditor();editorMessage(remove?'Oyuncu düzenlemesi sıfırlandı.':'Kişisel oyuncu düzenlemen kaydedildi.');return;
 }
 if(remove)return;
 snapshot();Object.assign(p,{name,number,role,renamed:true});render();editorMessage('Bu özel oyuncu yalnızca bu kadro taslağında güncellendi.');
}
$('playerForm').onsubmit=e=>{e.preventDefault();void editGlobal();};
if($('resetPlayerOverride'))$('resetPlayerOverride').onclick=()=>{void editGlobal(true);};

function openDialog(mode){dialogMode=mode;$('dialogError').textContent='';$('teamFields').hidden=mode!=='team';$('formationFields').hidden=mode!=='formation';$('dialogTitle').textContent=mode==='team'?'Kendi takımını oluştur':'Özel diziliş oluştur';$('customDialog').showModal();(mode==='team'?$('customName'):$('customShape')).focus();}
$('customTeam').onclick=()=>openDialog('team');if($('customFormation'))$('customFormation').onclick=()=>openDialog('formation');$('closeDialog').onclick=()=>$('customDialog').close();$('customDialog').addEventListener('click',e=>{if(e.target===$('customDialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('customForm').onsubmit=e=>{e.preventDefault();if(dialogMode==='team'){const name=$('customName').value.trim();if(!name||name.length>36){$('dialogError').textContent='Lütfen takım adını gir.';return;}const t={name,short:name.toLocaleUpperCase('tr').slice(0,3),color:$('customColor').value,color2:$('customColor2').value};selectTeam(t);}else{const shape=$('customShape').value.trim().replace(/[–—\s]+/g,'-'),parts=shape.split('-').map(Number);if(!/^\d(?:-\d){1,4}$/.test(shape)||parts.some(n=>n<1||n>9)||parts.reduce((a,b)=>a+b,0)!==10){$('dialogError').textContent='Her hatta 1–9 oyuncu ve toplam 10 oyuncu olmalı. Örn. 3-2-2-3';return;}if(!shapes.includes(shape))shapes.push(shape);filter='all';root.querySelectorAll('[data-filter]').forEach(t=>t.classList.toggle('active',t.dataset.filter===filter));applyFormation(shape);}$('customDialog').close();};
render();
if(playerOverrides){offOverrides=playerOverrides.subscribe(()=>{if(editActive()){renderPlayers();renderSquad();if(!editing&&$('resetPlayerOverride'))$('resetPlayerOverride').hidden=!state.players.some(p=>p.id===selected&&p.athleteId&&playerOverrides.has(playerOverrides.key(p.athleteId)));}});if(!playerOverrides.ready())editorMessage('Kişisel oyuncu düzenlemeleri şu anda yüklenemedi. Kaydederken tekrar denenecek.');}
if(root===document&&document.modelContext?.registerTool){const lifecycle=new AbortController();const context=document.modelContext;const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};register({name:'read_tactics_board',description:'Read the selected team, formation, available formations and all player positions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return JSON.parse(JSON.stringify({...state,availableFormations:shapes,availableTeams:teams.map(t=>t.name)}));}});register({name:'set_formation',description:'Apply an available formation to the visible tactics board, preserving player names and numbers.',inputSchema:{type:'object',properties:{formation:{type:'string'}},required:['formation'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||typeof input.formation!=='string'||!shapes.includes(input.formation))throw new Error('Unknown formation');applyFormation(input.formation);return {formation:state.formation,players:state.players};}});register({name:'move_players',description:'Move players by id to percentage coordinates on the visible football pitch.',inputSchema:{type:'object',properties:{players:{type:'array',items:{type:'object',properties:{id:{type:'integer'},x:{type:'number',minimum:9,maximum:91},y:{type:'number',minimum:9,maximum:92}},required:['id','x','y'],additionalProperties:false}}},required:['players'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||!Array.isArray(input.players)||!input.players.length||input.players.some(p=>!p||!Number.isInteger(p.id)||!state.players.some(s=>s.id===p.id)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<9||p.x>91||p.y<9||p.y>92))throw new Error('Invalid player position');snapshot();input.players.forEach(p=>Object.assign(state.players.find(s=>s.id===p.id),{x:p.x,y:p.y}));state.customized=true;render();return {players:state.players};}});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}

function assertBoardActive(){if(disposed||(scoped&&!draftContext.isActive()))throw new Error('Inactive board context');}
function disposeScopedBoard(){
 if(!scoped||disposed)return;
 disposed=true;cancelGesture?.();closeExpanded();
 substitution?.dispose();tactical?.dispose();disposeSharing();offOverrides();
 scopedWriter.dispose();offDraftScope();clearTimeout(toastTimer);
 resizeObserver?.disconnect();window.removeEventListener('resize',renderDrawing);
 root.removeEventListener('keydown',onBoardKeydown);
 if(tacticalWorkspace)pitch.removeEventListener('click',onPitchBackgroundClick);
 root.replaceChildren();history=[];teamStates.clear();teamPlayerHistory.clear();
}
const api={
 mode,
 getState(){assertBoardActive();return JSON.parse(JSON.stringify({...state,players:state.players.map(effectivePlayer)}));},
 ...(teamWorkspace?{exportDraft(){assertBoardActive();return JSON.parse(JSON.stringify(draftState()));}}:{}),
 getTeams:()=>teams.map(t=>({...t})),
 getFormations:()=>[...shapes],
 selectTeam(name){assertBoardActive();const team=teams.find(t=>t.id===name)||teams.find(t=>t.name===name);if(!team)throw new Error('Geçersiz takım');selectTeam(team);},
 applyFormation(shape){assertBoardActive();if(!shapes.includes(shape))throw new Error('Geçersiz diziliş');applyFormation(shape);},
 ...(scoped?{dispose:disposeScopedBoard}:{}),
};
disposeSharing=window.TAKTIK_SHARE?.attach(api,$('shareLineup')) || (()=>{});
if(scoped)offDraftScope=draftContext.onDispose(disposeScopedBoard);
return api;
};
// Definitions only. backend-entry starts routes after every defer script is ready.
window.TAKTIK_APP={
 mountStudio(root,scope,playerOverrides,tacticalTools,playerLabel){
  const fragment=document.getElementById('studioTemplate').content.cloneNode(true);
  for(const element of fragment.querySelectorAll('[id]'))element.dataset.control=element.id;
  root.append(fragment);
  const board=window.createTacticsBoard(root,{mode:'edit',benchOnly:true,tacticalWorkspace:true,tacticalTools,playerOverrides,playerLabel,draftContext:scope.context('main')});
  return ()=>board.dispose();
 },
 async mountShared(route){
  const landing=document.getElementById('landing'),viewer=document.getElementById('sharedViewer');
  const boardRoot=document.getElementById('sharedBoard'),status=document.getElementById('sharedStatus');
  if(landing)landing.hidden=true;if(viewer)viewer.hidden=false;
  boardRoot.hidden=true;status.hidden=false;status.textContent='Kadro yükleniyor…';
  try{
   if(route.kind!=='shared')throw new Error('Invalid share');
   const state=await window.TAKTIK_BACKEND.readLineup(route.id);
   boardRoot.hidden=false;
   const board=window.createTacticsBoard(boardRoot,{mode:'readonly',initialState:state});
   status.hidden=true;
   return board;
  }catch{
   boardRoot.hidden=true;status.hidden=false;
   status.textContent='Kadro yüklenemedi. Bağlantı geçersiz, süresi dolmuş veya şu anda erişilemiyor.';
  }
 }
};
