import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {teamMapping,mapTeam} from '../supabase/functions/matches/teams.js';
import {normalizeEvent,LEAGUE_ID,SEASON_ID} from '../supabase/functions/matches/provider.js';
import {promoteFavoriteMatch} from '../src/lib/favorite-team.js';
import {seasonValid} from '../src/lib/matches.js';

const registry=JSON.parse(readFileSync(new URL('../scripts/catalogue/team-registrations.json',import.meta.url),'utf8'));
const event=(id,home,away,date)=>({id,league_id:LEAGUE_ID,season_id:SEASON_ID,round_number:8,event_date:date,status:'notstarted',
  home_team_id:home.id,home_team:home.name,away_team_id:away.id,away_team:away.name,home_score:null,away_score:null});

test('hosted matches mapping carries the verified canonical slug for every BSD team while teamId stays legacy',()=>{
  assert.equal(teamMapping.size,18);
  for(const t of registry){
    const mapped=teamMapping.get(String(t.bsdId));
    assert.ok(mapped,t.id);assert.equal(mapped.canonicalId,t.id);assert.match(mapped.teamId,/^fotmob-\d+$/);
    assert.equal(mapped.name,t.display_name);assert.equal(mapped.color,t.color_primary);assert.equal(mapped.color2,t.color_secondary);
  }
  assert.equal(mapTeam(999999,'Unknown FC').canonicalId,null);assert.equal(mapTeam(999999,'Unknown FC').teamId,null);
});

test('favourite match is promoted with production-shaped hosted data (legacy teamId + canonicalId)',()=>{
  const gs={id:125,name:'Galatasaray'},bjk={id:196,name:'Besiktas JK'},ts={id:197,name:'Trabzonspor'},fb={id:134,name:'Fenerbahce'};
  const matches=[event(1,gs,fb,'2026-10-17T16:00:00Z'),event(2,ts,bjk,'2026-10-18T17:00:00Z')].map(e=>normalizeEvent(e));
  assert.ok(matches.every(Boolean));
  assert.equal(matches[1].away.teamId,'fotmob-10188');assert.equal(matches[1].away.canonicalId,'besiktas');
  assert.ok(seasonValid({season:'2026-2027',matches}),'client validation accepts the extra field');
  const promoted=promoteFavoriteMatch(matches,{id:'besiktas'});
  assert.equal(promoted.favoriteMatchId,matches[1].id);assert.deepEqual(promoted.matches.map(m=>m.id),[matches[1].id,matches[0].id]);
  // Local canonical server shape (teamId is already the slug) keeps working.
  const local=matches.map(m=>({...m,home:{...m.home,teamId:m.home.canonicalId},away:{...m.away,teamId:m.away.canonicalId}}));
  assert.equal(promoteFavoriteMatch(local,{id:'galatasaray'}).favoriteMatchId,local[0].id);
  // Never by display name or provider id, and unknown teams never match.
  const spoof=[{...matches[0],home:{...matches[0].home,teamId:null,canonicalId:null,name:'besiktas',providerId:'besiktas'}}];
  assert.equal(promoteFavoriteMatch(spoof,{id:'besiktas'}).favoriteMatchId,null);
  assert.equal(promoteFavoriteMatch(matches,{id:'amedspor'}).favoriteMatchId,null);
  assert.equal(promoteFavoriteMatch(matches,null).matches,matches);
});
