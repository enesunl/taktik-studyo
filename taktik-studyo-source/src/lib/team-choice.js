export function teamColors(team) {
  return [team?.color,team?.color2].every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)) ? [team.color,team.color2] : null;
}

export function createTeamChoice({document,team,prefix,emptyLabel='Favori takımım yok'}) {
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const slug=team?.id??null,label=el('label',prefix),input=el('input');
  input.type='radio';input.name=prefix;input.value=slug??'';
  const mark=el('span',prefix+'-color'),check=el('span',prefix+'-check');
  mark.setAttribute('aria-hidden','true');check.setAttribute('aria-hidden','true');
  const colors=teamColors(team);
  if(colors){mark.style.setProperty('--club-primary',colors[0]);mark.style.setProperty('--club-secondary',colors[1]);}
  label.append(input,mark,el('span',prefix+'-name',team?.name??emptyLabel),check);
  return {slug,label,input,check};
}

export function syncTeamChoice(choice,selected,disabled) {
  choice.input.disabled=disabled;choice.input.checked=selected===choice.slug;
  choice.check.textContent=choice.input.checked?'✓ Seçildi':'';
  choice.label.setAttribute('data-selected',String(choice.input.checked));
}
