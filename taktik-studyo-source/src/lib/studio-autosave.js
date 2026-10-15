import {projectTitle,projectIdValid,normalizeStudioProjectSnapshot} from './studio-project-snapshot.js';
export const SAVE_DELAY=2000;
export const autosaveKey=userId=>'taktik:studio:autosave:'+userId+':v1';
const signature=(title,snapshot)=>JSON.stringify({title,snapshot});
export const defaultProjectTitle=s=>s?.teams.home&&s?.teams.away?projectTitle(s.teams.home.name+' - '+s.teams.away.name)||'İsimsiz çalışma':'İsimsiz çalışma';

export function createStudioAutosave({api,current,capture,project=null,newId,storage,userId,recovery,onState=()=>{},onSaved=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,restored=null}){
  let snapshot=capture(),title=restored?.title||project?.title||defaultProjectTitle(snapshot),titleTouched=!!project||!!restored;
  let id=restored?.id||project?.id||newId(),revision=restored?restored.revision:project?.revision??null;
  let saved=restored?'':signature(title,snapshot),status=restored?'dirty':project?'saved':'new',auto=true,timer=null,flight=null,stopped=false,conflict=false,manualQueued=false;
  let recoveryOk=true,error=null;
  try{auto=storage?.getItem(autosaveKey(userId))!=='off';}catch{}
  const active=()=>!stopped&&current(),dirty=()=>signature(title,snapshot)!==saved;
  const state=()=>({id,revision,title,status,dirty:dirty(),saving:!!flight,autosave:auto,conflict,recoveryOk,error:status==='error'?error:null});
  const publish=()=>{if(active())onState(state());};
  function backup(){if(!snapshot)return;recoveryOk=recovery?.write({id,revision,title,snapshot})!==false;}
  function cancel(){if(timer!==null)clearTimer(timer);timer=null;}
  function schedule(){cancel();if(active()&&auto&&dirty()&&!flight&&!conflict&&status!=='error')timer=setTimer(()=>{timer=null;void save();},SAVE_DELAY);}
  function changed(){
    if(!active())return;const next=capture();if(!next){status='error';publish();return;}
    const before=signature(title,snapshot);snapshot=next;if(!titleTouched)title=defaultProjectTitle(snapshot);
    if(signature(title,snapshot)===before)return;
    if(dirty()||flight)backup();else recovery?.clear();
    if(!flight&&!conflict)status=dirty()?'dirty':revision?'saved':'new';schedule();publish();
  }
  function rename(value){if(!active())return;titleTouched=true;if(value===title)return;title=value;backup();if(!flight&&!conflict)status='dirty';schedule();publish();}
  async function save({copy=false,manual=false}={}){
    if(!active())return {ok:false,error:{code:'state_changed'}};
    if(flight){if(manual)manualQueued=true;return flight;}
    cancel();if(conflict&&!copy)return {ok:false,error:{code:'conflict'}};
    const normalizedTitle=projectTitle(title);if(!normalizedTitle||!snapshot){status='error';publish();return {ok:false,error:{code:'invalid_form'}};}
    if(!dirty()&&revision&&!copy)return {ok:true};
    if(copy){id=newId();revision=null;title=[...normalizedTitle].slice(0,112).join('')+' - Kopya';conflict=false;}
    else title=normalizedTitle;
    const sent={id,revision,title,snapshot},sentSignature=signature(title,snapshot);backup();status='saving';
    flight=Promise.resolve().then(()=>{
      if(!active())return {ok:false,error:{code:'state_changed'}};
      return revision===null?api.createProject(sent):api.updateProject(sent);
    }).catch(()=>({ok:false,error:{code:'project_request_failed'}}));publish();
    const result=await flight;flight=null;
    if(!active())return result;
    if(result.ok){revision=result.project.revision;saved=sentSignature;status=dirty()?'dirty':'saved';if(dirty())backup();else recovery?.clear();onSaved({id,revision});}
    else{conflict=result.error?.code==='conflict';status=conflict?'conflict':'error';error=result.error?.code||null;backup();}
    const queued=manualQueued;manualQueued=false;publish();
    if(result.ok&&dirty()){if(queued)void save({manual:true});else schedule();}
    return result;
  }
  if(restored)backup();schedule();publish();
  return Object.freeze({changed,rename,save,getState:state,
    setAutosave(value){if(!active())return;auto=!!value;try{storage?.setItem(autosaveKey(userId),auto?'on':'off');}catch{}schedule();publish();},
    dispose(){if(stopped)return;stopped=true;cancel();},
  });
}

// Each mount rotates the tab key, so duplicated tabs cannot overwrite the active
// page's recovery record. Only one latest snapshot is written per mount.
export function createProjectRecovery({storage,sessionStorage,userId,newId,current,now=Date.now}){
  const prefix='taktik:studio:recovery:'+userId+':',tabKey=prefix+'tab';let previous=null,previousKey=null;
  try{const old=sessionStorage?.getItem(tabKey);if(projectIdValid(old)){previousKey=prefix+old+':v1';previous=storage?.getItem(previousKey);}}catch{}
  const key=prefix+newId()+':v1';
  let ownValue=null,adopted=false;
  function read(){
    try{if(!previous||previous.length>4*1024*1024)return null;const p=JSON.parse(previous),snapshot=normalizeStudioProjectSnapshot(p.snapshot);
      if(!snapshot||!projectIdValid(p.id)||!projectTitle(p.title)||!(p.revision===null||Number.isSafeInteger(p.revision)&&p.revision>0)||p.userId!==userId||!Number.isFinite(p.updatedAt)||now()-p.updatedAt>7*86400000)return null;
      return {id:p.id,revision:p.revision,title:p.title,snapshot};
    }catch{return null;}
  }
  function discardPrevious(){if(!current())return;try{if(previousKey&&storage?.getItem(previousKey)===previous)storage.removeItem(previousKey);}catch{}}
  return {read,adopt(){adopted=true;},discardPrevious,write(data){
    if(!current())return false;
    try{const value=JSON.stringify({...data,title:projectTitle(data.title)||'İsimsiz çalışma',userId,updatedAt:now()});storage?.setItem(key,value);if(!storage)return false;ownValue=value;sessionStorage?.setItem(tabKey,key.slice(prefix.length,-3));return true;}catch{return false;}
  },clear(){
    if(!current())return;
    try{if(ownValue&&storage?.getItem(key)===ownValue)storage.removeItem(key);if(adopted)discardPrevious();}catch{}
  }};
}
