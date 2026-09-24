import {normalizeStudioProjectSnapshot,projectIdValid,projectTitle} from './studio-project-snapshot.js';
export const PROJECT_PAGE_SIZE=20;
export const PROJECT_COLUMNS='id,user_id,title,studio_mode,match_id,match_week,snapshot_version,revision,created_at,updated_at';
const fail=code=>({ok:false,error:{code}});
const revisionValid=n=>Number.isSafeInteger(n)&&n>0;
// A mounted API is pinned to the guard's validated identity AND generation.
export function createStudioProjects({client,validatedUser,current}){
  const owner=validatedUser?.id,active=()=>!!owner&&current();
  const blocked=()=>!active()?fail('state_changed'):!client?fail('projects_unavailable'):null;
  const own=()=>client.from('studio_projects');
  function metadata(row){
    if(!row||row.user_id!==owner||!projectIdValid(row.id)||!revisionValid(row.revision)||!projectTitle(row.title))return null;
    return Object.fromEntries(PROJECT_COLUMNS.split(',').filter(k=>k!=='user_id').map(k=>[k,row[k]]));
  }
  function result(response,{snapshot=false,empty='project_unavailable'}={}){
    if(!active())return fail('state_changed');if(response.error)return fail('project_request_failed');
    if(!response.data)return fail(empty);
    const project=metadata(response.data);if(!project)return fail('project_unavailable');
    if(snapshot){project.snapshot=response.data.snapshot_version===1?normalizeStudioProjectSnapshot(response.data.snapshot):null;if(!project.snapshot)return fail('invalid_snapshot');}
    return {ok:true,project};
  }
  async function getProject(id){
    const b=blocked();if(b)return b;if(!projectIdValid(id))return fail('project_unavailable');
    try{return result(await own().select(PROJECT_COLUMNS+',snapshot').eq('user_id',owner).eq('id',id).maybeSingle(),{snapshot:true});}catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function listProjects(offset=0){
    const b=blocked();if(b)return b;if(!Number.isSafeInteger(offset)||offset<0)return fail('invalid_form');
    try{
      const r=await own().select(PROJECT_COLUMNS).eq('user_id',owner).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+PROJECT_PAGE_SIZE);
      if(!active())return fail('state_changed');if(r.error||!Array.isArray(r.data))return fail('project_request_failed');
      const projects=r.data.slice(0,PROJECT_PAGE_SIZE).map(metadata);if(projects.some(p=>!p))return fail('project_request_failed');
      return {ok:true,projects,more:r.data.length>PROJECT_PAGE_SIZE,nextOffset:offset+PROJECT_PAGE_SIZE};
    }catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function createProject({id,title,snapshot}){
    const b=blocked();if(b)return b;title=projectTitle(title);snapshot=normalizeStudioProjectSnapshot(snapshot);
    if(!projectIdValid(id)||!title||!snapshot)return fail('invalid_form');
    try{
      const r=await own().insert({id,user_id:owner,title,snapshot_version:1,snapshot}).select(PROJECT_COLUMNS).maybeSingle();
      if(!active())return fail('state_changed');
      if(r.error?.code==='23505'){
        // Retry of an ambiguously acknowledged INSERT uses the SAME UUID, never upsert.
        const old=await getProject(id);if(!old.ok)return old;
        return old.project.title===title&&JSON.stringify(old.project.snapshot)===JSON.stringify(snapshot)?{ok:true,project:old.project}:fail('conflict');
      }
      return result(r);
    }catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function update({id,revision,title,snapshot},rename=false){
    const b=blocked();if(b)return b;title=projectTitle(title);
    if(!projectIdValid(id)||!revisionValid(revision)||!title)return fail('invalid_form');
    const values={title};if(!rename){const value=normalizeStudioProjectSnapshot(snapshot);if(!value)return fail('invalid_snapshot');Object.assign(values,{snapshot:value,snapshot_version:1});}
    try{return result(await own().update(values).eq('user_id',owner).eq('id',id).eq('revision',revision).select(PROJECT_COLUMNS).maybeSingle(),{empty:'conflict'});}
    catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function duplicateProject(id,newId){
    const old=await getProject(id);if(!old.ok||!active())return old.ok?fail('state_changed'):old;
    return createProject({id:newId,title:[...old.project.title].slice(0,112).join('')+' - Kopya',snapshot:old.project.snapshot});
  }
  async function deleteProject({id,revision}){
    const b=blocked();if(b)return b;if(!projectIdValid(id)||!revisionValid(revision))return fail('invalid_form');
    try{
      const r=await own().delete().eq('user_id',owner).eq('id',id).eq('revision',revision).select('id').maybeSingle();
      if(!active())return fail('state_changed');return r.error?fail('project_request_failed'):r.data?.id===id?{ok:true}:fail('conflict');
    }catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  return Object.freeze({listProjects,getProject,createProject,updateProject:input=>update(input),renameProject:input=>update(input,true),duplicateProject,deleteProject});
}
