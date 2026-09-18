import {usernameValid} from './auth-validation.js';
export const profileColumns = 'id,username,display_name,created_at,updated_at';
const outcome = (ok, status) => ({ok, status});

export function createProfileBootstrap(client, isCurrentUser) {
  return async function ensureOwnProfile() {
    if (!client) return outcome(false,'profile_error');
    try {
      // Raw server-verified user stays inside this module; metadata is only a seed.
      const verified = await client.auth.getUser();
      const user = verified.data?.user;
      if (verified.error || !user || typeof user.id !== 'string' || !isCurrentUser(user.id)) return outcome(false,'profile_error');
      if (!user.email_confirmed_at || user.is_anonymous) return outcome(false,'profile_incomplete');
      const id = user.id;
      const selectOwn = () => client.from('profiles').select(profileColumns).eq('id',id).maybeSingle();
      const own = await selectOwn();
      if (!isCurrentUser(id) || own.error) return outcome(false,'profile_error');
      if (own.data) return outcome(own.data.id === id, own.data.id === id ? 'ready' : 'profile_error');
      const username = user.user_metadata?.username;
      if (!usernameValid(username)) return outcome(false,'profile_incomplete');
      if (!isCurrentUser(id)) return outcome(false,'profile_error');
      const inserted = await client.from('profiles').insert({id,username});
      if (!isCurrentUser(id)) return outcome(false,'profile_error');
      if (!inserted.error) return outcome(true,'ready');
      // A concurrent own-profile insert is success, never an upsert/overwrite.
      const raced = await selectOwn();
      if (!isCurrentUser(id) || raced.error) return outcome(false,'profile_error');
      if (raced.data?.id === id) return outcome(true,'ready');
      return outcome(false,inserted.error.code === '23505' ? 'username_conflict' : 'profile_error');
    } catch { return outcome(false,'profile_error'); }
  };
}
