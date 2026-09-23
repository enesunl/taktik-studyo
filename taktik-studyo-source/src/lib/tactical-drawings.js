// Pitch-relative objects only. SVG uses a fixed design space, never screen pixels.
export const DRAWING_COLORS=Object.freeze({white:'#ffffff',yellow:'#f5df4d',red:'#ff6868',blue:'#74bcff'});
export const DRAWING_WIDTHS=Object.freeze({thin:2,medium:4,thick:7});
export const DRAWING_TYPES=Object.freeze(['movement-arrow','pass-arrow','line','freehand','zone','circle']);
export const HISTORY_LIMIT=50,OBJECT_LIMIT=200,POINT_LIMIT=256;
const clamp=value=>Math.max(0,Math.min(1,value));
const point=p=>({x:clamp(p.x),y:clamp(p.y)});
const distance=(a,b)=>Math.hypot((a.x-b.x)*1000,(a.y-b.y)*625);
const clone=value=>JSON.parse(JSON.stringify(value));

export function samplePoint(points,value,force=false){
  const p=point(value);
  if(points.length&&distance(points.at(-1),p)<(force?0.01:2))return;
  if(points.length>=POINT_LIMIT){const sampled=points.filter((_,i)=>i%2===0);points.splice(0,points.length,...sampled);}
  points.push(p);
}
export function drawingObject({id,type,color,width,start,end,points=[]},preview=false){
  if(!DRAWING_TYPES.includes(type)||!Object.hasOwn(DRAWING_COLORS,color)||!Object.hasOwn(DRAWING_WIDTHS,width))return null;
  start=point(start);end=point(end);
  let geometry;
  if(type==='zone'||type==='circle'){
    geometry={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)};
    if(!preview&&(geometry.width*1000<4||geometry.height*625<4))return null;
  }else if(type==='freehand'){
    const sampled=[];for(const p of points)samplePoint(sampled,p);samplePoint(sampled,end,true);
    if(!preview&&(sampled.length<2||sampled.slice(1).reduce((sum,p,i)=>sum+distance(sampled[i],p),0)<6))return null;
    geometry={points:sampled};
  }else{
    if(!preview&&distance(start,end)<6)return null;
    geometry={start,end};
  }
  return {id,type,color,width,geometry};
}

export function createDrawingHistory(){
  let objects=[],undo=[],redo=[];
  function commit(next){undo.push(objects);if(undo.length>HISTORY_LIMIT)undo.shift();objects=next;redo=[];return true;}
  return Object.freeze({
    snapshot:()=>({objects:clone(objects),undoCount:undo.length,redoCount:redo.length}),
    add(object){if(!object||objects.length>=OBJECT_LIMIT)return false;return commit([...objects,clone(object)]);},
    erase(id){const next=objects.filter(o=>o.id!==id);return next.length!==objects.length&&commit(next);},
    clear(){return objects.length>0&&commit([]);},
    undo(){if(!undo.length)return false;redo.push(objects);objects=undo.pop();return true;},
    redo(){if(!redo.length)return false;undo.push(objects);objects=redo.pop();return true;},
  });
}

const xy=p=>({x:p.x*1000,y:p.y*625});
const segmentDistance=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
function arrowHead(object){
  const a=xy(object.geometry.start),b=xy(object.geometry.end),angle=Math.atan2(b.y-a.y,b.x-a.x),length=Math.min(12+DRAWING_WIDTHS[object.width]*2,Math.hypot(b.x-a.x,b.y-a.y)*.45);
  return [{x:b.x-length*Math.cos(angle-.5),y:b.y-length*Math.sin(angle-.5)},b,{x:b.x-length*Math.cos(angle+.5),y:b.y-length*Math.sin(angle+.5)}];
}
// Reverse paint order: the most recently drawn eligible object wins.
export function hitDrawing(objects,p,tolerance=8,viewport={width:1000,height:625}){
  const scale=v=>({x:v.x*viewport.width/1000,y:v.y*viewport.height/625});
  p=scale(xy(p));
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i],g=o.geometry,t=tolerance+DRAWING_WIDTHS[o.width]*Math.max(viewport.width/1000,viewport.height/625)/2;let points=[];
    if(o.type==='zone'){
      if(p.x>=g.x*viewport.width-t&&p.x<=(g.x+g.width)*viewport.width+t&&p.y>=g.y*viewport.height-t&&p.y<=(g.y+g.height)*viewport.height+t)return o.id;
    }else if(o.type==='circle'){
      const cx=(g.x+g.width/2)*1000,cy=(g.y+g.height/2)*625;
      points=Array.from({length:65},(_,j)=>({x:cx+g.width*500*Math.cos(j*Math.PI/32),y:cy+g.height*312.5*Math.sin(j*Math.PI/32)}));
    }else points=o.type==='freehand'?g.points.map(xy):[xy(g.start),xy(g.end)];
    const hit=line=>{const scaled=line.map(scale);return scaled.slice(1).some((b,j)=>segmentDistance(p,scaled[j],b)<=t);};
    if(hit(points)||o.type.endsWith('-arrow')&&hit(arrowHead(o)))return o.id;
  }
  return null;
}

export function renderDrawing(document,object){
  const make=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
  const g=object.geometry,group=make('g',{'data-drawing-id':object.id,stroke:DRAWING_COLORS[object.color],'stroke-width':DRAWING_WIDTHS[object.width],fill:'none','stroke-linecap':'round','stroke-linejoin':'round'});
  const coords=points=>points.map(p=>p.x+','+p.y).join(' ');
  if(object.type==='zone')group.append(make('rect',{x:g.x*1000,y:g.y*625,width:g.width*1000,height:g.height*625,fill:DRAWING_COLORS[object.color],'fill-opacity':.16}));
  else if(object.type==='circle')group.append(make('ellipse',{cx:(g.x+g.width/2)*1000,cy:(g.y+g.height/2)*625,rx:g.width*500,ry:g.height*312.5}));
  else{
    const attrs={points:coords(object.type==='freehand'?g.points.map(xy):[xy(g.start),xy(g.end)])};
    if(object.type==='pass-arrow')attrs['stroke-dasharray']='12 9';
    group.append(make('polyline',attrs));
    if(object.type.endsWith('-arrow'))group.append(make('polyline',{points:coords(arrowHead(object))}));
  }
  return group;
}
