import {normalizeFavoriteTeamSlug} from './profile-preferences.js';

export function resolveFavoriteTeam(slug,teams) {
  if(!slug||normalizeFavoriteTeamSlug(slug)!==slug)return null;
  return teams.find(team=>team.id===slug&&team.catalogueActive!==false)??null;
}

export async function loadFavoriteTeam({api,catalogue}) {
  try {
    const result=await api.loadPreferences();
    if(!result.ok||!result.profile?.favorite_team_slug)return null;
    return resolveFavoriteTeam(result.profile.favorite_team_slug,await catalogue.loadTeams());
  }catch{return null;}
}

// Input is already the displayed round, in its original chronological order.
// teamId (local canonical server) or canonicalId (hosted matches function, whose teamId stays legacy)
// come from the server-side provider mapping, never from a name or provider id.
export function promoteFavoriteMatch(matches,team) {
  const owns=side=>side?.teamId===team.id||side?.canonicalId===team.id;
  const index=team?matches.findIndex(m=>owns(m.home)||owns(m.away)):-1;
  return {matches:index>0?[matches[index],...matches.slice(0,index),...matches.slice(index+1)]:matches,
    favoriteMatchId:index<0?null:matches[index].id};
}
