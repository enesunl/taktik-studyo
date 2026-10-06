import {resolveFavoriteTeam} from './favorite-team.js';
import {createTeamChoice,syncTeamChoice,teamColors} from './team-choice.js';

// Optional enhancement: its requests never gate the core Profile workspace.
export function mountProfileFavorite({document,root,initials,api,catalogue,current}) {
  let disposed=false,busy=false,loaded=false,editing=false,slug=null,selected=null,teams=null,choices=[];
  const off=[],viewOff=[],active=()=>!disposed&&current();
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const listen=(n,event,fn,list=off)=>{n.addEventListener(event,fn);list.push(()=>n.removeEventListener(event,fn));};
  const button=(text,fn)=>{const n=el('button',null,text);n.type='button';listen(n,'click',fn);return n;};
  const label=el('h3',null,'Futbol tercihi');
  const row=el('div','profile-favorite-row'),name=el('span','profile-favorite-name','Yükleniyor…');
  const edit=button('Takım seç →',open),remove=button('Favori takımı kaldır',()=>save(null));
  edit.setAttribute('aria-controls','profileFavoritePicker');
  row.append(el('span',null,'Favori takım'),name,edit);
  const form=el('form','profile-favorite-picker');form.id='profileFavoritePicker';form.hidden=true;
  const fieldset=el('fieldset'),legend=el('legend',null,'Favori takımını seç'),grid=el('div','profile-team-grid');fieldset.append(legend,grid);
  const actions=el('div','profile-favorite-actions'),submit=el('button',null,'Kaydet'),cancel=button('Vazgeç',close);submit.type='submit';actions.append(submit,cancel,remove);form.append(fieldset,actions);
  const status=el('p','profile-favorite-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=button('Tekrar dene',load);retry.hidden=true;
  root.replaceChildren(label,row,form,status,retry);
  function accent(team){
    const colors=teamColors(team);initials.setAttribute('data-team-accent',String(!!colors));
    initials.style.setProperty('--favorite-primary',colors?.[0]??'transparent');
    initials.style.setProperty('--favorite-secondary',colors?.[1]??'transparent');
  }
  function controls(){
    edit.disabled=busy||!loaded;edit.setAttribute('aria-expanded',String(editing));
    submit.disabled=busy||!teams||selected===undefined;cancel.disabled=remove.disabled=busy;remove.hidden=slug===null;
    retry.disabled=busy;form.setAttribute('aria-busy',String(busy));
    for(const choice of choices)syncTeamChoice(choice,selected,busy);
  }
  function render(){
    const team=resolveFavoriteTeam(slug,teams??[]);accent(team);
    name.textContent=!loaded?'Tercih yüklenemedi':slug===null?'Seçilmedi':team?.name??'Takım bilgisi yüklenemedi';
    edit.textContent=slug===null?'Takım seç →':'Değiştir →';controls();
  }
  function open(){
    if(!active()||busy||!loaded)return;editing=true;selected=slug;status.textContent='';
    for(const removeListener of viewOff.splice(0))removeListener();
    choices=(teams??[]).map(team=>createTeamChoice({document,team,prefix:'profile-team'}));
    choices.push(createTeamChoice({document,team:null,prefix:'profile-team'}));
    for(const choice of choices)listen(choice.input,'change',()=>{if(!active()||busy)return;selected=choice.slug;controls();},viewOff);
    grid.replaceChildren(...choices.map(c=>c.label));form.hidden=false;controls();
    (choices.find(c=>c.slug===selected)??choices[0]).input.focus();
  }
  function close(){if(!active()||busy)return;editing=false;form.hidden=true;controls();edit.focus();}
  async function load(){
    if(!active()||busy)return;busy=true;retry.hidden=true;status.textContent='';controls();
    const [preference,catalogueResult]=await Promise.allSettled([Promise.resolve().then(()=>api.loadPreferences()),Promise.resolve().then(()=>catalogue.loadTeams())]);
    if(!active())return;busy=false;
    loaded=preference.status==='fulfilled'&&preference.value.ok;
    if(loaded)slug=preference.value.profile?.favorite_team_slug??null;
    teams=catalogueResult.status==='fulfilled'?catalogueResult.value:null;
    if(!loaded||!teams){status.textContent='Futbol tercihi şu anda yüklenemedi. Profilini kullanmaya devam edebilirsin.';retry.hidden=false;}
    render();
    if(editing)open();
  }
  async function save(next){
    if(!active()||busy||!loaded||!editing||next===undefined)return;
    busy=true;status.textContent='Kaydediliyor…';controls();
    let result;try{result=await(next===null?api.clearFavoriteTeam():api.setFavoriteTeam(next));}catch{result={ok:false};}
    if(!active())return;busy=false;
    if(!result.ok){status.textContent='Tercihin kaydedilemedi. Tekrar dene.';controls();return;}
    slug=result.profile.favorite_team_slug;render();close();status.textContent='Futbol tercihin güncellendi.';
  }
  listen(form,'submit',event=>{event.preventDefault();return save(selected);});
  listen(form,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();close();}});
  const ready=load();
  return {ready,dispose(){if(disposed)return;disposed=true;for(const removeListener of [...off,...viewOff])removeListener();accent(null);teams=null;slug=selected=null;root.replaceChildren();}};
}
