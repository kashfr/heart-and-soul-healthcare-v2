import { auth } from './firebase';

/** Matches ImpersonationProvider's STORAGE_KEY. Read directly (this is a plain
 *  function, not a hook) so EVERY API-route write in the portal shares one
 *  view-as guard instead of each surface remembering its own. */
const VIEW_AS_STORAGE_KEY = 'view-as-target';

function isViewAsSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * Routes a view-as session may still POST to. Two deliberate families:
 * - PDF endpoints: reads implemented as POST (they generate a document and
 *   log the export as the REAL admin) — blocking them just breaks download
 *   buttons the preview legitimately shows.
 * - Companion notifications for the writes view-as deliberately allows
 *   (quick notes and visit scheduling act as the real admin by design):
 *   without these, a concern flagged during a preview would save the note
 *   but silently never alert anyone — a dropped safety signal.
 * Everything else non-GET is refused during view-as.
 */
const VIEW_AS_WRITE_ALLOWLIST = [
  '/api/progress-note/pdf',
  '/api/mar/pdf',
  '/api/tar/pdf',
  '/api/quick-notes/concern-alert',
  '/api/visits/notify',
];

function pathOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

/**
 * Fetch wrapper that attaches the current user's Firebase ID token as a
 * Bearer credential so server routes can verify the caller via admin SDK.
 * Throws if no user is signed in.
 *
 * View-as sessions are read-only BY CONTRACT (the banner says so), so any
 * mutating request made while one is active is refused here with a synthetic
 * 403 instead of reaching the server (except the allowlist above).
 * Interactive callers surface `data.error` on !res.ok, so the refusal reads
 * as a normal error message; fire-and-forget callers must not be reachable
 * during view-as at all (the note forms block the whole session for this
 * reason). The view-as audit log itself is unaffected: it POSTs before the
 * session starts.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in.');
  }
  const method = (init.method || 'GET').toUpperCase();
  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    isViewAsSession() &&
    !VIEW_AS_WRITE_ALLOWLIST.some((p) => pathOf(input).startsWith(p))
  ) {
    return new Response(
      JSON.stringify({
        error: 'This is a read-only "View as" session. Exit view-as to make changes.',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}
