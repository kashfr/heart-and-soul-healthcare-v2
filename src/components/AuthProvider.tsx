'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { UserProfile, Role } from '@/lib/auth';
import { useViewAs } from './ImpersonationProvider';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      () => {
        setProfile(null);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  const value: AuthContextValue = {
    user,
    profile,
    role: profile?.role ?? null,
    loading,
    signOut: async () => {
      await fbSignOut(auth);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * The EFFECTIVE identity for nurse-scoped READ/display logic. Normally this is
 * the real signed-in user, but when an admin is using "View as" it returns the
 * impersonated nurse's identity so her screens render. WRITE paths must keep
 * using useAuth().user (the real admin), so author-only rules still apply and
 * the view stays read-only.
 */
export interface EffectiveUser {
  uid: string | null;
  displayName: string | null;
  role: Role | null;
  credential: string | undefined;
  isViewingAs: boolean;
}

export function useEffectiveUser(): EffectiveUser {
  const { user, profile, role } = useAuth();
  const { viewingAs } = useViewAs();
  if (viewingAs) {
    return {
      uid: viewingAs.uid,
      displayName: viewingAs.displayName,
      role: 'nurse',
      credential: viewingAs.credential ?? undefined,
      isViewingAs: true,
    };
  }
  return {
    uid: user?.uid ?? null,
    displayName: profile?.displayName ?? user?.displayName ?? null,
    role,
    credential: profile?.credential,
    isViewingAs: false,
  };
}
