// Only the local development server implements this fixed route. No URL/query
// configuration, global Supabase replacement, or provider credentials in browser.
export function localMatchesEndpoint(location) {
  return ['http://localhost:4173','http://127.0.0.1:4173'].includes(location?.origin)
    ? '/__local/matches' : null;
}

export async function requestMatches({client,current,location,fetchImpl = fetch}) {
  const endpoint = localMatchesEndpoint(location);
  if (!endpoint) return client.functions.invoke('matches',{method:'GET',timeout:16000});
  // The session is used only as a transport credential. The existing page guard
  // and the local server independently validate the user against Auth.getUser.
  const {data,error} = await client.auth.getSession();
  if (error || !data?.session?.access_token || !current()) throw Error('matches_unavailable');
  const response = await fetchImpl(endpoint,{method:'GET',headers:{Authorization:'Bearer '+data.session.access_token},
    signal:AbortSignal.timeout(16000),credentials:'omit',cache:'no-store',redirect:'error'});
  if (!response.ok) throw Error('matches_unavailable');
  return {data:await response.json(),error:null};
}
