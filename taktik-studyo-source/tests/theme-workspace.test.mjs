import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,readdirSync} from 'node:fs';
import {PITCH_COLOR_KEY,DEFAULT_PITCH_COLOR,createPitchPreference,pitchMarkings} from '../src/lib/pitch-preference.js';
import {mountMatchStudio} from '../src/lib/match-studio-ui.js';
import {detail} from './helpers/match-detail-fixture.mjs';
import {matchBoardDocument,fire} from './helpers/match-board-fixture.mjs';
import {allNodes} from './helpers/matches-fixture.mjs';

const script=readFileSync(new URL('../dist/theme.js',import.meta.url),'utf8');
function theme({saved=null,dark=false,blocked=false,noMedia=false,store=new Map()}={}){
  if(saved!==null)store.set('taktik:theme:v1',saved);
  const handlers={},mediaHandlers={},windowHandlers={},buttons=[0,1].map(()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},addEventListener(_type,cb){this.click=cb;}}));
  const document={documentElement:{dataset:{},style:{}},querySelectorAll:()=>buttons,addEventListener:(type,cb)=>{handlers[type]=cb;}};
  const storage={getItem(k){if(blocked)throw Error();return store.get(k)||null;},setItem(k,v){if(blocked)throw Error();store.set(k,v);}};
  const media={matches:dark,addEventListener:(type,cb)=>{mediaHandlers[type]=cb;}};
  let network=0;
  vm.runInNewContext(script,{document,localStorage:storage,matchMedia:()=>{if(noMedia)throw Error();return media;},window:{addEventListener:(type,cb)=>{windowHandlers[type]=cb;}},fetch:()=>{network++;throw Error('No network');}});
  return {document,buttons,store,media,network:()=>network,current:()=>document.documentElement.dataset.theme,ready:()=>handlers.DOMContentLoaded(),system(value){media.matches=value;mediaHandlers.change?.();},storage(value){windowHandlers.storage({key:'taktik:theme:v1',newValue:value});}};
}
for(const [saved,dark,expected]of [[null,false,'light'],[null,true,'dark'],['light',true,'light'],['dark',false,'dark'],['invalid',true,'dark'],['DARK',false,'light']])test('theme precedence '+JSON.stringify({saved,dark}),()=>{
  const f=theme({saved,dark});assert.equal(f.current(),expected);assert.equal(f.document.documentElement.style.colorScheme,expected);f.ready();assert.equal(f.buttons[0].attrs['aria-pressed'],String(expected==='dark'));
});
test('theme toggles both ways, syncs all header controls and persists across page reloads without network',()=>{
  const f=theme();f.ready();f.buttons[0].click();assert.equal(f.current(),'dark');assert.equal(f.store.get('taktik:theme:v1'),'dark');assert.equal(f.buttons[1].attrs['aria-pressed'],'true');
  const next=theme({store:f.store});assert.equal(next.current(),'dark');next.ready();next.buttons[1].click();assert.equal(next.current(),'light');assert.equal(f.network()+next.network(),0);
});
test('system changes follow only without explicit choice; cross-tab values are validated',()=>{
  const f=theme();f.ready();f.system(true);assert.equal(f.current(),'dark');f.buttons[0].click();f.system(true);assert.equal(f.current(),'light');
  f.storage('dark');assert.equal(f.current(),'dark');f.system(false);assert.equal(f.current(),'dark');f.storage('garbage');assert.equal(f.current(),'light');f.system(true);assert.equal(f.current(),'dark');
});
test('blocked storage and missing media query cannot block initialization/toggle',()=>{
  const f=theme({blocked:true,noMedia:true});assert.equal(f.current(),'light');f.ready();f.buttons[0].click();assert.equal(f.current(),'dark');assert.equal(f.network(),0);
});
test('every HTML entry includes synchronous pre-CSS theme init, shared tokens and a labeled native toggle',()=>{
  const files=readdirSync(new URL('../dist/',import.meta.url)).filter(f=>f.endsWith('.html'));assert.equal(files.length,13);
  for(const file of files){
    const html=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8'),head=html.split('</head>')[0];
    assert.equal((head.match(/src="theme.js"/g)||[]).length,1,file);assert.match(head,/<script src="theme.js"><\/script>/);
    assert.ok(head.indexOf('src="theme.js"')<head.indexOf('rel="stylesheet"'),file);assert.match(head,/href="theme.css"/);assert.match(html,/type="button" class="theme-toggle" data-theme-toggle aria-label="[^"]+" aria-pressed="false"/);
    assert.doesNotMatch(html,/Renk temas\?/,file);
    if(head.includes('no-referrer'))assert.ok(head.indexOf('no-referrer')<head.indexOf('src="theme.js"'));
  }
  const index=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.match(index.split('id="sharedViewer"')[1],/data-theme-toggle/);
  assert.doesNotMatch(script,/supabase|fetch\(|token_hash|location\.|sessionStorage|innerHTML/);
});
function luminance(color){const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('shared theme text and selected controls have readable contrast; theme never defines jersey/pitch/drawing colors',()=>{
  const css=readFileSync(new URL('../dist/theme.css',import.meta.url),'utf8');
  for(const rule of [css.match(/:root\{([^}]+)/)[1],css.match(/:root\[data-theme=dark\]\{([^}]+)/)[1]]){
    const tokens=Object.fromEntries([...rule.matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map(m=>[m[1],m[2]]));
    for(const surface of ['bg-page','bg-elevated'])for(const text of ['text-primary','text-secondary'])assert.ok(contrast(tokens[text],tokens[surface])>=4.5,text+' '+surface);
    assert.ok(contrast(tokens['selected-text'],tokens['selected-bg'])>=4.5);assert.ok(contrast(tokens['action-text'],tokens['action-bg'])>=4.5);
  }
  assert.doesNotMatch(css,/--(?:team2?|jersey-number|match-pitch-background|drawing-color):|filter:\s*invert/);
});
const storage=()=>{const values=new Map(),access=[];return{values,access,getItem(k){access.push(k);return values.get(k)||null;},setItem(k,v){access.push(k);values.set(k,v);},removeItem(k){access.push(k);values.delete(k);}};};
test('pitch starts original green, persists exact hex, restores and resets independently',()=>{
  const s=storage();let state;const p=createPitchPreference({getStorage:()=>s,onChange:v=>{state=v;}});assert.equal(p.get(),DEFAULT_PITCH_COLOR);assert.equal(state.isDefault,true);
  assert.equal(p.set('#AB12CD'),true);assert.equal(p.get(),'#ab12cd');assert.equal(s.values.get(PITCH_COLOR_KEY),'#ab12cd');assert.equal(state.isDefault,false);
  assert.equal(createPitchPreference({getStorage:()=>s}).get(),'#ab12cd');p.reset();assert.equal(p.get(),DEFAULT_PITCH_COLOR);assert.equal(s.values.has(PITCH_COLOR_KEY),false);assert.ok(s.access.every(k=>[PITCH_COLOR_KEY,'taktik:match-studio:pitch-size:v1','taktik:match-studio:sidebar:v1'].includes(k)));
});
test('invalid saved/new pitch colors and unavailable storage fail safely',()=>{
  for(const value of ['white','#fff','red;url(x)','#12345678','#12345g','<svg>','']){const s=storage();s.values.set(PITCH_COLOR_KEY,value);const p=createPitchPreference({getStorage:()=>s});assert.equal(p.get(),DEFAULT_PITCH_COLOR);assert.equal(p.set(value),false);}
  const p=createPitchPreference({getStorage(){throw Error();}});p.set('#ffffff');assert.equal(p.get(),'#ffffff');p.reset();assert.equal(p.get(),DEFAULT_PITCH_COLOR);
});
test('pitch markings choose max WCAG contrast for all sampled RGB colors, including light/dark extremes',()=>{
  assert.equal(pitchMarkings('#ffffff'),'#000000');assert.equal(pitchMarkings('#ffff00'),'#000000');assert.equal(pitchMarkings('#000000'),'#ffffff');assert.equal(pitchMarkings('#000080'),'#ffffff');
  for(let r=0;r<256;r+=32)for(let g=0;g<256;g+=32)for(let b=0;b<256;b+=32){const c='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');assert.ok(contrast(c,pitchMarkings(c))>=4.5);}
});
test('workspace has one persistent sidebar, compact identity, no scoreboard; color leaves drawings and source unchanged',async()=>{
  const f=matchBoardDocument(),window=Object.create(f.window),s=storage(),full=detail(),source=JSON.stringify(full);Object.defineProperty(window,'localStorage',{value:s});let requests=0;
  const page=mountMatchStudio({document:f.document,window,current:()=>true,api:{load:async()=>{requests++;return{ok:true,match:full};}}});await page.ready;
  const root=f.nodes.matchStudioContent,nodes=allNodes(root),find=cls=>nodes.find(n=>n.className===cls),pitch=find('match-pitch');
  assert.ok(find('match-studio-topbar'));assert.ok(find('match-editor-workspace'));assert.ok(find('match-workspace-stage'));assert.equal(nodes.filter(n=>n.className==='match-tactical-host').length,1);
  assert.equal(nodes.filter(n=>n.dataset.tool).length,8);assert.equal(find('match-tactical-trigger'),undefined);assert.equal(find('match-studio-summary'),undefined);assert.equal(find('match-studio-score'),undefined);assert.equal(find('match-scorers'),undefined);
  assert.equal(nodes.filter(n=>n.className==='match-player').length,22);assert.match(pitch.attrs['--match-pitch-background'],/repeating-linear-gradient/);
  fire(nodes.find(n=>n.dataset.tool==='line'),'click');const input=find('match-drawing-input');fire(input,'pointerdown',{clientX:230,clientY:225});fire(input,'pointerup',{clientX:630,clientY:475});
  const drawings=find('match-drawings').children[0],before=JSON.stringify(drawings.children.map(n=>n.attrs)),picker=find('match-pitch-color');
  picker.value='#ffffff';fire(picker,'input');assert.equal(pitch.attrs['--match-pitch-background'],'#ffffff');assert.equal(pitch.attrs['--match-pitch-markings'],'#000000');assert.equal(JSON.stringify(drawings.children.map(n=>n.attrs)),before);
  fire(nodes.find(n=>n.textContent==='Varsayılana Dön'),'click');assert.match(pitch.attrs['--match-pitch-background'],/repeating-linear-gradient/);assert.equal(JSON.stringify(full),source);assert.equal(requests,1);assert.ok(s.access.every(k=>[PITCH_COLOR_KEY,'taktik:match-studio:pitch-size:v1','taktik:match-studio:sidebar:v1'].includes(k)));page.dispose();
});
test('desktop workspace owns viewport, panels scroll separately and mobile uses a contained bottom row',()=>{
  const css=readFileSync(new URL('../dist/match-studio.css',import.meta.url),'utf8');assert.match(css,/height:100dvh/);assert.match(css,/grid-template-columns:204px minmax\(0,1fr\)/);assert.match(css,/grid-template-columns:176px minmax\(0,1fr\)/);
  assert.match(css,/\.match-editor-workspace>\.match-tactical-host\{[^}]*overflow-y:auto/);assert.match(css,/\.match-workspace-stage\{[^}]*overflow-y:auto/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/order:2;flex:none;max-height:160px;overflow:auto/);assert.doesNotMatch(css,/match-tactical-trigger|right:calc\(100% \+ 8px\)/);
});
