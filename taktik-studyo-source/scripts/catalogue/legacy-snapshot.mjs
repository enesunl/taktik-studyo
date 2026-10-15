// SEC1.1: the legacy FotMob-sourced roster snapshot was removed from dist/ and is never
// published or used at runtime. Historical audit tooling (D1/D2 evidence) reads the frozen
// copy from Git history in memory only. Nothing is written back to the working tree.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const LEGACY_ROSTER_REF='35e90ab';
export const LEGACY_ROSTER_PATH='dist/rosters.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function legacyRosterText(){
  try{return execFileSync('git',['show',LEGACY_ROSTER_REF+':./'+LEGACY_ROSTER_PATH],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','ignore']});}
  catch{throw Error('Legacy roster evidence needs Git history ('+LEGACY_ROSTER_REF+':'+LEGACY_ROSTER_PATH+').');}
}
export const legacyRoster=()=>JSON.parse(legacyRosterText().replace(/^\s*window\.TAKTIK_ROSTERS\s*=\s*/,'').replace(/;\s*$/,''));
