import {createProfilePreferences} from './profile-preferences.js';
import {usernameValid, TERMS_VERSION} from './auth-validation.js';
import {createProfileBootstrap, profileColumns} from './profile-bootstrap.js';

const failure = code => ({ok:false,error:{code}});
const controls = /[\u0000-\u001f\u007f-\u009f]/;
export function normalizeProfile(input) {
  if (typeof input?.username !== 'string' || typeof input?.display_name !== 'string'
    || controls.test(input.username) || controls.test(input.display_name)) return null;
  const username = input.username.trim(), display_name = input.display_name.trim() || null;
  if (!usernameValid(username) || (display_name && [...display_name].length > 60)) return null;
  return {username,display_name};
}

// validatedUser comes only from the protected guard's successful getUser result.
// current binds this API instance to that mount generation, not a mutable user id.
export function createProfileApi({client,validatedUser,current,teamCatalogue}) {
  const id = validatedUser?.id;
  const active = () => typeof id === 'string' && current();
  const preflight = () => !id ? failure('unauthenticated') : !active() ? failure('state_changed') : null;
  const selectOwn = () => client.from('profiles').select(profileColumns).eq('id',id).maybeSingle();
  const bootstrap = createProfileBootstrap(client, userId => userId === id && active());
  function result(response, errorCode, allowMissing = false) {
    if (!active()) return failure('state_changed');
    if (response.error) return failure(errorCode);
    const row = response.data;
    if (!row) return allowMissing ? {ok:true,profile:null} : failure(errorCode);
    if (row.id !== id) return failure('state_changed');
    // Do not forward an SDK response or any columns outside the public contract.
    const {username,display_name,created_at,updated_at} = row;
    return {ok:true,profile:{id,username,display_name,created_at,updated_at}};
  }
  async function load() {
    const blocked = preflight(); if (blocked) return blocked;
    if (!client) return failure('profile_load_failed');
    try {
      const own = result(await selectOwn(),'profile_load_failed',true);
      if (!own.ok || own.profile) return own;
      if (!active()) return failure('state_changed');
      const recovered = await bootstrap();
      if (!active()) return failure('state_changed');
      if (!recovered.ok && !['profile_incomplete','username_conflict'].includes(recovered.status)) return failure('profile_load_failed');
      return result(await selectOwn(),'profile_load_failed',true);
    } catch {return failure(active() ? 'profile_load_failed' : 'state_changed');}
  }
  async function save(input) {
    const blocked = preflight(); if (blocked) return blocked;
    const values = normalizeProfile(input);
    if (!values) return failure('invalid_profile');
    if (!client) return failure('profile_save_failed');
    const updateOwn = async () => {
      if (!active()) return failure('state_changed');
      const response = await client.from('profiles').update(values).eq('id',id).select(profileColumns).maybeSingle();
      return result(response,response.error?.code === '23505' ? 'username_conflict' : 'profile_save_failed');
    };
    try {
      const own = result(await selectOwn(),'profile_save_failed',true);
      if (!own.ok) return own;
      if (own.profile) return await updateOwn();
      if (!active()) return failure('state_changed');
      // SEC2.3: creating a profile records the Terms acceptance only when the caller collected it (onboarding).
      const inserted = await client.from('profiles').insert({id,...values,...(input.termsAccepted === true ? {terms_version:TERMS_VERSION} : {})}).select(profileColumns).maybeSingle();
      if (!active()) return failure('state_changed');
      if (inserted.error?.code !== '23505') return result(inserted,'profile_save_failed');
      // A concurrent bootstrap may have inserted our own row. Never look up the
      // conflicting username: own-row SELECT is the only recovery query.
      const raced = result(await selectOwn(),'profile_save_failed',true);
      if (!raced.ok) return raced;
      return raced.profile ? await updateOwn() : failure('username_conflict');
    } catch {return failure(active() ? 'profile_save_failed' : 'state_changed');}
  }
  return Object.freeze({load,save,...createProfilePreferences({client,validatedUser,current,teamCatalogue})});
}
