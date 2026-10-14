import {shortPlayerLabel} from './player-label.js';
import {WEEKLY_FORMATIONS} from './weekly-xi.js';
export const WEEKLY_PITCH={width:736,height:750,font:'"DM Sans", Arial, sans-serif'};
// Deterministic wrapping is shared by the editor, preview and exported bitmap.
export function weeklyNameLines(value,width,measure){
 const words=String(value).trim().split(/\s+/),lines=[''];
 for(const word of words){const i=lines.length-1,candidate=lines[i]?lines[i]+' '+word:word;
  if(measure(candidate)<=width)lines[i]=candidate;
  else if(i===0&&lines[0])lines.push(word);else lines[i]=candidate;
 }
 return lines.map(line=>{if(measure(line)<=width)return line;const chars=Array.from(line);while(chars.length&&measure(chars.join('')+'…')>width)chars.pop();return chars.join('')+'…';});
}
export function createWeeklyPitch({document,utils,state,effective=p=>p}){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 736 750');svg.setAttribute('width',736);svg.setAttribute('height',750);svg.setAttribute('aria-label','Haftanın ilk 11 sahası');
 const add=(tag,attrs={},parent=svg)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n;};
 const text=(value,x,y,size,parent,attrs={})=>{const n=add('text',{x,y,'font-family':WEEKLY_PITCH.font,'font-size':size,'font-weight':700,'text-anchor':'middle',fill:'#f2f7ed',...attrs},parent);n.textContent=value;return n;};
 add('rect',{width:736,height:750,rx:14,fill:'#244a34'});
 for(let i=1;i<8;i+=2)add('rect',{x:1,y:i*750/8,width:734,height:750/8-(i===7?2:0),fill:'#28533b'});
 add('rect',{x:.5,y:.5,width:735,height:749,rx:14,fill:'none',stroke:'#6e976d'});
 const mark=add('g',{fill:'none',stroke:'#c9e2be','stroke-opacity':.34,'stroke-width':1});
 add('rect',{x:29.44,y:30,width:677.12,height:690},mark);add('line',{x1:29.44,y1:375,x2:706.56,y2:375},mark);add('circle',{cx:368,cy:375,r:94.797},mark);
 for(const bottom of [false,true]){add('rect',{x:178.4064,y:bottom?602.7:30,width:379.1872,height:117.3},mark);add('rect',{x:279.9744,y:bottom?678.6:30,width:176.0512,height:41.4},mark);}
 const ctx=document.createElement('canvas').getContext('2d');ctx.font='600 12px '+WEEKLY_PITCH.font;
 const max=Math.max(...WEEKLY_FORMATIONS[state.formation].map(row=>row.length)),width=Math.min(116,736*(max>5?.13:max>4?.16:.18));
 for(const slot of state.slots){
  if(!slot.player)continue;const p=effective(slot.player),g=add('g',{'data-weekly-slot':slot.slotId,transform:`translate(${slot.x*7.36} ${slot.y*7.5})`});
  add('title',{},g).textContent=p.name+' · '+p.teamName;
  const jersey=utils.createJersey(p.number).querySelector('svg').cloneNode(true);jersey.setAttribute('x',-22);jersey.setAttribute('y',-40);jersey.setAttribute('width',44);jersey.setAttribute('height',44);jersey.setAttribute('style','width:44px;height:44px');
  const body=jersey.querySelector('.jersey-body'),accent=jersey.querySelector('.jersey-accent');body.removeAttribute('class');accent.removeAttribute('class');body.setAttribute('fill',p.color);body.setAttribute('stroke','#ffffff');body.setAttribute('stroke-opacity',.7);body.setAttribute('stroke-width',1.4);body.setAttribute('stroke-linejoin','round');accent.setAttribute('fill',p.color2);g.append(jersey);
  text(p.number??'–',0,-14,15,g,{'font-weight':800,fill:utils.jerseyNumberColor(p.color)});
  const lines=weeklyNameLines(shortPlayerLabel(p),width-12,s=>ctx.measureText(s).width),w=Math.min(width,Math.max(...lines.map(l=>ctx.measureText(l).width))+12);
  add('rect',{x:-w/2,y:8,width:w,height:lines.length*13.8+6,rx:4,fill:'#102d20','fill-opacity':217/255},g);
  lines.forEach((line,i)=>text(line,0,20+i*13.8,12,g,{'font-weight':600,fill:'#ffffff'}));text(slot.role,0,lines.length*14+24,10,g,{'letter-spacing':1,fill:'#dfedcf'});
 }
 return svg;
}
