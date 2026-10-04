// A single vector presentation surface is used both in the dialog and PNG render.
// No DOM screenshot, foreignObject, provider media or external font resources.
import {weeklyWeekText} from './weekly-xi-panel.js';
import {createWeeklyPoster} from './weekly-xi-poster.js';
export {weeklyWeekText};
export const WEEKLY_EXPORT=Object.freeze({width:1920,height:1080,filename:'taktikstudyo-haftanin-ilk-11i.png'});
const NS='http://www.w3.org/2000/svg';
export function weeklyPalette(document,window){
 const css=window.getComputedStyle(document.documentElement),keys={background:'--bg-page',ink:'--text-primary',muted:'--text-secondary',line:'--border'};
 return Object.fromEntries(Object.entries(keys).map(([key,token])=>{
  const color=css.getPropertyValue(token).trim();
  if(!/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(color))throw Error('Theme unavailable');
  return [key,color];
 }));
}
export function fitWeeklyLabel(value,maxWidth,measure){
 const text=String(value);if(measure(text)<=maxWidth)return text;
 const chars=Array.from(text);while(chars.length&&measure(chars.join('')+'…')>maxWidth)chars.pop();return chars.join('')+'…';
}
export function createWeeklyGraphic({document,utils,state,effective=p=>p,palette,metadata={}}){
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 1920 1080');svg.setAttribute('width',WEEKLY_EXPORT.width);svg.setAttribute('height',WEEKLY_EXPORT.height);
 svg.setAttribute('role','img');svg.setAttribute('aria-label',metadata.title||'Haftanın İlk 11’i');
 const add=(tag,attrs={},parent=svg)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n;};
 const text=(value,x,y,size,attrs={})=>{const n=add('text',{x,y,'font-family':'Arial, sans-serif','font-size':size,'font-weight':600,fill:palette.ink,...attrs});n.textContent=value;return n;};
 const line=(x1,y1,x2,y2,opacity=1)=>add('line',{x1,y1,x2,y2,stroke:palette.line,'stroke-width':1,opacity});
 const measureContext=document.createElement('canvas').getContext('2d');if(!measureContext)throw Error('Canvas unavailable');measureContext.font='700 18px Arial';
 add('rect',{width:1920,height:1080,fill:palette.background});
 for(const x of [96]){
  line(x,80,x+340,80);line(x,1000,x+340,1000);
  for(let y=128;y<1000;y+=48)line(x,y,x+340,y,.15);
 }
 text('TAKTİK STÜDYO / SEÇKİ',96,116,18,{'letter-spacing':3,fill:palette.muted});
 line(96,370,436,370);text('TEAM',96,474,86,{'font-weight':800,'letter-spacing':-4});
 line(96,521,166,521);text('OF THE',187,528,23,{'letter-spacing':5});text('WEEK',96,625,86,{'font-weight':800,'letter-spacing':-4});line(96,659,436,659);
 text('11 OYUNCU.',96,929,18,{'letter-spacing':2,fill:palette.muted});text('TEK BİR BAKIŞ AÇISI.',96,962,18,{'letter-spacing':2,fill:palette.muted});
 const poster=createWeeklyPoster({document,slots:state.slots,week:metadata.week});
 poster.setAttribute('x',1488.4);poster.setAttribute('y',80);poster.setAttribute('width',331.2);poster.setAttribute('height',920);poster.setAttribute('style','width:331.2px;height:920px');svg.append(poster);
 const pitch={x:510,y:80,w:900,h:920};
 add('rect',{x:pitch.x,y:pitch.y,width:pitch.w,height:pitch.h,fill:'#244a34',rx:14});
 for(let i=1;i<8;i+=2)add('rect',{x:pitch.x+1,y:pitch.y+i*pitch.h/8,width:pitch.w-2,height:pitch.h/8-(i===7?2:0),fill:'#28533b'});
 add('rect',{x:pitch.x,y:pitch.y,width:pitch.w,height:pitch.h,fill:'none',stroke:'#6e976d',rx:14});
 const mark=add('g',{fill:'none',stroke:'#c9e2be','stroke-opacity':.34,'stroke-width':1.5});
 const inside={x:546,y:117,w:828,h:846};
 add('rect',{x:inside.x,y:inside.y,width:inside.w,height:inside.h},mark);
 add('line',{x1:inside.x,y1:540,x2:inside.x+inside.w,y2:540},mark);add('circle',{cx:960,cy:540,r:116},mark);
 for(const bottom of [false,true]){
  add('rect',{x:inside.x+inside.w*.22,y:bottom?inside.y+inside.h*.83:inside.y,width:inside.w*.56,height:inside.h*.17},mark);
  add('rect',{x:inside.x+inside.w*.37,y:bottom?inside.y+inside.h*.94:inside.y,width:inside.w*.26,height:inside.h*.06},mark);
 }
 const maxLine=Math.max(...state.formation.split('-').map(Number)),labelWidth=maxLine>5?112:maxLine>4?140:162;
 for(const slot of state.slots){
  if(!slot.player)continue;const p=effective(slot.player),x=pitch.x+slot.x*pitch.w/100,y=pitch.y+slot.y*pitch.h/100;
  // Reuse the actual generic jersey's paths; resolve all CSS colors inline.
  const jersey=utils.createJersey(p.number).querySelector('svg').cloneNode(true);
  jersey.setAttribute('x',x-32);jersey.setAttribute('y',y-47);jersey.setAttribute('width',64);jersey.setAttribute('height',64);
  const body=jersey.querySelector('.jersey-body'),accent=jersey.querySelector('.jersey-accent');
  body.removeAttribute('class');body.setAttribute('fill',p.color);body.setAttribute('stroke','#ffffff');body.setAttribute('stroke-opacity',.7);body.setAttribute('stroke-width',1.4);body.setAttribute('stroke-linejoin','round');accent.removeAttribute('class');accent.setAttribute('fill',p.color2);svg.append(jersey);
  text(p.number??'–',x,y-8,22,{'font-weight':800,'text-anchor':'middle',fill:utils.jerseyNumberColor(p.color)});
  const name=fitWeeklyLabel(p.name,labelWidth-10,s=>measureContext.measureText(s).width),width=Math.min(labelWidth,measureContext.measureText(name).width+10);
  add('rect',{x:x-width/2,y:y+24,width,height:25,rx:4,fill:'#102b20','fill-opacity':.92});
  const nameNode=text(name,x,y+43,18,{'text-anchor':'middle','font-weight':700,fill:'#f2f7ed'});add('title',{},nameNode).textContent=p.name;
  text(slot.role,x,y+68,15,{'text-anchor':'middle','letter-spacing':1,fill:'#dfedcf'});
 }
 return svg;
}

