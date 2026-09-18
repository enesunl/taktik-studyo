const routes = new Set(['/studyo.html', '/karsilastirma.html', '/profil.html']);

// Return a root-relative allowlisted route or null. No navigation side effects.
// Queries/fragments are intentionally unsupported until their own allowlist exists.
export function safeInternalRedirect(value) {
  return typeof value === 'string' && routes.has(value) ? value : null;
}
