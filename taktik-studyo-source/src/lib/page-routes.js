// Preserve the public share parser: query wins over legacy path; lowercase v4 only.
export function resolvePage(location) {
  const path = location.pathname || '/', params = new URLSearchParams(location.search || '');
  if (path === '/' || path === '/index.html' || path.startsWith('/lineup/')) {
    const query = params.has('lineup');
    if (query || path.startsWith('/lineup/')) {
      const id = query ? params.get('lineup') : path.slice('/lineup/'.length).replace(/\/$/,'');
      if ((query && params.getAll('lineup').length !== 1)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return {kind:'share_error'};
      return {kind:'shared',id};
    }
    return {kind:'landing'};
  }
  // Static hosts can serve/rewrite links to extensionless HTML paths. Keep the
  // aliases exact and retain canonical .html paths for the safe-next allowlist.
  const canonicalPath = {'/studyo':'/studyo.html','/karsilastirma':'/karsilastirma.html','/profil':'/profil.html','/maclar':'/maclar.html'}[path] || path;
  const protectedPages = {'/studyo.html':'studio','/karsilastirma.html':'comparison','/profil.html':'profile','/maclar.html':'matches'};
  return protectedPages[canonicalPath] ? {kind:'protected',page:protectedPages[canonicalPath],path:canonicalPath} : {kind:'auth'};
}
