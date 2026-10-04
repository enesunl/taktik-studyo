import {CURRENT_ONBOARDING_VERSION} from './onboarding.js';
import {createCanonicalCatalogue} from './catalogue-canonical.js';

export const preferenceColumns = 'id,favorite_team_slug,onboarding_completed_at,onboarding_version';
const fail = code => ({ok:false,error:{code}});
const missingSchema = error => ['42703','42P01','PGRST204','PGRST205'].includes(error?.code);
export function normalizeFavoriteTeamSlug(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return undefined;
  const slug = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{0,79}$/.test(slug) && !/^(bsd|fotmob)-/.test(slug) ? slug : undefined;
}

// Same validated owner and client as P1. Never switch to the local catalogue DB.
export function createProfilePreferences({client,validatedUser,current}) {
  const id=validatedUser?.id;
  const active=()=>typeof id==='string'&&current();
  const preflight=()=>!id?fail('unauthenticated'):!active()?fail('state_changed'):!client?fail('auth_unavailable'):null;
  const catalogue=createCanonicalCatalogue(client);
  function result(response,code,allowMissing=false) {
    if(!active())return fail('state_changed');
    if(response.error)return fail(missingSchema(response.error)?'onboarding_unavailable':code);
    const row=response.data;
    if(!row)return allowMissing?{ok:true,profile:null}:fail('profile_incomplete');
    if(row.id!==id)return fail('state_changed');
    if(!Number.isInteger(row.onboarding_version)||row.onboarding_version<0
      || !(row.onboarding_completed_at===null||typeof row.onboarding_completed_at==='string'&&Number.isFinite(Date.parse(row.onboarding_completed_at)))
      || !(row.favorite_team_slug===null||typeof row.favorite_team_slug==='string'&&normalizeFavoriteTeamSlug(row.favorite_team_slug)===row.favorite_team_slug))return fail('onboarding_invalid');
    return {ok:true,profile:{id,favorite_team_slug:row.favorite_team_slug,onboarding_completed_at:row.onboarding_completed_at,onboarding_version:row.onboarding_version}};
  }
  async function loadPreferences() {
    const blocked=preflight();if(blocked)return blocked;
    try{return result(await client.from('profiles').select(preferenceColumns).eq('id',id).maybeSingle(),'onboarding_load_failed',true);}
    catch{return fail(active()?'onboarding_load_failed':'state_changed');}
  }
  async function write(slugInput,complete) {
    const blocked=preflight();if(blocked)return blocked;
    const slug=normalizeFavoriteTeamSlug(slugInput);
    if(slug===undefined)return fail('invalid_favorite_team');
    try {
      // Writes fail closed when O1 isn't installed. Normal P1 load/save never
      // requests these fields, even when this independent operation fails.
      const own=await loadPreferences();if(!own.ok)return own;
      if(!own.profile)return fail('profile_incomplete');
      if(slug!==null){
        const valid=await catalogue.hasActiveTeam(slug);
        if(!active())return fail('state_changed');
        if(!valid)return fail('invalid_favorite_team');
      }
      if(!active())return fail('state_changed');
      const values={favorite_team_slug:slug};
      if(complete)values.onboarding_version=CURRENT_ONBOARDING_VERSION;
      const response=await client.from('profiles').update(values).eq('id',id).select(preferenceColumns).maybeSingle();
      return result(response,response.error?.code==='23514'||response.error?.code==='23503'?'invalid_preference':'onboarding_save_failed');
    }catch{return fail(active()?'onboarding_save_failed':'state_changed');}
  }
  return Object.freeze({loadPreferences,
    completeOnboarding:({favoriteTeamSlug=null}={})=>write(favoriteTeamSlug,true),
    setFavoriteTeam:slug=>write(slug,false),clearFavoriteTeam:()=>write(null,false)});
}
