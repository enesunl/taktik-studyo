import {DRAWING_COLORS,DRAWING_WIDTHS,OBJECT_LIMIT,createDrawingHistory,drawingObject,samplePoint,hitDrawing,renderDrawing} from './tactical-drawings.js';
import {createPitchPreference} from './pitch-preference.js';
import {createStudioPreferences,SIZE_BOUNDS} from './studio-preferences.js';

const TOOLS=[['select','Seç','Seç / Oyuncu taşı'],['movement-arrow','Koşu','Koşu oku'],['pass-arrow','Pas','Pas oku'],['line','Çizgi','Düz çizgi'],['freehand','Kalem','Serbest çizim'],['zone','Alan','Alan çiz'],['circle','Çember','Çember çiz'],['eraser','Sil','Çizimi sil']];
const COLOR_LABELS={white:'Beyaz',yellow:'Sarı',red:'Kırmızı',blue:'Mavi'},WIDTH_LABELS={thin:'İnce',medium:'Orta',thick:'Kalın'};

export function mountTacticalDrawings({root,pitch,toolbarHost,document,utils,current,onMode,getPreferenceStorage}){
  const history=createDrawingHistory(),listeners=[],toolButtons=new Map(),colorButtons=new Map(),widthButtons=new Map();
  let tool='select',color='yellow',width='medium',disposed=false,cancelGesture=null,nextId=0;
  const active=()=>!disposed&&current();
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const svgNode=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
  const layer=svgNode('svg'),objects=svgNode('g'),preview=svgNode('g');
  layer.classList.add('match-drawings');layer.setAttribute('viewBox','0 0 1000 625');layer.setAttribute('preserveAspectRatio','none');layer.setAttribute('aria-hidden','true');layer.append(objects,preview);
  const input=node('div','match-drawing-input');input.tabIndex=-1;input.setAttribute('role','region');input.setAttribute('aria-label','Taktik çizim alanı');
  pitch.append(layer,input);
  const bar=node('div','match-tactical-tools'),tray=node('div','match-tactical-tray');
  tray.setAttribute('aria-label','Taktik çizim araçları');bar.append(tray);toolbarHost.append(bar);
  function group(label,cls){const section=node('section','match-tool-group '+cls),heading=node('h2',null,label),body=node('div','match-tool-grid');section.append(heading,body);tray.append(section);return body;}
  const toolsGroup=group('Araçlar','match-tools-group'),colorsGroup=group('Çizim rengi','match-colors-group'),widthsGroup=group('Çizgi kalınlığı','match-widths-group'),pitchGroup=group('Saha','match-pitch-group'),historyGroup=group('Geçmiş','match-history-group');
  const notice=node('p','match-drawing-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');root.append(notice);
  function listen(target,type,callback){target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener(type,callback));}
  function button(label,title,kind,value,handler){
    const b=node('button','match-tactical-button',label);b.type='button';b.title=title;b.setAttribute('aria-label',title);b.dataset[kind]=value;
    listen(b,'click',()=>{if(active())handler();});({tool:toolsGroup,color:colorsGroup,width:widthsGroup,action:historyGroup}[kind]).append(b);return b;
  }
  function refresh(){
    tray.dataset.activeLabel=TOOLS.find(t=>t[0]===tool)[1];
    for(const [value,b]of toolButtons)b.setAttribute('aria-pressed',String(tool===value));
    for(const [value,b]of colorButtons)b.setAttribute('aria-pressed',String(color===value));
    for(const [value,b]of widthButtons)b.setAttribute('aria-pressed',String(width===value));
    const snapshot=history.snapshot();undo.disabled=!snapshot.undoCount;redo.disabled=!snapshot.redoCount;clear.disabled=!snapshot.objects.length;
    pitch.classList.toggle('is-drawing',tool!=='select');input.tabIndex=tool==='select'?-1:0;
  }
  function paint(){objects.replaceChildren(...history.snapshot().objects.map(o=>renderDrawing(document,o)));refresh();}
  function setTool(value){
    if(!active()||!toolButtons.has(value))return;
    cancelGesture?.();tool=value;onMode(value);refresh();
    notice.textContent=value==='select'?'Oyuncuları taşıyabilir ve boş sahayı yatay kaydırabilirsin.':value==='eraser'?'Silmek istediğin çizime dokun. Sahayı kaydırmak için Seç’e dön.':'Sahada sürükleyerek çiz. Sahayı kaydırmak için Seç’e dön. Escape çizimi iptal eder.';
  }
  function action(name){if(!active())return;cancelGesture?.();if(history[name]()){paint();notice.textContent={undo:'Çizim işlemi geri alındı.',redo:'Çizim işlemi yinelendi.',clear:'Tüm çizimler temizlendi. Oyuncular korundu.'}[name];}}
  for(const [value,label,title]of TOOLS)toolButtons.set(value,button(label,title,'tool',value,()=>setTool(value)));
  const undo=button('↶','Çizimi geri al','action','undo',()=>action('undo'));
  const redo=button('↷','Çizimi yinele','action','redo',()=>action('redo'));
  const clear=button('Temizle','Tüm çizimleri temizle','action','clear',()=>action('clear'));
  for(const value of Object.keys(DRAWING_COLORS)){
    const b=button(COLOR_LABELS[value],COLOR_LABELS[value],'color',value,()=>{cancelGesture?.();color=value;refresh();});b.style.setProperty('--drawing-color',DRAWING_COLORS[value]);colorButtons.set(value,b);
  }
  for(const value of Object.keys(DRAWING_WIDTHS))widthButtons.set(value,button(WIDTH_LABELS[value],WIDTH_LABELS[value]+' çizgi','width',value,()=>{cancelGesture?.();width=value;refresh();}));
  const sizeInputs={};
  for(const [key,label]of [['width','Saha genişliği'],['height','Saha yüksekliği']]){
    const row=node('label','match-size-label',label),slider=node('input');slider.type='range';slider.min=SIZE_BOUNDS[key][0];slider.max=SIZE_BOUNDS[key][1];slider.step=10;slider.setAttribute('aria-label',label);
    const value=node('output');row.append(slider,value);pitchGroup.append(row);sizeInputs[key]={slider,value};
    listen(slider,'input',()=>{if(active()){cancelGesture?.();sizePreference.setSize({...sizePreference.getSize(),[key]:Number(slider.value)});}});
  }
  const sizePreference=createStudioPreferences({getStorage:getPreferenceStorage,onSize(size){for(const key of ['width','height']){pitch.style.setProperty('--match-pitch-'+key,size[key]+'px');sizeInputs[key].slider.value=String(size[key]);sizeInputs[key].value.textContent=size[key]+' px';}}});
  const pitchLabel=node('label','match-pitch-color-label','Saha rengi'),picker=node('input','match-pitch-color'),pitchValue=node('span','match-pitch-color-value'),resetPitch=node('button','match-tactical-button','Varsayılana Dön');
  picker.type='color';picker.setAttribute('aria-label','Saha rengi');resetPitch.type='button';resetPitch.title='Varsayılan saha boyutlarına ve rengine dön';
  pitchLabel.append(picker,pitchValue);pitchGroup.append(pitchLabel,resetPitch);
  const preference=createPitchPreference({getStorage:getPreferenceStorage,onChange({color,markings,isDefault}){
    picker.value=color;pitchValue.textContent=color;pitch.style.setProperty('--match-pitch-background',isDefault?'repeating-linear-gradient(90deg,#285b3b 0%,#285b3b 10%,#2b6140 10%,#2b6140 20%)':color);
    pitch.style.setProperty('--match-pitch-markings',markings);
  }});
  listen(picker,'input',()=>{if(active())preference.set(picker.value);});listen(resetPitch,'click',()=>{if(active()){cancelGesture?.();preference.reset();sizePreference.resetSize();}});

  listen(input,'pointerdown',event=>{
    if(!active()||tool==='select'||cancelGesture||event.button!==0||event.isPrimary===false)return;
    const rect=pitch.getBoundingClientRect();if(!(rect.width>0&&rect.height>0)||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    event.preventDefault();input.focus({preventScroll:true});
    const start=utils.pitchPoint(event,rect),points=[start],type=tool,chosenColor=color,chosenWidth=width;
    let endPoint=start,finished=false;
    input.setPointerCapture(event.pointerId);
    const object=previewing=>drawingObject({id:previewing?'preview':'draw-'+(nextId+1),type,color:chosenColor,width:chosenWidth,start,end:endPoint,points},previewing);
    function move(ev){
      if(ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(!active()){cancelGesture?.();return;}
      if(!Number.isFinite(ev.clientX)||!Number.isFinite(ev.clientY))return;
      ev.preventDefault?.();const bounds=pitch.getBoundingClientRect();if(!(bounds.width>0&&bounds.height>0))return;
      endPoint=utils.pitchPoint(ev,bounds);if(type==='freehand')samplePoint(points,endPoint);
      if(type!=='eraser')preview.replaceChildren(renderDrawing(document,object(true)));
    }
    function end(ev){
      if(finished||ev.pointerId!==undefined&&ev.pointerId!==event.pointerId)return;
      if(ev.type==='pointerup'&&active())move(ev);finished=true;stop();cancelGesture=null;preview.replaceChildren();
      try{input.releasePointerCapture(event.pointerId);}catch{}
      if(ev.type!=='pointerup'||!active())return;
      if(type==='eraser'){
        const bounds=pitch.getBoundingClientRect(),id=hitDrawing(history.snapshot().objects,endPoint,8,bounds);
        if(id){history.erase(id);paint();notice.textContent='Çizim silindi.';}
      }else{
        const value=object(false);if(!value)return;
        if(history.add(value)){nextId++;paint();notice.textContent='Çizim eklendi.';}
        else notice.textContent='En fazla '+OBJECT_LIMIT+' çizim eklenebilir. Bir çizimi sil veya çizimleri temizle.';
      }
    }
    const stop=utils.listenForDrag(input,move,end);cancelGesture=()=>end({type:'pointercancel'});
    if(type!=='eraser')preview.replaceChildren(renderDrawing(document,object(true)));
  });
  function shortcut(event){
    const target=event.target,tag=target?.tagName?.toLowerCase();
    if(!active()||event.defaultPrevented||['input','textarea','select'].includes(tag)||target?.isContentEditable||target?.closest?.('[contenteditable="true"], [contenteditable=""]'))return;
    if(event.key==='Escape'){event.preventDefault();setTool('select');toolButtons.get('select').focus({preventScroll:true});}
    else if((event.ctrlKey||event.metaKey)&&!event.altKey){
      const key=event.key.toLowerCase();if(key==='z'||key==='y'){event.preventDefault();action(key==='y'||event.shiftKey?'redo':'undo');}
    }
  }
  for(const target of new Set([root,toolbarHost]))listen(target,'keydown',shortcut);
  refresh();
  return Object.freeze({
    getTool:()=>tool,
    getState:()=>({tool,color,width,...history.snapshot()}),
    cancel:()=>cancelGesture?.(),
    dispose(){if(disposed)return;disposed=true;cancelGesture?.();for(const off of listeners)off();toolbarHost.replaceChildren();layer.replaceChildren();preview.replaceChildren();},
  });
}
