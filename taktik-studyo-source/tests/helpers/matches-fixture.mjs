import {normalizeEvent} from '../../supabase/functions/matches/provider.js';

export const event = (overrides = {}) => ({id:215997,league_id:11,season_id:1539,round_number:6,
  event_date:'2026-09-20T17:00:00+00:00',status:'finished',home_team_id:3380,home_team:'Amed Sportif Faaliyetler',
  away_team_id:196,away_team:'Beşiktaş JK',home_score:3,away_score:2,venue_id:3071,...overrides});
export const match = (overrides = {}) => normalizeEvent(event(overrides));
export const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve};};
export const tick = () => new Promise(r => setTimeout(r,0));

export class MatchNode {
  constructor(tag = 'div') {this.tagName = tag;this.children = [];this.listeners = new Map();this.attrs = {};this.dataset = {};this.hidden = false;this.disabled = false;this.textContent = '';this.style = {setProperty:(k,v) => {this.attrs[k]=v;}};}
  set innerHTML(value) {throw Error('Unsafe HTML');}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
  setAttribute(k,v) {this.attrs[k] = v;}
  addEventListener(event,fn) {if (!this.listeners.has(event)) this.listeners.set(event,new Set());this.listeners.get(event).add(fn);}
  removeEventListener(event,fn) {this.listeners.get(event)?.delete(fn);}
  async emit(event) {if (!this.disabled) for (const fn of this.listeners.get(event) || []) await fn({preventDefault(){}});}
}
export function matchesDocument() {
  const ids = ['protectedContent','guardStatus','guardMessage','guardRetry','guardLogin','signOut','matchesContent'];
  const nodes = Object.fromEntries(ids.map(id => [id,new MatchNode()]));
  return {nodes,document:{createElement:tag => new MatchNode(tag),getElementById:id => nodes[id]}};
}
export function matchesWindow(path = '/maclar') {
  const window = new MatchNode(), navigations = [], history = [];
  const set = path => {window.location = new URL(path,'http://localhost:4173');window.location.replace = url => navigations.push(url);};
  set(path);
  window.history = {pushState(_s,_t,url) {history.push(url);set(url);},replaceState(_s,_t,url) {set(url);}};
  Object.defineProperty(window,'localStorage',{get(){throw Error('Matches must not access draft storage');}});
  return {window,navigations,history,set};
}
export const allNodes = node => [node,...node.children.flatMap(allNodes)];
export const textOf = node => allNodes(node).map(n => n.textContent).join(' ');
