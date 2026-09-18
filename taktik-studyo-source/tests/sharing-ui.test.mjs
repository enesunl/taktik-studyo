import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharingUI} from '../src/lib/sharing-ui.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.hidden=false;}
 append(...children){this.children.push(...children);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 async fire(k,event={}){return this.listeners[k]?.(event);}
 showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){this.removed=true;}focus(){}
}
function setup(){
 const body=new Element('body');globalThis.document={body,createElement:tag=>new Element(tag)};
 let options=null,resets=0,removed=0;
 globalThis.window={location:{origin:'https://taktikstudyo.com'},turnstile:{render(_el,o){options=o;return 'widget';},reset(){resets++;},remove(){removed++;}}};
 return {body,options:()=>options,resets:()=>resets,removed:()=>removed};
}
test('share UI uses a captured board snapshot, verified token and backend ID',async()=>{
 const env=setup(),trigger=new Element('button');let state={team:{name:'Original'},formation:'4-3-3'},saved;
 const backend={enabled:true,sharingReady:async()=>true,saveLineup:async(s,t)=>{saved={s,t};return '01234567-89ab-4cde-8fab-0123456789ab';}};
 createSharingUI(backend,'public-site-key').attach({getState:()=>structuredClone(state)},trigger);
 await trigger.fire('click');const dialog=env.body.children[0],save=dialog.children.find(e=>e.textContent==='Bağlantı oluştur');
 assert.equal(save.disabled,true);assert.equal(env.options().action,'share_lineup');assert.equal(env.options().sitekey,'public-site-key');
 state.team.name='Edited after dialog opened';env.options().callback('verified-token');assert.equal(save.disabled,false);
 await save.onclick();assert.equal(saved.s.team.name,'Original');assert.equal(saved.t,'verified-token');
 const result=dialog.children.find(e=>e.className==='share-result');assert.equal(result.hidden,false);assert.equal(result.children[0].value,'https://taktikstudyo.com/lineup/01234567-89ab-4cde-8fab-0123456789ab');assert.equal(env.resets(),1);
 dialog.close();assert.equal(env.removed(),1);
});
test('missing site key and expired tokens cannot submit',async()=>{
 const env=setup(),trigger=new Element('button');let writes=0;
 const backend={enabled:true,sharingReady:async()=>true,saveLineup:async()=>writes++};
 const board={getState:()=>({team:{name:'Test'},formation:'4-3-3'})};
 createSharingUI(backend,'').attach(board,trigger);await trigger.fire('click');
 let save=env.body.children[0].children.find(e=>e.textContent==='Bağlantı oluştur');await save.onclick();assert.equal(writes,0);assert.equal(env.options(),null);
 const trigger2=new Element('button');createSharingUI(backend,'public-site-key').attach(board,trigger2);await trigger2.fire('click');
 save=env.body.children[1].children.find(e=>e.textContent==='Bağlantı oluştur');env.options().callback('token');env.options()['expired-callback']();await save.onclick();assert.equal(writes,0);assert.equal(save.disabled,true);
});
