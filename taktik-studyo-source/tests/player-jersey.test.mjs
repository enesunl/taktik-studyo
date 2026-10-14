import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(app,context);
const numberColor=context.jerseyNumberColor;

test('jersey numbers choose deterministic black or white with at least 4.5:1 contrast',()=>{
 assert.equal(numberColor('#ffffff'),'#000000');assert.equal(numberColor('#000000'),'#ffffff');
 const luminance=hex=>{
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
 };
 for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
  const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''),color=numberColor(hex),l=luminance(hex);
  assert.ok(['#000000','#ffffff'].includes(color));
  assert.ok((color==='#000000'?(l+.05)/.05:1.05/(l+.05))>=4.5,hex);
 }
 assert.equal(numberColor('invalid'),'#ffffff');
});

test('all board modes share local decorative jerseys and no image renderer',()=>{
 assert.match(app,/function createJersey\(number\)/);
 assert.match(app,/aria-hidden="true" focusable="false"/);
 assert.match(app,/label\.textContent=number\?\?/);
 assert.match(app,/createJersey\(p\.number\)/);assert.match(app,/createJersey\(athlete\.number\)/);
 assert.doesNotMatch(app,/<img\b|createElement\(['"]img['"]\)|player-face|face-fallback|\.src\s*=|photoSource|faces\//);
});

test('production tree contains no old portrait assets and roster has no remote portrait URLs',()=>{
 const dist=new URL('../dist/',import.meta.url),files=readdirSync(dist,{recursive:true}).map(String);
 assert.equal(files.filter(f=>/^faces[\\/].+/.test(f)).length,0);
 const roster=readFileSync(new URL('rosters.js',dist),'utf8');
 assert.doesNotMatch(roster,/photoSource|images\.fotmob\.com|playerimages/);
 const css=readFileSync(new URL('styles.css',dist),'utf8');
 assert.doesNotMatch(css,/player-face|face-fallback|squad-avatar|player-disc/);
 assert.match(css,/\.jersey-body\{fill:var\(--team\)/);
 assert.match(css,/\.jersey-accent\{fill:var\(--team2\)/);
});
