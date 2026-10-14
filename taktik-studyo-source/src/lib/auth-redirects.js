const routes = new Set(['/ilk-11lerim.html', '/hos-geldin.html', '/haftanin-ilk-11i.html', '/calismalarim.html', '/studyo.html', '/karsilastirma.html', '/profil.html', '/maclar.html', '/mac.html', '/mac-studyosu.html']);

// Return a root-relative allowlisted route or null. No navigation side effects.
// Only the exact Weekly XI record query has its own allowlist; no arbitrary queries.
export function safeInternalRedirect(value) {
  if(typeof value==='string'&&/^\/haftanin-ilk-11i(?:\.html)?\?id=[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))return value.replace(/^\/haftanin-ilk-11i\?/, '/haftanin-ilk-11i.html?');
  if(value === '/karsilastirma.html') return '/studyo.html';
  return typeof value === 'string' && routes.has(value) ? value : null;
}

export function loginDestination(search = '') {
  const params = new URLSearchParams(search);
  return params.getAll('next').length === 1
    ? safeInternalRedirect(params.get('next')) || '/studyo.html' : '/studyo.html';
}

export function loginUrl(path) {
  return '/giris.html?next=' + encodeURIComponent(safeInternalRedirect(path) || '/studyo.html');
}
