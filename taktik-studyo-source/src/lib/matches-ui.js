import {promoteFavoriteMatch} from './favorite-team.js';
import {ROUNDS,requestedRound,adjacentRound,defaultRound,matchDate,MATCH_STATUS_LABELS,staleNotice} from './matches.js';

export function mountMatches({document,window,api,current,loadFavorite,now = Date.now}) {
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
  // Shown only when the server says the displayed data is a retained copy (provider temporarily unavailable).
  const notice = node('p',undefined,'matches-stale'); notice.setAttribute('role','status'); notice.hidden = true;
  root.replaceChildren(status,retry,notice,controls,list);
  let stopped = false, busy = false, generation = 0, matches = [], selected = 1, favorite = null, loaded = false;
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
    const ordered = matches.filter(m => m.round === selected).sort((a,b) => Date.parse(a.kickoff)-Date.parse(b.kickoff) || a.id.localeCompare(b.id));
    const {matches:fixtures,favoriteMatchId}=promoteFavoriteMatch(ordered,favorite);
    list.replaceChildren(); status.textContent = fixtures.length ? '' : 'Bu hafta için maç bulunamadı.';
    let day = null, group;
    for (const match of fixtures) {
      const date = matchDate(match.kickoff);
      if (date.key !== day || match.id===favoriteMatchId) {day = date.key; group = node('section',undefined,'match-day'); group.append(node('h3',date.date)); list.append(group);}
      if(match.id===favoriteMatchId)day=null; // Keep promoted date heading separate from the chronological remainder.
      const card = node('a',undefined,'match-card'); card.dataset.matchId = match.id;
      card.href = '/mac?id='+match.id+'&hafta='+selected;
      card.setAttribute('aria-label',match.home.name+' - '+match.away.name+' maç detayını aç');
      const teams = node('div',undefined,'match-teams'), scores = node('div',undefined,'match-scores');
      for (const side of ['home','away']) {
        const team = match[side], line = node('div',undefined,'match-team'), marker = node('span',undefined,'team-marker');
        marker.setAttribute('aria-hidden','true'); marker.style.setProperty('--club-primary',team.color); marker.style.setProperty('--club-secondary',team.color2);
        line.append(marker,node('span',team.name)); teams.append(line);
        if (match.status === 'finished' || match.status === 'live') scores.append(node('span',match.score[side] === null ? '—' : String(match.score[side])));
      }
      const state = node('div',undefined,'match-state');
      if (match.status === 'upcoming') {const time = node('time',date.time); time.setAttribute('datetime',match.kickoff); state.append(time);}
      else state.append(node('span',MATCH_STATUS_LABELS[match.status]));
      if(match.id===favoriteMatchId){
        card.className+=' match-card-favorite';
        card.append(node('span','Favori takımın','match-favorite-label'));
        card.setAttribute('aria-label','Favori takımın: '+match.home.name+' - '+match.away.name+' maç detayını aç');
      }
      card.append(teams,scores,state); group.append(card);
    }
  }
  function select(round) {if (!active() || busy || round === selected) return; selected = round; urlRound(selected); render();}
  listen(previous,'click',() => select(adjacentRound(selected,-1))); listen(next,'click',() => select(adjacentRound(selected,1)));
  buttons.forEach((button,i) => listen(button,'click',() => select(i+1)));
  listen(window,'popstate',() => {if (active() && !busy) {selected = requestedRound(window.location.search) || defaultRound(matches,now()); render();}});
  async function load() {
    if (!active() || busy) return;
    loaded=false;busy = true; const turn = ++generation;
    status.textContent = 'Maçlar yükleniyor…'; retry.hidden = true; controls.hidden = true; list.replaceChildren(); notice.hidden = true;
    let result;
    try {result = await api.load();} catch {result = {ok:false};}
    if (!active() || turn !== generation) return;
    busy = false;
    if (!result.ok) {status.textContent = 'Maç verileri şu anda alınamıyor. Lütfen biraz sonra tekrar deneyin.'; retry.hidden = false; return;}
    notice.textContent = staleNotice(result.freshness); notice.hidden = !notice.textContent;
    loaded=true;matches = result.matches; selected = requestedRound(window.location.search) || defaultRound(matches,now());
    urlRound(selected,true); controls.hidden = false; render();
  }
  listen(retry,'click',load);
  function dispose() {stopped = true; generation++; listeners.forEach(off => off()); root.replaceChildren();}
  const ready=load();
  const favoriteReady=Promise.resolve().then(()=>active()?loadFavorite?.():null).catch(()=>null).then(team=>{
    if(!active())return;favorite=team??null;if(loaded&&!busy)render();
  });
  return {ready,favoriteReady,dispose};
}
