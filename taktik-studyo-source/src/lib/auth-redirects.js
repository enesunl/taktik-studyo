const routes = new Set(['/studyo.html', '/karsilastirma.html', '/profil.html']);

// Return a root-relative allowlisted route or null. No navigation side effects.
// Queries/fragments are intentionally unsupported until their own allowlist exists.
export function safeInternalRedirect(value) {
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
