import {POSITION_LABELS} from './match-detail.js';
import {goalMarkers} from './match-goals.js';
import {mountTacticalDrawings} from './tactical-drawing-ui.js';
import {matchPlayerKey} from './player-overrides.js';

// Match positions and contextual same-team replacements. Shared classic-board utilities own jersey rendering,
// number contrast, percentage drag coordinates and pointer-listener lifecycle.
export function createMatchBoard({root,document,model,utils,current=()=>true,toolbarHost,getPreferenceStorage,initial={},onChange=()=>{},playerOverrides}) {
  if (!model || !utils || !current()) throw Error('Match board unavailable');
  let disposed=false,selected=null,cancelGesture=null,drawing=null;
  const playerListeners=[],listeners=[],markers=new Map(),benchListeners=[];
  const suppressedClicks=new WeakSet();
  let source=['home','away'].flatMap(side=>model[side].players.map(p=>Object.freeze({...p,side})));
  const people=new Map(['home','away'].flatMap(side=>[...model[side].players,...(model[side].bench||[])].map(p=>[p.key,{...p,side}])));
  const working=new Map(source.map(p=>[p.key,{x:p.initialX,y:p.initialY,person:p.key}]));
  for(const p of initial.working||[]){if(!working.has(p.slotKey)||!people.has(p.personKey)||people.get(p.personKey).side!==people.get(p.slotKey).side)throw Error('Invalid working layout');working.set(p.slotKey,{x:p.x,y:p.y,person:p.personKey});}
  const active=()=>!disposed&&current();
  const playersActive=()=>active()&&(!drawing||drawing.getTool()==='select');
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const viewport=node('div',undefined,'match-pitch-viewport');viewport.tabIndex=0;
  viewport.setAttribute('role','region');viewport.setAttribute('aria-label','İki takımlı saha. Küçük ekranda yatay kaydırılabilir.');
  const pitch=node('div',undefined,'match-pitch'),players=node('div',undefined,'match-pitch-players');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 1000 625');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.classList.add('match-pitch-lines');
  const shape=(tag,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);};
  shape('rect',{x:15,y:15,width:970,height:595});shape('path',{d:'M500 15V610'});
  shape('circle',{cx:500,cy:312.5,r:87});shape('circle',{cx:500,cy:312.5,r:3,fill:'currentColor'});
  for(const away of [false,true]){
    shape('rect',{x:away?835:15,y:125,width:150,height:375});
    shape('rect',{x:away?930:15,y:225,width:55,height:175});
    shape('rect',{x:away?985:3,y:267,width:12,height:91});
    shape('circle',{cx:away?880:120,cy:312.5,r:3,fill:'currentColor'});
  }
  pitch.append(svg,players);viewport.append(pitch);
  const bench=node('section',undefined,'match-bench');bench.hidden=true;
  const heading=node('h2'),hint=node('p','Bir yedeğe tıkla veya aynı takımın sahadaki oyuncusunun üstüne sürükle.'),list=node('div',undefined,'match-bench-list');
  const close=node('button','Yedekleri kapat');close.type='button';
  const notice=node('p',undefined,'match-board-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  const ghostRoot=node('div');bench.append(heading,hint,close,list);root.replaceChildren(viewport,bench,notice,ghostRoot);
  const effective=p=>playerOverrides?playerOverrides.effective(matchPlayerKey(p,model[p.side]),p):p;
  const person=slot=>effective(people.get(working.get(slot).person));
  const reserves=side=>[...people.values()].filter(p=>p.side===side&&![...working.values()].some(s=>s.person===p.key));
  function visuals(button,p){
    p=effective(p);
    button.dataset.playerKey=p.key;
    button.style.setProperty('--team',model[p.side].color);button.style.setProperty('--team2',model[p.side].color2);
    button.style.setProperty('--jersey-number',utils.jerseyNumberColor(model[p.side].color));
    button.replaceChildren(utils.createJersey(p.number),node('span',p.name,'match-player-name'),node('span',POSITION_LABELS[p.position],'match-player-role'));
    const goals=goalMarkers(document,p.goals);if(goals)button.append(goals);
    button.setAttribute('aria-label',model[p.side].name+', '+(p.number??'—')+', '+p.name+', '+POSITION_LABELS[p.position]+(p.goals?', '+p.goals+' gol':'')+'.');button.title=model[p.side].name+' · '+p.name;
  }
  function renderBench(){
    for(const off of benchListeners.splice(0))off();list.replaceChildren();bench.hidden=selected===null;
    if(selected===null)return;
    const p=person(selected);heading.textContent=model[p.side].name+' · '+p.name+' yerine';
    for(const raw of reserves(p.side)){
      const reserve=effective(raw);
      const button=node('button',undefined,'match-reserve');button.type='button';button.dataset.playerKey=reserve.key;visuals(button,reserve);
      button.setAttribute('aria-label',reserve.name+' ile '+p.name+' oyuncusunu değiştir');
      const click=()=>{if(suppressedClicks.delete(button)||!active())return;replace(selected,reserve.key);};
      const down=e=>startReserve(e,reserve.key,button);
      button.addEventListener('click',click);button.addEventListener('pointerdown',down);
      benchListeners.push(()=>{button.removeEventListener('click',click);button.removeEventListener('pointerdown',down);});list.append(button);
    }
    if(!list.children.length)list.append(node('p','Bu takım için yedek oyuncu bilgisi yok.'));
  }
  function replace(slot,incoming){
    if(!playersActive()||!working.has(slot)||!people.has(incoming))return false;
    const before=person(slot),next=effective(people.get(incoming));
    if(before.side!==next.side||[...working.values()].some(s=>s.person===incoming))return false;
    working.get(slot).person=incoming;visuals(markers.get(slot),next);selected=slot;select(slot);
    notice.textContent=before.name+' çıktı, '+next.name+' girdi.';markers.get(slot).focus({preventScroll:true});onChange();return true;
  }
  function targetAt(x,y,rect,exclude=null,side=null){
    return [...working].filter(([key])=>key!==exclude&&(!side||person(key).side===side))
      .map(([key,p])=>({key,d:Math.hypot(rect.left+p.x*rect.width/100-x,rect.top+p.y*rect.height/100-y)}))
      .filter(p=>p.d<=42).sort((a,b)=>a.d-b.d)[0]?.key;
  }
  function highlight(key){for(const [slot,b]of markers)b.classList.toggle('swap-target',slot===key);}
  function startReserve(event,key,button){
    if(!playersActive()||cancelGesture||event.button!==0)return;
    event.preventDefault();button.setPointerCapture(event.pointerId);
    const p=people.get(key),ghost=node('span',undefined,'match-drag-ghost');visuals(ghost,p);
    let moved=false,finished=false,target=null;
    const move=ev=>{
      if(ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(!active()){cancelGesture?.();return;}
      if(!Number.isFinite(ev.clientX)||!Number.isFinite(ev.clientY))return;
      if(!moved&&Math.hypot(ev.clientX-event.clientX,ev.clientY-event.clientY)<4)return;
      moved=true;ev.preventDefault?.();ghostRoot.replaceChildren(ghost);ghost.style.left=ev.clientX+'px';ghost.style.top=ev.clientY+'px';
      target=targetAt(ev.clientX,ev.clientY,pitch.getBoundingClientRect(),null,p.side);highlight(target);
    };
    const end=ev=>{
      if(finished||ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(ev.type==='pointerup'&&active())move(ev);finished=true;stop();cancelGesture=null;
      try{button.releasePointerCapture(event.pointerId);}catch{}ghostRoot.replaceChildren();highlight(null);
      if(moved&&ev.type==='pointerup')suppressedClicks.add(button);
      if(moved&&ev.type==='pointerup'&&active()&&target)replace(target,key);
    };
    const stop=utils.listenForDrag(button,move,end);cancelGesture=()=>end({type:'pointercancel'});
  }
  function listen(target,type,callback){target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener(type,callback));}
  function paint(key){const b=markers.get(key),p=working.get(key);b.style.left=p.x+'%';b.style.top=p.y+'%';}
  function select(key){if(!active()||key!==null&&!playersActive())return;selected=key;for(const [id,b]of markers){b.classList.toggle('selected',id===key);b.setAttribute('aria-pressed',String(id===key));}renderBench();}
  listen(close,'click',()=>{const previous=selected;select(null);markers.get(previous)?.focus({preventScroll:true});});
  function bounds(button,rect){
    const x=Math.min(45,Math.max(6,(button.offsetWidth/2+3)/rect.width*100));
    const y=Math.min(45,Math.max(10,(button.offsetHeight/2+3)/rect.height*100));
    return {minX:x,maxX:100-x,minY:y,maxY:100-y};
  }
  function start(event,key,button){
    if(!playersActive()||cancelGesture||event.button!==0)return;
    const rect=pitch.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return;
    select(key);event.preventDefault();button.focus({preventScroll:true});
    const previous={...working.get(key)},origin={x:event.clientX,y:event.clientY,px:previous.x,py:previous.y};
    const limit=bounds(button,rect);let finished=false,moved=false,target=null;
    button.setPointerCapture(event.pointerId);button.classList.add('dragging');
    const move=ev=>{
      if(ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(!active()){cancelGesture?.();return;}
      if(!Number.isFinite(ev.clientX)||!Number.isFinite(ev.clientY))return;
      if(!moved&&Math.hypot(ev.clientX-origin.x,ev.clientY-origin.y)<3)return;
      moved=true;ev.preventDefault?.();Object.assign(working.get(key),utils.dragCoordinates(origin,ev,rect,limit));paint(key);
      const point=working.get(key);target=targetAt(rect.left+point.x*rect.width/100,rect.top+point.y*rect.height/100,rect,key,person(key).side);highlight(target);
    };
    const end=ev=>{
      if(finished||ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(ev.type==='pointerup'&&active())move(ev);
      finished=true;stop();cancelGesture=null;
      if(ev.type!=='pointerup'||!active())working.set(key,previous);
      else if(moved&&target){const destination={x:working.get(target).x,y:working.get(target).y};Object.assign(working.get(target),{x:previous.x,y:previous.y});Object.assign(working.get(key),destination);paint(target);notice.textContent=person(key).name+' ve '+person(target).name+' yer değiştirdi.';}
      if(moved&&ev.type==='pointerup')suppressedClicks.add(button);highlight(null);
      try{button.releasePointerCapture(event.pointerId);}catch{}
      button.classList.remove('dragging');if(active()){paint(key);if(moved&&ev.type==='pointerup')onChange();}
    };
    const stop=utils.listenForDrag(button,move,end);cancelGesture=()=>end({type:'pointercancel'});
  }
  function renderPlayers(){
  for(const off of playerListeners.splice(0))off();markers.clear();players.replaceChildren();
  const listen=(target,type,fn)=>{target.addEventListener(type,fn);playerListeners.push(()=>target.removeEventListener(type,fn));};
  for(const p of source){
    const button=node('button',undefined,'match-player');button.type='button';button.dataset.slotKey=p.key;
    visuals(button,person(p.key));button.setAttribute('aria-pressed','false');
    markers.set(p.key,button);players.append(button);paint(p.key);
    listen(button,'click',()=>{if(!suppressedClicks.delete(button))select(p.key);});listen(button,'pointerdown',e=>start(e,p.key,button));
    listen(button,'keydown',event=>{
      if(!playersActive()||cancelGesture)return;
      if(event.key==='Escape'){select(null);return;}
      if(event.key==='Enter'&&event.shiftKey&&selected&&selected!==p.key&&person(selected).side===p.side){event.preventDefault();const a=working.get(selected),b=working.get(p.key),old={x:a.x,y:a.y};Object.assign(a,{x:b.x,y:b.y});Object.assign(b,old);paint(selected);paint(p.key);onChange();notice.textContent=person(selected).name+' ve '+person(p.key).name+' yer değiştirdi.';return;}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(!delta)return;event.preventDefault();select(p.key);
      const rect=pitch.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return;
      const limit=bounds(button,rect),point=working.get(p.key),step=event.shiftKey?3:1;
      Object.assign(point,{x:utils.clamp(point.x+delta[0]*step,limit.minX,limit.maxX),y:utils.clamp(point.y+delta[1]*step,limit.minY,limit.maxY)});paint(p.key);onChange();
    });
  }
  }
  renderPlayers();
  if(!toolbarHost){toolbarHost=node('div',undefined,'match-tactical-host');root.append(toolbarHost);}
  drawing=mountTacticalDrawings({root,pitch,toolbarHost,document,utils,getPreferenceStorage,initial,onChange,current:active,onMode(){cancelGesture?.();select(null);}});
  const offOverrides=playerOverrides?.subscribe(()=>{if(active()){for(const [key,marker] of markers)visuals(marker,person(key));renderBench();}})||(()=>{});
  return Object.freeze({
    setTeam(side,team){
      if(!active()||!['home','away'].includes(side)||!team)return;
      cancelGesture?.();drawing.cancel();select(null);
      for(const p of source.filter(p=>p.side===side))working.delete(p.key);
      for(const [key,p]of people)if(p.side===side)people.delete(key);
      model={...model,[side]:team};
      const added=team.players.map(p=>({...p,side}));source=[...source.filter(p=>p.side!==side),...added];
      for(const p of [...team.players,...team.bench])people.set(p.key,{...p,side});
      for(const p of added)working.set(p.key,{x:p.initialX,y:p.initialY,person:p.key});
      renderPlayers();onChange();
    },
    exportState(){return {model,working:[...working].map(([slotKey,p])=>({slotKey,personKey:p.person,x:p.x,y:p.y})),drawings:drawing.getState().objects,pitch:drawing.getPitch()};},
    getDrawings:()=>drawing.getState(),
    getState(){return {matchId:model.matchId,selected,players:source.map(p=>({key:person(p.key).key,side:p.side,playerId:person(p.key).playerId,x:working.get(p.key).x,y:working.get(p.key).y}))};},
    reset(){if(!active())return;cancelGesture?.();drawing.cancel();for(const p of source){working.set(p.key,{x:p.initialX,y:p.initialY,person:p.key});visuals(markers.get(p.key),person(p.key));paint(p.key);}select(null);onChange();},
    dispose(){if(disposed)return;disposed=true;offOverrides();cancelGesture?.();drawing.dispose();for(const off of [...listeners,...playerListeners,...benchListeners])off();root.replaceChildren();markers.clear();working.clear();},
  });
}
