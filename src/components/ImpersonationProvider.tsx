'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Admin "View as" (read-only nurse impersonation for testing).
 *
 * The admin stays authenticated as themselves; this just holds which nurse the
 * UI should RENDER as. Nurse-scoped read surfaces use the effective identity
 * (see useEffectiveUser in AuthProvider). All WRITE paths keep using the real
 * signed-in admin, so author-only Firestore rules deny them — read-only is
 * structural, not cosmetic. Persisted to sessionStorage so it survives the
 * full-page reloads the clarification gate performs.
 */
export interface ViewAsTarget {
  uid: string;
  displayName: string;
  credential: string | null;
}

interface ImpersonationContextValue {
  viewingAs: ViewAsTarget | null;
  startViewAs: (target: ViewAsTarget) => void;
  stopViewAs: () => void;
}

const STORAGE_KEY = 'view-as-target';

const ImpersonationContext = createContext<ImpersonationContextValue>({
  viewingAs: null,
  startViewAs: () => {},
  stopViewAs: () => {},
});

export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [viewingAs, setViewingAs] = useState<ViewAsTarget | null>(null);

  // Hydrate from sessionStorage on mount (survives reloads, clears on new tab/session).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setViewingAs(JSON.parse(raw) as ViewAsTarget);
    } catch {
      /* ignore */
    }
  }, []);

  const startViewAs = (target: ViewAsTarget) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
    } catch {
      /* ignore */
    }
    setViewingAs(target);
  };

  const stopViewAs = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setViewingAs(null);
  };

  return (
    <ImpersonationContext.Provider value={{ viewingAs, startViewAs, stopViewAs }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useViewAs() {
  return useContext(ImpersonationContext);
}
