import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type Role = 'admin' | 'supervisor' | 'nurse';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  credential?: string;
  active: boolean;
  createdAt?: unknown;
  invitedBy?: string;
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
