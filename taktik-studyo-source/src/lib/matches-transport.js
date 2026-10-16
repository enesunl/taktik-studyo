// Only the local development server implements this fixed route. No URL/query
// configuration, global Supabase replacement, or provider credentials in browser.
export function localMatchesEndpoint(location) {
  return ['http://localhost:4173','http://127.0.0.1:4173'].includes(location?.origin)
    ? '/__local/matches' : null;
}

import {isMatchId} from './match-id.js';

export async function requestMatches({client,current,location,fetchImpl = fetch,id}) {
  if (id !== undefined && !isMatchId(id)) throw Error('INVALID_MATCH_ID');
  const suffix = id === undefined ? '' : '?id='+id, timeout = id === undefined ? 16000 : 30000;
  const endpoint = localMatchesEndpoint(location);
  if (!endpoint) return client.functions.invoke('matches'+suffix,{method:'GET',timeout});
  // The session is used only as a transport credential. The existing page guard
  // and the local server independently validate the user against Auth.getUser.
  const {data,error} = await client.auth.getSession();
  if (error || !data?.session?.access_token || !current()) throw Error(id === undefined ? 'matches_unavailable' : 'UNAUTHORIZED');
  const response = await fetchImpl(endpoint+suffix,{method:'GET',headers:{Authorization:'Bearer '+data.session.access_token},
    signal:AbortSignal.timeout(timeout),credentials:'omit',cache:'no-store',redirect:'error'});
  if (!response.ok) throw Error(id === undefined ? 'matches_unavailable' : detailError(response.status));
  return {data:await response.json(),error:null};
}
export const detailError = status => ({400:'INVALID_MATCH_ID',401:'UNAUTHORIZED',404:'MATCH_NOT_FOUND',429:'RATE_LIMITED'}[status] || 'PROVIDER_UNAVAILABLE');
