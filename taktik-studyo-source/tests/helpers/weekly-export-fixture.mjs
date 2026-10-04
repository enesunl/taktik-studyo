import {BoardNode,matchBoardDocument} from './match-board-fixture.mjs';
import {allNodes} from './matches-fixture.mjs';

// Minimal SVG DOM / canvas ports. The jersey markup still comes from dist/app.js.
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function serialize(node){return '<'+node.tagName+Object.entries(node.attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+escape(node.textContent||'')+node.children.map(serialize).join('')+'</'+node.tagName+'>';}
export class ExportNode extends BoardNode{
 setAttribute(key,value){super.setAttribute(key,String(value));}
 get firstElementChild(){return this.children[0]||null;}
 get innerHTML(){return this.markup;}
 set innerHTML(value){
  if(!value.startsWith('<svg viewBox="0 0 64 64"'))throw Error('Only trusted jersey SVG supported');
  this.markup=value;const svg=new ExportNode('svg');svg.setAttribute('viewBox','0 0 64 64');
  for(const match of value.matchAll(/<path\s+([^>]+)\/>/g)){
   const path=new ExportNode('path');for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))path.setAttribute(attr[1],attr[2]);svg.append(path);
  }
  this.replaceChildren(svg);
 }
 querySelector(selector){return allNodes(this).slice(1).find(n=>selector.startsWith('.')?(n.className||n.attrs.class||'').split(' ').includes(selector.slice(1)):n.tagName===selector)||null;}
 removeAttribute(key){delete this.attrs[key];}
 cloneNode(deep){const copy=new ExportNode(this.tagName);copy.attrs={...this.attrs};copy.textContent=this.textContent;copy.className=this.className;copy.dataset={...this.dataset};if(deep)copy.append(...this.children.map(c=>c.cloneNode(true)));return copy;}
 remove(){this.removed=true;}
}
export function exportFixture(){
 const f=matchBoardDocument('/haftanin-ilk-11i'),urls=new Map(),created=[],revoked=[],draws=[],downloads=[],timers=new Map();let urlId=0,timerId=0;
 const options={imageFailure:false,encodeFailure:false};
 f.document.createElement=f.document.createElementNS=(_ns,tag)=>{
  const n=new ExportNode(tag||_ns);
  if(n.tagName==='canvas'){
   const ctx={font:'',measureText:s=>({width:Array.from(s).length*9}),drawImage:(...args)=>draws.push({canvas:n,args})};n.getContext=()=>ctx;
   n.toBlob=(cb,type)=>{n.encodedType=type;cb(options.encodeFailure?null:new Blob(['test png'],{type}));};
  }
  if(n.tagName==='a')n.click=()=>downloads.push({filename:n.download,url:n.href});
  return n;
 };
 f.document.body=new ExportNode('body');f.document.documentElement=new ExportNode('html');f.document.fonts={ready:Promise.resolve()};
 const palette={'--bg-page':'#101713','--text-primary':'#edf3e9','--text-secondary':'#b6c5af','--border':'#52634f'};
 f.window.getComputedStyle=()=>({getPropertyValue:key=>palette[key]});f.window.Blob=Blob;f.window.XMLSerializer=class{serializeToString(node){return serialize(node);}};
 f.window.Image=class{set src(url){this.url=url;queueMicrotask(()=>options.imageFailure?this.onerror?.():this.onload?.());}};
 f.window.URL={createObjectURL:blob=>{const url='blob:fixture/'+ ++urlId;urls.set(url,blob);created.push(blob);return url;},revokeObjectURL:url=>{revoked.push(url);urls.delete(url);}};
 f.window.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};f.window.clearTimeout=id=>timers.delete(id);
 const flushTimers=()=>{for(const [id,fn]of timers){timers.delete(id);fn();}};
 const root=new ExportNode('main'),trigger=new ExportNode('button');root.append(trigger);
 return {...f,root,trigger,urls,created,revoked,draws,downloads,timers,flushTimers,options,palette};
}
