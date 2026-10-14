import {createWeeklyPitch,WEEKLY_PITCH} from './weekly-xi-pitch.js';
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
 const pitch=createWeeklyPitch({document,utils,state,effective});
 pitch.setAttribute('x',510);pitch.setAttribute('y',80);pitch.setAttribute('width',900);pitch.setAttribute('height',900*WEEKLY_PITCH.height/WEEKLY_PITCH.width);pitch.setAttribute('style','width:900px;height:'+900*WEEKLY_PITCH.height/WEEKLY_PITCH.width+'px');svg.append(pitch);
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
