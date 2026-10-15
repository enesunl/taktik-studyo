import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// MOBILE1 regressions found in real-touch checks at 320–430 px (see the MOBILE1 report).
const dist=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');

test('Match Studio phone layout: the tool tray keeps its width so the source tools sit after it, not over it',()=>{
  const css=dist('match-studio.css'),shared=dist('tactical-tools.css');
  // tactical-tools.css lets the tray shrink (max-width:100%); inside the flex host at <=700px that put
  // "Kaynak Dizilişe Dön" on top of the drawing-tool buttons.
  assert.match(shared,/\.match-tactical-tools,\.match-tactical-tray\{min-width:0;max-width:100%\}/);
  const phone=css.match(/@media\(max-width:700px\)\{body\[data-page=match-studio\] \.match-tactical-host>\.match-tactical-tools\{([^}]*)\}/);
  assert(phone,'phone rule for the tray wrapper is missing');
  assert.match(phone[1],/flex:none/);assert.match(phone[1],/max-width:none/);
});

test('MOBILE1.1 Match Studio phone layout: label never covers tools, collapsed toggle is labelled, workspace keeps a full screen',()=>{
  const css=dist('match-studio.css');
  // The active-tool label is an ordinary first column: tool buttons can never scroll beneath it.
  const label=css.match(/\.match-tactical-tray::before\{([^}]*)\}/);assert(label);assert.doesNotMatch(label[1],/position:sticky|z-index/);
  assert.doesNotMatch(css,/::before\{[^}]*position:sticky/);
  assert.match(css,/\.sidebar-collapsed \.match-sidebar-toggle::after\{content:'Araçlar'/);
  // Header, title and notices (e.g. the local-draft banner) can no longer squeeze the pitch and tools to nothing.
  const work=css.match(/@media \(max-width:700px\),\(max-height:560px\)\{([^\n]*)\}\r?\n/);assert(work,'phone/short-screen workspace rule missing');
  assert.match(work[1],/body\[data-page=match-studio\]\{overflow-y:auto\}/);
  assert.match(work[1],/\.match-studio-shell,body\[data-page=match-studio\] \.match-studio-shell>div\{flex-shrink:0;min-height:auto\}/);
  assert.match(work[1],/\.match-editor-workspace\{flex:none;height:max\(320px,100svh\)\}/);
});

test('MOBILE1.1 navigation links get larger touch areas without moving the layout (touch devices only)',()=>{
  const css=dist('theme.css');
  const blocks=[...css.matchAll(/@media \(hover:none\) and \(pointer:coarse\)\{(.*)\}\r?$/gm)].map(m=>m[1]);
  const nav=blocks.find(b=>b.includes('.route-nav a'));assert(nav,'touch navigation rule missing');
  // Every padding is cancelled by an equal negative margin (or applies to inline links only).
  assert.match(nav,/\.route-nav a\{padding:10px 7px;margin:-10px -7px\}/);
  assert.match(nav,/\.match-studio-topbar \.match-studio-back\{margin-block:-10px\}/);
  assert.match(nav,/\.legal-links a\{padding:6px 7px;margin:-6px -7px\}/);
  assert.match(nav,/\.footnote a\{padding-block:10px\}/);
  // Desktop (mouse) rules are untouched.
  assert.doesNotMatch(css.replace(/@media \(hover:none\) and \(pointer:coarse\)\{.*\}\r?$/gm,''),/\.route-nav a\{padding/);
});

test('touch devices get 16px text fields on every page so iOS Safari does not zoom on focus',()=>{
  const css=dist('theme.css');
  const rule=css.match(/@media \(hover:none\) and \(pointer:coarse\)\{([^{]*)\{font-size:16px\}\}/);
  assert(rule,'touch 16px rule missing or media query not tokenizable (needs spaces around "and")');
  assert.match(rule[1],/^:root :is\(input:not\(\[type=checkbox\],\[type=radio\],\[type=color\],\[type=range\],\[type=file\],\[type=hidden\]/);
  assert.match(rule[1],/,select,textarea\)/);
  // ID- and deeper-scoped field rules that would otherwise win over the shared rule.
  assert.match(rule[1],/:root \.studio-controls #playerForm :is\(input,select\)/);
  assert.match(rule[1],/:root \.profile-card \.account-delete-form input/);
  assert.doesNotMatch(css,/@media\(hover:none\)and\(/);
  // Every page with a text field loads theme.css.
  for(const page of readdirSync(new URL('../dist/',import.meta.url)).filter(f=>f.endsWith('.html'))){
    const html=dist(page);
    if(/<(?:input|select|textarea)\b/.test(html)||/data-page="(?:studio|match-studio|weekly-xi|profile)"/.test(html))assert.match(html,/href="theme\.css"/,page);
  }
});
