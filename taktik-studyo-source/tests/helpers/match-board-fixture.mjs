import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {MatchNode,matchesDocument,matchesWindow} from './matches-fixture.mjs';

export class BoardNode extends MatchNode {
  constructor(tag){
    super(tag);this.offsetWidth=78;this.offsetHeight=78;
    this.classList={add:name=>this.toggle(name,true),remove:name=>this.toggle(name,false),toggle:(name,on)=>this.toggle(name,on)};
  }
  toggle(name,on){const values=new Set((this.className||'').split(' ').filter(Boolean));on?values.add(name):values.delete(name);this.className=[...values].join(' ');}
  set innerHTML(value){
    if(!value.startsWith('<svg viewBox="0 0 64 64" aria-hidden="true"'))throw Error('Unsafe HTML');this.markup=value;
    const svg=new BoardNode('svg');svg.setAttribute('viewBox','0 0 64 64');
    for(const match of value.matchAll(/<path\s+([^>]+)\/>/g)){const path=new BoardNode('path');for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g))path.setAttribute(attr[1],attr[2]);svg.append(path);}this.replaceChildren(svg);
  }
  querySelector(selector){const walk=n=>n.children.flatMap(c=>[c,...walk(c)]);return walk(this).find(n=>selector.startsWith('.')?(n.className||n.attrs.class||'').split(' ').includes(selector.slice(1)):n.tagName===selector)||null;}
  removeAttribute(key){delete this.attrs[key];}
  cloneNode(deep){const copy=new BoardNode(this.tagName);copy.attrs={...this.attrs};copy.textContent=this.textContent;copy.className=this.className;if(deep)copy.append(...this.children.map(c=>c.cloneNode(true)));return copy;}
  getContext(){return {font:'',measureText:s=>({width:Array.from(s).length*6})};}
  get innerHTML(){return this.markup;}
  getBoundingClientRect(){return {left:30,top:100,width:1000,height:625};}
  setPointerCapture(id){this.capture=id;}
  releasePointerCapture(){this.capture=null;}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
export function matchBoardDocument(path='/mac-studyosu?id=215997&hafta=6') {
  const dom=matchesDocument(),win=matchesWindow(path);
  win.window.crypto=webcrypto;
  const events=new MatchNode();dom.document.listeners=events.listeners;
  dom.document.addEventListener=events.addEventListener.bind(events);dom.document.removeEventListener=events.removeEventListener.bind(events);
  dom.document.createElement=tag=>new BoardNode(tag);dom.document.createElementNS=(_ns,tag)=>new BoardNode(tag);
  dom.nodes.matchStudioContent=new BoardNode();dom.nodes.matchDetailContent=new BoardNode();
  const context=vm.createContext({window:win.window,document:dom.document});
  vm.runInContext(readFileSync(new URL('../../dist/app.js',import.meta.url),'utf8'),context);
  return {...dom,...win,utils:win.window.TAKTIK_BOARD_UTILS};
}
export function fire(node,type,extra={}) {
  const event={type,currentTarget:node,button:0,pointerId:1,clientX:100,clientY:100,preventDefault(){},...extra};
  for(const listener of [...(node.listeners.get(type)||[])])listener(event);
}