export async function renderWeeklyPNG({document,window,svg,current=()=>true}){
 // Freeze the exact visible projection before any async boundary (including theme).
 const source=svg.cloneNode(true);
 await document.fonts?.ready;if(!current())throw Error('Preview closed');
 const canvas=document.createElement('canvas');canvas.width=WEEKLY_EXPORT.width;canvas.height=WEEKLY_EXPORT.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
 const xml=new window.XMLSerializer().serializeToString(source),url=window.URL.createObjectURL(new window.Blob([xml],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new window.Image();
  await new Promise((resolve,reject)=>{
   const timer=window.setTimeout(()=>finish(false),15000);
   const finish=ok=>{window.clearTimeout(timer);img.onload=null;img.onerror=null;ok?resolve():reject(Error('Image unavailable'));};
   img.onload=()=>finish(true);img.onerror=()=>finish(false);img.src=url;
  });
  if(!current())throw Error('Preview closed');ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG unavailable')),'image/png'));
  if(!current())throw Error('Preview closed');return blob;
 }finally{window.URL.revokeObjectURL(url);}
}

export function downloadWeeklyPNG({document,window,blob}){
 const url=window.URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=WEEKLY_EXPORT.filename;
 try{document.body.append(link);link.click();}finally{link.remove();window.setTimeout(()=>window.URL.revokeObjectURL(url),1000);}
}
