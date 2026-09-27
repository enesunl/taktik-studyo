import vm from 'node:vm';
import {readFileSync} from 'node:fs';
export class Element{
 constructor(){this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.classList={add(){},remove(){},toggle(){}};this.value='';this.listeners={};this.nodes={};this.offsetHeight=84;}
 append(...args){this.children.push(...args)}replaceChildren(...args){this.children=args}setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}addEventListener(k,fn){this.listeners[k]=fn}removeEventListener(k,fn){if(this.listeners[k]===fn)delete this.listeners[k]}querySelector(q){if(q.startsWith('.')){const find=n=>{if(n.className===q.slice(1))return n;for(const c of n.children){const found=find(c);if(found)return found;}};const found=find(this);if(found)return found;}return this.nodes[q]??=new Element()}querySelectorAll(){return []}getBoundingClientRect(){return {left:0,top:0,width:400,height:520}}focus(){}getContext(){return this.ctx??={setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}}}setPointerCapture(){}showModal(){this.open=true}close(){this.open=false}before(node){this.placeholder=node;node.origin=this}replaceWith(node){this.replacement=node}cloneNode(){return new Element()}remove(){this.removed=true}
}

export const control=(root,id)=>root.querySelector('[data-control="'+id+'"]');
export function classicFixture({canonical=false}={}){
 const document={body:{dataset:{page:'comparison'},style:{overflow:''},append(){}},createElement:()=>new Element(),createComment:()=>new Element(),documentElement:new Element(),querySelectorAll:()=>[],addEventListener(){}};
 const context=vm.createContext({window:{addEventListener(){},removeEventListener(){},scrollBy(){},innerHeight:900},document,setTimeout(){},clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},URLSearchParams});
 for(const name of (canonical?['app']:['rosters','app']))vm.runInContext(readFileSync(new URL('../../dist/'+name+'.js',import.meta.url),'utf8'),context);
 return {context,create:(options={})=>{const root=new Element(),board=context.window.createTacticsBoard(root,options);return {root,board};}};
}
