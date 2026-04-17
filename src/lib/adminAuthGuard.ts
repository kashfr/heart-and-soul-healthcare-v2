import 'server-only';
import { adminAuth, adminDb } from './firebaseAdmin';
import type { Role, UserProfile } from './auth';

export interface AuthedCaller {
  uid: string;
  email: string | null;
  role: Role;
  profile: UserProfile;
}

export class AdminAuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Verify the ID token from the Authorization header and load the caller's
 * role from Firestore. Throws AdminAuthError if missing/invalid/forbidden.
 */
export async function requireRole(
  request: Request,
  allow: Role[]
): Promise<AuthedCaller> {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AdminAuthError(401, 'Missing Authorization bearer token.');
  }
  const idToken = match[1].trim();

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(idToken);
  } catch {
    throw new AdminAuthError(401, 'Invalid or expired session. Please sign in again.');
  }

  const uid = decoded.uid;
  const profileSnap = await adminDb().collection('users').doc(uid).get();
  if (!profileSnap.exists) {
    throw new AdminAuthError(403, 'Your account has no staff profile.');
  }
  const profile = profileSnap.data() as UserProfile;

  if (profile.active === false) {
    throw new AdminAuthError(403, 'Your account is deactivated.');
  }

  if (!allow.includes(profile.role)) {
    throw new AdminAuthError(403, 'You do not have permission to perform this action.');
  }

  return {
    uid,
    email: decoded.email ?? null,
    role: profile.role,
    profile,
  };
}
