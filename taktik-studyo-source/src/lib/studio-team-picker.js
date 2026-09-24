// Native modal dialog owns focus containment, inert background and Escape handling.
export function mountTeamPicker({document,host,catalogue,current,selected,onSelect}){
  const listeners=[],rows=[];
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const listen=(n,event,fn)=>{n.addEventListener(event,fn);listeners.push(()=>n.removeEventListener(event,fn));};
  const section=node('section',null,'match-team-tools'),heading=node('h2','Takımlar');section.append(heading);host.append(section);
  const dialog=node('dialog',null,'studio-team-dialog'),title=node('h2','Takım seç'),close=node('button','Kapat'),label=node('label','Takım ara'),search=node('input'),list=node('div',null,'studio-team-list');
  dialog.setAttribute('aria-label','Takım seç');dialog.setAttribute('aria-modal','true');close.type='button';search.type='search';search.autocomplete='off';label.append(search);dialog.append(title,close,label,list);host.append(dialog);
  let side=null,opener=null,disposed=false;
  const buttons={};
  function shut(){dialog.close();opener?.focus();}
  for(const value of ['home','away']){
    const name=selected(value),label=value==='home'?'Ev sahibi':'Deplasman';
    const button=node('button',name?label+': '+name:label+' takımı seç','match-tactical-button');button.type='button';buttons[value]=button;section.append(button);
    listen(button,'click',()=>{if(disposed||!current())return;side=value;opener=button;search.value='';title.textContent=value==='home'?'Ev sahibi takımı seç':'Deplasman takımı seç';filter();dialog.showModal();search.focus();});
  }
  for(const team of catalogue.teams){
    const button=node('button',team.name,'studio-team-option');button.type='button';button.style.setProperty('--team',team.color);button.style.setProperty('--team2',team.color2);list.append(button);rows.push({team,button});
    listen(button,'click',()=>{if(disposed||!current()||!side||button.disabled)return;if(onSelect(side,team)!==false){buttons[side].textContent=(side==='home'?'Ev sahibi: ':'Deplasman: ')+team.name;shut();}});
  }
  function filter(){const q=search.value.trim().toLocaleLowerCase('tr');for(const {team,button}of rows){button.hidden=!team.name.toLocaleLowerCase('tr').includes(q);button.disabled=selected(side==='home'?'away':'home')===team.name;}}
  listen(search,'input',filter);listen(close,'click',shut);listen(dialog,'cancel',event=>{event.preventDefault();shut();});
  return {dispose(){disposed=true;if(dialog.open)dialog.close();for(const off of listeners)off();}};
}
