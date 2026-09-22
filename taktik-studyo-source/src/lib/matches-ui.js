import {ROUNDS,requestedRound,adjacentRound,defaultRound,matchDate} from './matches.js';

export function mountMatches({document,window,api,current,now = Date.now}) {
  const root = document.getElementById('matchesContent');
  const node = (tag,text,className) => {const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el;};
  const status = node('p','','matches-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const retry = node('button','Tekrar Dene','matches-retry'); retry.type = 'button'; retry.hidden = true;
  const controls = node('section',undefined,'round-controls'); controls.setAttribute('aria-label','Hafta seçimi'); controls.hidden = true;
  const heading = node('div',undefined,'round-heading'), previous = node('button','←'), title = node('h2'), next = node('button','→');
  previous.type = next.type = 'button'; previous.setAttribute('aria-label','Önceki hafta'); next.setAttribute('aria-label','Sonraki hafta');
  heading.append(previous,title,next);
  const weeks = node('div',undefined,'round-weeks');
  const buttons = ROUNDS.map(round => {const button = node('button',String(round)); button.type = 'button'; button.setAttribute('aria-label',round+'. hafta'); weeks.append(button); return button;});
  controls.append(heading,weeks);
  const list = node('div',undefined,'matches-list');
  root.replaceChildren(status,retry,controls,list);
  let stopped = false, busy = false, generation = 0, matches = [], selected = 1;
  const active = () => !stopped && current();
  const listeners = [];
  function listen(target,event,fn) {target.addEventListener(event,fn); listeners.push(() => target.removeEventListener(event,fn));}
  function urlRound(round,replace = false) {
    const url = new URL(window.location.href); url.searchParams.delete('hafta'); url.searchParams.set('hafta',String(round));
    window.history[replace ? 'replaceState' : 'pushState'](null,'',url.pathname+url.search+url.hash);
  }
  function render() {
    if (!active()) return;
    title.textContent = selected+'. hafta'; previous.disabled = selected === 1; next.disabled = selected === 34;
    buttons.forEach((button,i) => button.setAttribute('aria-pressed',String(i+1 === selected)));
    const fixtures = matches.filter(m => m.round === selected).sort((a,b) => Date.parse(a.kickoff)-Date.parse(b.kickoff) || a.id.localeCompare(b.id));
    list.replaceChildren(); status.textContent = fixtures.length ? '' : 'Bu hafta için maç bulunamadı.';
    let day = null, group;
    for (const match of fixtures) {
      const date = matchDate(match.kickoff);
      if (date.key !== day) {day = date.key; group = node('section',undefined,'match-day'); group.append(node('h3',date.date)); list.append(group);}
      const card = node('article',undefined,'match-card'); card.dataset.matchId = match.id;
      const teams = node('div',undefined,'match-teams'), scores = node('div',undefined,'match-scores');
      for (const side of ['home','away']) {
        const team = match[side], line = node('div',undefined,'match-team'), marker = node('span',undefined,'team-marker');
        marker.setAttribute('aria-hidden','true'); marker.style.setProperty('--club-primary',team.color); marker.style.setProperty('--club-secondary',team.color2);
        line.append(marker,node('span',team.name)); teams.append(line);
        if (match.status === 'finished' || match.status === 'live') scores.append(node('span',match.score[side] === null ? '—' : String(match.score[side])));
      }
      const labels = {finished:'MS',live:'Canlı',postponed:'Ertelendi',cancelled:'İptal',unknown:'Durum bekleniyor'};
      const state = node('div',undefined,'match-state');
      if (match.status === 'upcoming') {const time = node('time',date.time); time.setAttribute('datetime',match.kickoff); state.append(time);}
      else state.append(node('span',labels[match.status]));
      card.append(teams,scores,state); group.append(card);
    }
  }
  function select(round) {if (!active() || busy || round === selected) return; selected = round; urlRound(selected); render();}
  listen(previous,'click',() => select(adjacentRound(selected,-1))); listen(next,'click',() => select(adjacentRound(selected,1)));
  buttons.forEach((button,i) => listen(button,'click',() => select(i+1)));
  listen(window,'popstate',() => {if (active() && !busy) {selected = requestedRound(window.location.search) || defaultRound(matches,now()); render();}});
  async function load() {
    if (!active() || busy) return;
    busy = true; const turn = ++generation;
    status.textContent = 'Maçlar yükleniyor…'; retry.hidden = true; controls.hidden = true; list.replaceChildren();
    let result;
    try {result = await api.load();} catch {result = {ok:false};}
    if (!active() || turn !== generation) return;
    busy = false;
    if (!result.ok) {status.textContent = 'Maç verileri şu anda alınamıyor. Lütfen biraz sonra tekrar deneyin.'; retry.hidden = false; return;}
    matches = result.matches; selected = requestedRound(window.location.search) || defaultRound(matches,now());
    urlRound(selected,true); controls.hidden = false; render();
  }
  listen(retry,'click',load);
  function dispose() {stopped = true; generation++; listeners.forEach(off => off()); root.replaceChildren();}
  return {ready:load(),dispose};
}
