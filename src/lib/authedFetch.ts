import { auth } from './firebase';

/**
 * Fetch wrapper that attaches the current user's Firebase ID token as a
 * Bearer credential so server routes can verify the caller via admin SDK.
 * Throws if no user is signed in.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in.');
  }
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}
