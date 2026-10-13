import {stateValid,drawingsValid} from './validation.js';
import {normalizeDrawingObjects} from './tactical-drawings.js';
import {safeSize} from './studio-preferences.js';
import {validPitchColor} from './pitch-preference.js';

// Browser-local extension only; the shared-lineup / Edge validation is unchanged.
function singleBoardValid(state){
  if(!state?.tactical)return stateValid(state);
  const {tactical,...base}=state;
  if(!tactical||Object.keys(tactical).sort().join(',')!=='drawings,legacy,pitch')return false;
  const p=tactical.pitch,size=safeSize(p);
  return stateValid({...base,drawings:tactical.legacy})&&drawingsValid(base.drawings,true)
    &&normalizeDrawingObjects(tactical.drawings)!==null
    &&p&&Object.keys(p).sort().join(',')==='color,height,width'
    &&p.width===size.width&&p.height===size.height&&validPitchColor(p.color);
}

export function boardDraftValid(input){
  if(!input?.workspace)return singleBoardValid(input);
  const {workspace,...active}=input;
  if(!singleBoardValid(active)||workspace.version!==1||Object.keys(workspace).sort().join(',')!=='activeTeamId,teams,version'
    ||!Array.isArray(workspace.teams)||!workspace.teams.length||workspace.teams.length>100)return false;
  const ids=new Set();let found=false;
  for(const entry of workspace.teams){
    if(!entry||Object.keys(entry).sort().join(',')!=='state,teamId'||typeof entry.teamId!=='string'||!/^[A-Za-z0-9_:-]{1,80}$/.test(entry.teamId)||ids.has(entry.teamId)||!singleBoardValid(entry.state)
      ||entry.state.team.id!==undefined&&entry.state.team.id!==entry.teamId)return false;
    ids.add(entry.teamId);
    if(entry.teamId===workspace.activeTeamId){found=true;if(JSON.stringify(entry.state)!==JSON.stringify(active))return false;}
  }
  return found;
}
