/**
 * Build the `redirect` value AuthGuard hands to /login.
 *
 * `usePathname()` from next/navigation returns the path only — no query string,
 * no hash. Using it bare drops the deep-link params our notifications send:
 * `?qn=<noteId>`, `?tab=schedule`, `?cosign=1`, `?resume=1`, `?edit=<patientId>`.
 * A nurse tapping a concern-bell text while signed out would land on the client
 * dashboard's default Overview tab with no quick note highlighted, which reads
 * as a broken link. Pull the missing pieces off window.location.
 */
export function buildLoginRedirect(pathname: string | null): string {
  const base = pathname || '/';
  // Belt and braces: callers run this from an effect (client-only), but the
  // helper is safe to call during a server render too.
  if (typeof window === 'undefined') return base;
  const { search, hash } = window.location;
  return `${base}${search}${hash}`;
}

/**
 * Validate a `redirect` value before handing it to router.replace().
 *
 * The param rides in on a URL, so anyone can craft one. Without this, a link
 * like /login?redirect=https://evil.com would bounce a nurse off-site the
 * moment she signed in, with our own domain in the address bar right up to
 * that point. Only site-relative paths are allowed; anything else falls back.
 */
export function safeLoginRedirect(
  value: string | null,
  fallback = '/admin'
): string {
  if (!value) return fallback;

  // Browsers drop tab, newline, and carriage return from a URL before they
  // resolve it, so a value like "/<tab>/evil.com" would become the
  // protocol-relative "//evil.com" and leave the site. Strip whitespace first
  // so we validate the same string the browser will act on. A legitimate
  // redirect never carries raw whitespace: it comes from window.location,
  // where spaces are already percent-encoded.
  const cleaned = value.replace(/\s+/g, '');

  // Must be site-relative: rules out "https://evil.com" and "javascript:...".
  if (!cleaned.startsWith('/')) return fallback;

  // "//evil.com" is protocol-relative, and browsers normalize the backslash
  // form "/\evil.com" to the same thing. Both leave the site.
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\')) return fallback;

  return cleaned;
}
