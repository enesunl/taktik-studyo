import {mountBoardTacticalTools,drawingStrokes} from '../../src/lib/board-tactical-tools.js';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {legacyRosterScript} from './legacy-shape-roster.cjs';
export class Element{
 constructor(){this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){},remove(){},toggle(){}};this.value='';this.listeners={};this.handlers=new Map();this.nodes={};this.offsetHeight=84;}
 append(...args){this.children.push(...args)}replaceChildren(...args){this.children=args}setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}addEventListener(k,fn){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(fn);this.listeners[k]=(...args)=>{for(const f of [...this.handlers.get(k)])f(...args);};}removeEventListener(k,fn){this.handlers.get(k)?.delete(fn);if(!this.handlers.get(k)?.size)delete this.listeners[k];}querySelector(q){if(q.startsWith('.')){const find=n=>{if(n.className===q.slice(1))return n;for(const c of n.children){const found=find(c);if(found)return found;}};const found=find(this);if(found)return found;}return this.nodes[q]??=new Element()}querySelectorAll(){return []}getBoundingClientRect(){return {left:0,top:0,width:400,height:520}}focus(){}getContext(){return this.ctx??={setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}}}setPointerCapture(){}showModal(){this.open=true}close(){this.open=false}before(node){this.placeholder=node;node.origin=this}replaceWith(node){this.replacement=node}cloneNode(){return new Element()}remove(){this.removed=true}
}

export const control=(root,id)=>root.querySelector('[data-control="'+id+'"]');
export function classicFixture({canonical=false}={}){
 const document={body:{dataset:{page:'comparison'},style:{overflow:''},append(){}},createElement:()=>new Element(),createElementNS:()=>new Element(),createComment:()=>new Element(),documentElement:new Element(),querySelectorAll:()=>[],addEventListener(){}};
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){},scrollBy(){},innerHeight:900},document,setTimeout(){},clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},URLSearchParams});
 // Legacy (rollback-only) mode gets BSD-derived legacy-shape rosters; dist/rosters.js no longer exists.
 if(!canonical)vm.runInContext(legacyRosterScript(),context);
 vm.runInContext(readFileSync(new URL('../../dist/app.js',import.meta.url),'utf8'),context);
 return {context,create:(options={})=>{const root=new Element(),board=context.window.createTacticsBoard(root,{...(options.tacticalWorkspace?{tacticalTools:{mount:mountBoardTacticalTools,strokes:drawingStrokes}}:{}),...options});return {root,board};}};
}
