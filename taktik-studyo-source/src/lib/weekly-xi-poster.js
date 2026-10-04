import {weeklyMosaic,weeklyWeekText} from './weekly-xi-panel.js';

// One self-contained artwork for the editor, preview and PNG. Only its viewport scales.
export function createWeeklyPoster({document,slots,week,idPrefix='weekly-export'}){
 const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');
 const add=(tag,attrs={},parent=svg)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));parent.append(n);return n;};
 for(const [k,v]of Object.entries({viewBox:'0 0 270 750',width:270,height:750,preserveAspectRatio:'xMidYMid meet',overflow:'hidden',role:'img','aria-label':'Süper Lig hafta bilgisi',class:'weekly-poster-art',style:'width:100%;height:100%'}))svg.setAttribute(k,v);
 const defs=add('defs'),ref=name=>'url(#'+idPrefix+'-'+name+')';
 const gradient=(name,tag,attrs,stops)=>{const g=add(tag,{id:idPrefix+'-'+name,...attrs},defs);for(const [offset,color,opacity]of stops)add('stop',{offset,'stop-color':color,'stop-opacity':opacity},g);};
 gradient('shade','linearGradient',{x1:0,y1:0,x2:1,y2:1},[['0%','#000',.65],['70%','#000',0],['100%','#000',.15]]);
 gradient('shine','linearGradient',{x1:0,y1:0,x2:0,y2:1},[['0%','#000',.2],['45%','#fff',.12],['100%','#000',.35]]);
 gradient('fade','linearGradient',{x1:0,y1:0,x2:0,y2:1},[['0%','#fff',0],['12%','#fff',1],['86%','#fff',1],['100%','#fff',0]]);
 gradient('center','radialGradient',{cx:'.5',cy:'.5',r:'.5'},[['0%','#09120e',.98],['30%','#09120e',.93],['70%','#09120e',.33],['100%','#09120e',0]]);
 const dots=add('pattern',{id:idPrefix+'-dots',width:5,height:5,patternUnits:'userSpaceOnUse'},defs);add('circle',{cx:1,cy:1,r:.6,fill:'#f7edcb','fill-opacity':.1},dots);
 const mask=add('mask',{id:idPrefix+'-mask',maskUnits:'userSpaceOnUse',x:0,y:150,width:270,height:480},defs);add('rect',{x:0,y:150,width:270,height:480,fill:ref('fade')},mask);
 const clip=add('clipPath',{id:idPrefix+'-clip'},defs);add('rect',{width:270,height:750,rx:14},clip);
 const art=add('g',{'clip-path':ref('clip')});
 add('rect',{width:270,height:750,fill:'#09120e'},art);
 for(let x=-360;x<660;x+=45)add('line',{x1:x,y1:750,x2:x+366,y2:0,stroke:'#e6efdc','stroke-opacity':.06},art);
 const mosaic=add('g',{mask:ref('mask'),'aria-hidden':'true'},art);
 const ribbons=add('g',{transform:'translate(52 150) skewX(-26)'},mosaic);
 for(const tile of weeklyMosaic(slots)){
  const x=tile.x/6*400,y=tile.y/6*480,w=tile.w/6*400,h=tile.h/6*480;
  const cell=add('g',{class:'weekly-mosaic-cell'},ribbons);
  add('rect',{x,y,width:w-2,height:h-2,fill:tile.color||'#284c40',opacity:.82},cell);
  add('rect',{x,y,width:w-2,height:h-2,fill:ref('shade')},cell);
  add('rect',{x:x+w*.72,y,width:w*.28-2,height:h-2,fill:tile.accent||'#a68b4b',opacity:.82},cell);
  add('rect',{x:x+w*.72,y,width:w*.28-2,height:h-2,fill:ref('shine')},cell);
  add('rect',{x,y,width:w-2,height:h-2,fill:ref('dots'),stroke:'#ffffff','stroke-opacity':.12},cell);
 }
 add('rect',{x:0,y:150,width:270,height:480,fill:ref('center')},art);
 const text=(value,x,y,size,attrs={})=>{const n=add('text',{x,y,'font-family':'Arial, sans-serif','font-size':size,'font-weight':700,fill:'#f4f4e9',...attrs},art);n.textContent=value;return n;};
 text('SÜPER',14,69,56,{'font-weight':900,'letter-spacing':-3});text('LİG',14,121,56,{'font-weight':900,'letter-spacing':-3});
 const info=weeklyWeekText(week);
 text('HAFTA',135,325,17,{'text-anchor':'middle','letter-spacing':5,class:'weekly-week-label'});
 text(info.number,132,455,140,{'text-anchor':'middle','font-weight':900,'letter-spacing':-7,class:'weekly-week-number'});
 text('11 OYUNCU • TEK KADRO',14,683,10,{'letter-spacing':1.2});
 text('TAKIMLAR FARKLI. SAHNE AYNI.',14,711,8,{'letter-spacing':.7,fill:'#c3cbbb'});
 return svg;
}
