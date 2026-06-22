import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type Role = 'admin' | 'supervisor' | 'nurse' | 'va';

/** A staff member's self-service request to change their login email. Email is
    the auth identity, so changes never happen client-side — the user proposes a
    new address (with an optional reason) and an admin approves or dismisses it
    from Staff & Roles. */
export interface EmailChangeRequest {
  /** The address the user wants to switch to (lowercased). */
  newEmail: string;
  /** Optional free-text reason for the change. */
  reason?: string;
  /** When the request was filed (Firestore Timestamp). */
  requestedAt?: unknown;
  status: 'pending';
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  credential?: string;
  /** US contact number in `(XXX) XXX-XXXX` format. Optional. Lets a reviewer
      reach the nurse about something in her notes. */
  phone?: string;
  active: boolean;
  createdAt?: unknown;
  invitedBy?: string;
  /** Present when the user has an open self-service email-change request
      awaiting admin approval. Cleared when an admin approves or dismisses it. */
  emailChangeRequest?: EmailChangeRequest;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const ref = doc(db, 'users', profile.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, profile, { merge: true });
  } else {
    await setDoc(ref, { ...profile, createdAt: serverTimestamp() });
  }
}

export function canViewAllSubmissions(role: Role | null): boolean {
  return role === 'admin' || role === 'supervisor';
}

export function canAccessAdmin(role: Role | null): boolean {
  return role === 'admin';
}
