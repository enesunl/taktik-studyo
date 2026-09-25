// Offline by default; no credentials, no network and no database writer.
import {readFileSync} from 'node:fs';
import {planSync} from './sync.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../tests/fixtures/bsd-catalogue-audit.json',import.meta.url),'utf8'));
const plan=planSync({...fixture,provider:'bsd',complete:true});
console.log(JSON.stringify({mode:'offline-dry-run',...plan.summary,safePlayerAliases:fixture.aliases.length,teamAliases:fixture.teams.length,unresolved:fixture.unresolved.length,
  note:'Proposed UUIDs are temporary. First approved transactional population persists UUIDs; subsequent syncs reuse stored provider mappings.'},null,2));
