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
// teamId comes from the existing provider-to-canonical mapping, never a name.
export function promoteFavoriteMatch(matches,team) {
  const index=team?matches.findIndex(m=>m.home.teamId===team.id||m.away.teamId===team.id):-1;
  return {matches:index>0?[matches[index],...matches.slice(0,index),...matches.slice(index+1)]:matches,
    favoriteMatchId:index<0?null:matches[index].id};
}
