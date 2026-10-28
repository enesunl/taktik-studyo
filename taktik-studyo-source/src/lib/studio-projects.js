import {normalizeStudioProjectSnapshot,projectIdValid,projectTitle,limitError} from './studio-project-snapshot.js';
export const PROJECT_PAGE_SIZE=20;
export const PROJECT_COLUMNS='id,user_id,title,studio_mode,match_id,match_week,snapshot_version,revision,created_at,updated_at';
const fail=code=>({ok:false,error:{code}});
const revisionValid=n=>Number.isSafeInteger(n)&&n>0;
// A mounted API is pinned to the guard's validated identity AND generation.
export function createStudioProjects({client,validatedUser,current}){
  const owner=validatedUser?.id,active=()=>!!owner&&current();
  const blocked=()=>!active()?fail('state_changed'):!client?fail('projects_unavailable'):null;
  const own=()=>client.from('studio_projects');
  // SEC3: one record per call; the server takes the owner from the session. No row = revision conflict.
  const save=(id,revision,title,snapshot)=>client.rpc('save_studio_project',{id,revision,title,snapshot}).select(PROJECT_COLUMNS).maybeSingle();
  function metadata(row){
    if(!row||row.user_id!==owner||!projectIdValid(row.id)||!revisionValid(row.revision)||!projectTitle(row.title))return null;
    return Object.fromEntries(PROJECT_COLUMNS.split(',').filter(k=>k!=='user_id').map(k=>[k,row[k]]));
  }
  function result(response,{snapshot=false,empty='project_unavailable'}={}){
    if(!active())return fail('state_changed');if(response.error)return fail(limitError(response.error)||'project_request_failed');
    if(!response.data)return fail(empty);
    const project=metadata(response.data);if(!project)return fail('project_unavailable');
    if(snapshot){project.snapshot=response.data.snapshot_version===1?normalizeStudioProjectSnapshot(response.data.snapshot):null;if(!project.snapshot)return fail('invalid_snapshot');}
    return {ok:true,project};
  }
  async function getProject(id){
    const b=blocked();if(b)return b;if(!projectIdValid(id))return fail('project_unavailable');
    try{return result(await own().select(PROJECT_COLUMNS+',snapshot').eq('user_id',owner).eq('id',id).maybeSingle(),{snapshot:true});}catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function listProjects(offset=0,pageSize=PROJECT_PAGE_SIZE){
    const b=blocked();if(b)return b;if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>PROJECT_PAGE_SIZE)return fail('invalid_form');
    try{
      // SEC2.2: exact total in the same request, for the usage line (accounts may already be above the limit).
      const r=await own().select(PROJECT_COLUMNS,{count:'exact'}).eq('user_id',owner).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize);
      if(!active())return fail('state_changed');if(r.error||!Array.isArray(r.data))return fail('project_request_failed');
      const projects=r.data.slice(0,pageSize).map(metadata);if(projects.some(p=>!p))return fail('project_request_failed');
      return {ok:true,projects,more:r.data.length>pageSize,nextOffset:offset+pageSize,total:Number.isSafeInteger(r.count)?r.count:null};
    }catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function getWorkspaceSummary(){
    const b=blocked();if(b)return b;
    try{
      const count=mode=>own().select('id',{count:'exact',head:true}).eq('user_id',owner).eq('studio_mode',mode);
      const [recent,free,match]=await Promise.all([listProjects(0,4),count('free'),count('match')]);
      if(!active())return fail('state_changed');
      if(!recent.ok||[free,match].some(r=>r.error||!Number.isSafeInteger(r.count)||r.count<0))return fail('project_request_failed');
      return {ok:true,projects:recent.projects,counts:{total:free.count+match.count,free:free.count,match:match.count}};
    }catch{return fail(active()?'project_request_failed':'state_changed');}
  }
  async function createProject({id,title,snapshot}){
    const b=blocked();if(b)return b;title=projectTitle(title);snapshot=normalizeStudioProjectSnapshot(snapshot);
    if(!projectIdValid(id)||!title||!snapshot)return fail('invalid_form');
    try{
      const r=await save(id,null,title,snapshot);
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
    let value=null;if(!rename){value=normalizeStudioProjectSnapshot(snapshot);if(!value)return fail('invalid_snapshot');}
    try{return result(await save(id,revision,title,value),{empty:'conflict'});}
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
  return Object.freeze({listProjects,getWorkspaceSummary,getProject,createProject,updateProject:input=>update(input),renameProject:input=>update(input,true),duplicateProject,deleteProject});
}
