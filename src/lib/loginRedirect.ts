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
