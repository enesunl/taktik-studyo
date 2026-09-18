const DEFAULT_ORIGIN = 'https://taktikstudyo.com';

// Only an absent variable uses the default. Invalid configuration fails closed.
export function parseAllowedOrigins(value = DEFAULT_ORIGIN) {
  const invalid = () => new Error('ALLOWED_ORIGINS must contain comma-separated HTTPS origins without wildcards, credentials, paths, queries or fragments.');
  if (typeof value !== 'string') throw invalid();
  const origins = value.split(',').map(entry => {
    const candidate = entry.trim();
    // Check before URL parsing, which can silently normalize paths/backslashes.
    if (!/^https:\/\/[^/?#\\\s*@]+\/?$/i.test(candidate)) throw invalid();
    let url;
    try { url = new URL(candidate); } catch { throw invalid(); }
    if (url.protocol !== 'https:' || !url.hostname || url.hostname.includes('*') || url.username || url.password) throw invalid();
    return url.origin;
  });
  return [...new Set(origins)];
}
