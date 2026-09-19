'use strict';
window.TAKTIK_COMPARISON={mount(scope){
 const cleanups=[];
 const template=document.getElementById('boardTemplate');
 const params=new URLSearchParams(location.search);
 const boardApis={};
 for(const side of ['left','right']){
  const mount=document.getElementById(side+'Board');
  const fragment=template.content.cloneNode(true);
  for(const element of fragment.querySelectorAll('[id]')){
   const original=element.id;element.dataset.control=original;element.id=side+'-'+original;
  }
  mount.append(fragment);
  const teamSelect=document.getElementById(side+'Team');
  const formationSelect=document.getElementById(side+'Formation');
  const sync=(state)=>{
   if(teamSelect.options.length)teamSelect.value=typeof state.team==='string'?state.team:state.team.name;
   if(!Array.from(formationSelect.options).some(option=>option.value===state.formation)){
    const option=document.createElement('option');option.value=state.formation;option.textContent=state.formation;formationSelect.append(option);
   }
   formationSelect.value=state.formation;
  };
  const team=side==='left'?(params.get('sol')||'Galatasaray'):'Fenerbahçe';
  const api=window.createTacticsBoard(mount,{team,onChange:sync,draftContext:scope.context(side)});
  boardApis[side]=api;
  teamSelect.replaceChildren();
  for(const t of api.getTeams()){
   const option=document.createElement('option');option.value=t.name;option.textContent=t.name;teamSelect.append(option);
  }
  formationSelect.replaceChildren();
  for(const shape of api.getFormations()){
   const option=document.createElement('option');option.value=shape;option.textContent=shape;formationSelect.append(option);
  }
  sync(api.getState());
  const changeTeam=()=>api.selectTeam(teamSelect.value),changeFormation=()=>api.applyFormation(formationSelect.value);
  teamSelect.addEventListener('change',changeTeam);
  formationSelect.addEventListener('change',changeFormation);
  cleanups.push(()=>{teamSelect.removeEventListener('change',changeTeam);formationSelect.removeEventListener('change',changeFormation);api.dispose();teamSelect.replaceChildren();formationSelect.replaceChildren();});
 }
 // Each editor owns its player selection, squad, formation, colors and undo history.
 return ()=>{for(const cleanup of cleanups)cleanup();};
}};
