import {LINEUP_LABELS} from './studio-lineups.js';
import {playerKey} from './player-overrides.js';
import {requestedMatchId,backToMatches,POSITION_LABELS,STAT_LABELS,INCIDENT_LABELS,incidentMinute} from './match-detail.js';
import {matchDate,MATCH_STATUS_LABELS} from './matches.js';
import {matchStudioAvailable,matchPageUrl,createLocalCatalogue,resolveStudioLineups} from './match-layout.js';
import {matchGoals,appendScorers} from './match-goals.js';

export function mountMatchDetail({document,window,api,current,playerOverrides}) {
  const root = document.getElementById('matchDetailContent');
  const node = (tag,text,className) => {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const back=node('a','← Maçlara Dön','match-back');back.href=backToMatches(window.location.search);
  const status=node('p','','matches-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=node('button','Tekrar Dene','matches-retry');retry.type='button';retry.hidden=true;
  const content=node('div',undefined,'match-center');root.replaceChildren(back,status,retry,content);
  const id=requestedMatchId(window.location.search);let stopped=false,busy=false,lastMatch=null;
  const active=()=>!stopped&&current();
  function colors(el,team){el.style.setProperty('--club-primary',team.color);el.style.setProperty('--club-secondary',team.color2);}
  function teamName(team){const el=node('div',undefined,'center-team'),marker=node('span',undefined,'team-marker');marker.setAttribute('aria-hidden','true');colors(marker,team);el.append(marker,node('strong',team.name));return el;}
  function section(title){const el=node('section',undefined,'center-section');el.append(node('h2',title));content.append(el);return el;}
  const placeholder=(el,text)=>el.append(node('p',text,'section-empty'));
  function render(match){
    lastMatch=match;content.replaceChildren();
    // Provider incidents retain their IDs/minutes/team attribution; only display fields merge.
    const effective=p=>p&&playerOverrides?playerOverrides.effective(playerKey(p.playerId??p.id,'bsd'),p):p;
    const event=e=>({...e,player:effective(e.player),incoming:effective(e.incoming),outgoing:effective(e.outgoing)});
    if(playerOverrides)match={...match,incidents:match.incidents.map(event),substitutions:match.substitutions.map(event)};
    const local=createLocalCatalogue(window),resolved=resolveStudioLineups(match,local);
    const date=matchDate(match.kickoff),header=node('section',undefined,'match-summary');
    header.setAttribute('aria-label','Maç özeti');header.append(node('p','SÜPER LİG · '+match.round+'. HAFTA','eyebrow'));
    const teams=node('div',undefined,'center-scoreboard');
    const score=['finished','live'].includes(match.status)?[match.score.home??'—',match.score.away??'—'].join(' — '):match.status==='upcoming'?date.time:'—';
    const goals=matchGoals(match),home=node('div'),away=node('div');home.append(teamName(match.home));away.append(teamName(match.away));
    if(match.status!=='upcoming'){appendScorers(document,home,goals.rows.home);appendScorers(document,away,goals.rows.away);}
    teams.append(home,node('strong',score,'center-score'),away);header.append(teams);
    const stamp=node('time',new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric',weekday:'long'}).format(new Date(match.kickoff))+' · '+date.time);
    stamp.setAttribute('datetime',match.kickoff);header.append(node('p',MATCH_STATUS_LABELS[match.status],'center-status'),stamp);
    if(match.venue)header.append(node('p',match.venue,'center-venue'));
    const entry=node('div',undefined,'match-studio-entry'),available=matchStudioAvailable(match,local);
    const button=node(available?'a':'button','Maçı Stüdyoda Aç');
    if(available)button.href=matchPageUrl('/mac-studyosu',window.location.search);
    else{button.type='button';button.disabled=true;button.setAttribute('aria-describedby','matchStudioUnavailable');}
    entry.append(button);
    if(!available){const note=node('span','Kadrolar açıklandığında kullanılabilir');note.id='matchStudioUnavailable';entry.append(note);}
    if(match.status==='upcoming'&&Object.values(resolved).some(t=>t&&t.lineupKind!=='confirmed'))header.append(node('p','Muhtemel 11','center-status'));
    header.append(entry);content.append(header);

    const stats=section('İstatistikler');
    const legend=node('div',undefined,'stats-teams');legend.append(node('span',match.home.name),node('span',match.away.name));stats.append(legend);
    if(!match.statistics)placeholder(stats,match.availability.stats==='error'?'Maç istatistikleri şu anda alınamıyor.':'Maç istatistikleri henüz mevcut değil.');
    else for(const [key,label] of Object.entries(STAT_LABELS)){
      const values=match.statistics[key];if(!values)continue;
      const row=node('div',undefined,'stat-row');
      const format=v=>v===null?'—':new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(v)+(key==='possession'?'%':'');
      const line=node('div',undefined,'stat-values');line.append(node('strong',format(values.home)),node('span',label+(key==='xg'&&values.estimated?' · tahmini':'')),node('strong',format(values.away)));row.append(line);
      if(values.home!==null&&values.away!==null&&values.home+values.away>0){
        const bar=node('div',undefined,'stat-bar'),home=node('span'),away=node('span');bar.setAttribute('aria-hidden','true');
        home.style.setProperty('width',(values.home/(values.home+values.away)*100)+'%');away.style.setProperty('flex','1');
        home.style.setProperty('background-color',match.home.color);away.style.setProperty('background-color',match.away.color);bar.append(home,away);row.append(bar);
      }
      stats.append(row);
    }
    const displayLineups=match.status==='upcoming'&&Object.values(resolved).some(Boolean)?resolved:match.lineups;
    const lineups=section('Kadrolar');
    if(!displayLineups)placeholder(lineups,match.availability.lineups==='error'?'Kadrolar şu anda alınamıyor.':'Kadrolar henüz açıklanmadı.');
    else {
      lineups.append(node('p',match.lineups?.status==='confirmed'?'Onaylanmış kadrolar':match.lineups?.status==='predicted'?'Tahmini kadrolar · Henüz onaylanmadı':'Kadro onayı belirtilmedi','section-note'));
      const columns=node('div',undefined,'center-columns');
      for(const side of ['home','away']){
        const team=match[side],data=displayLineups[side],column=node('section',undefined,'lineup-column');colors(column,team);
        column.append(node('h3',team.name),node('p',data?.formation||'—','center-formation'));
        if(data?.lineupKind)column.append(node('p',LINEUP_LABELS[data.lineupKind],'section-note'));
        if(!data)placeholder(column,'Kadrolar henüz açıklanmadı.');
        else for(const [key,label] of [['starters','İlk 11'],['substitutes','Yedekler']]){
          column.append(node('h4',key==='starters'&&data.lineupKind&&data.lineupKind!=='confirmed'?'Muhtemel 11':label));const list=node('ul',undefined,'lineup-list');
          for(const raw of data[key]){const player=playerOverrides?playerOverrides.effective(playerKey(raw.playerId??raw.id,data.lineupKind==='probable-local'?'local':'bsd'),raw):raw;const row=node('li',undefined,'lineup-player');row.dataset.playerId=player.id;
            row.append(node('span',player.number===null?'—':String(player.number),'lineup-number'),node('span',player.name),node('span',POSITION_LABELS[player.position],'lineup-position'));list.append(row);}
          if(!data[key].length)placeholder(column,'Oyuncu bilgisi mevcut değil.');else column.append(list);
        }
        columns.append(column);
      }
      lineups.append(columns);
    }
    const substitutions=section('Oyuncu değişiklikleri');
    if(!match.substitutions.length)placeholder(substitutions,match.availability.incidents==='error'?'Oyuncu değişiklikleri şu anda alınamıyor.':'Oyuncu değişikliği bilgisi henüz mevcut değil.');
    else {
      const columns=node('div',undefined,'center-columns');
      for(const side of ['home','away',null]){
        const events=match.substitutions.filter(e=>e.side===side);if(!events.length)continue;
        const column=node('section'),list=node('ol',undefined,'substitution-list');column.append(node('h3',side?match[side].name:'Takım belirtilmedi'));
        for(const event of events){const item=node('li');item.append(node('strong',incidentMinute(event)),node('p','Çıkan ↓ '+(event.outgoing?.name||'Oyuncu belirtilmedi')),node('p','Giren ↑ '+(event.incoming?.name||'Oyuncu belirtilmedi')));list.append(item);}
        column.append(list);columns.append(column);
      }
      substitutions.append(columns);
    }
    const timeline=section('Maç olayları');
    if(!match.incidents.length)placeholder(timeline,match.availability.incidents==='error'?'Maç olayları şu anda alınamıyor.':match.status==='upcoming'?'Maç olayları maç başladıktan sonra burada görünecek.':'Maç olayı bilgisi mevcut değil.');
    else {
      const list=node('ol',undefined,'incident-list');
      for(const event of match.incidents){const item=node('li'),body=node('div');
        item.append(node('strong',incidentMinute(event),'incident-minute'));
        body.append(node('strong',INCIDENT_LABELS[event.type]+(event.rescinded?' · İptal edildi':'')));
        if(event.type==='substitution')body.append(node('p',(event.outgoing?.name||'—')+' ↓ / '+(event.incoming?.name||'—')+' ↑'));
        else if(event.player.name)body.append(node('p',event.player.name));
        if(event.side)body.append(node('span',match[event.side].name,'incident-team'));
        item.append(body);list.append(item);
      }
      timeline.append(list);
    }
  }
  async function load(){
    if(!active()||busy)return;
    if(!id){status.textContent='Maç bulunamadı. Geçerli bir maç seç.';return;}
    busy=true;lastMatch=null;retry.hidden=true;content.replaceChildren();status.textContent='Maç bilgileri yükleniyor…';
    let result;try{result=await api.load(id);}catch{result={ok:false};}
    if(!active())return;busy=false;
    if(!result.ok){const code=result.error?.code;status.textContent=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code)?'Maç bulunamadı.':code==='UNAUTHORIZED'?'Oturum doğrulanamadı. Giriş yapıp tekrar dene.':'Maç bilgileri şu anda alınamıyor.';retry.hidden=['INVALID_MATCH_ID','MATCH_NOT_FOUND'].includes(code);return;}
    status.textContent='';render(result.match);
  }
  retry.addEventListener('click',load);
  const off=playerOverrides?.subscribe(()=>{if(active()&&!busy&&lastMatch)render(lastMatch);})||(()=>{});
  return {ready:load(),dispose(){stopped=true;off();retry.removeEventListener('click',load);root.replaceChildren();}};
}
