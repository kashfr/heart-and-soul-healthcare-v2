'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '@/lib/auth';

/**
 * Admin "View as" (read-only staff impersonation for testing).
 *
 * The admin stays authenticated as themselves; this just holds which staff
 * member the UI should RENDER as — including their real ROLE, so previewing a
 * VA shows the VA's sidebar and a supervisor shows the supervisor's, not a
 * nurse's (the role was hardcoded to 'nurse' until Aug 2026, which made every
 * preview lie about non-nurse access). Role-scoped read surfaces use the
 * effective identity (see useEffectiveUser in AuthProvider). All WRITE paths
 * keep using the real signed-in admin, so author-only Firestore rules deny
 * them and the clinical surfaces (dose charting, note authoring) block on
 * isViewingAs explicitly — read-only is structural, not cosmetic. Persisted
 * to sessionStorage so it survives the full-page reloads the clarification
 * gate performs.
 */
export interface ViewAsTarget {
  uid: string;
  displayName: string;
  credential: string | null;
  role: Role;
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
      if (raw) {
        const parsed = JSON.parse(raw) as ViewAsTarget;
        // A session started before targets carried a role (pre-Aug 2026) has
        // none stored; those sessions were always nurse previews.
        if (!parsed.role) parsed.role = 'nurse';
        setViewingAs(parsed);
      }
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

/**
 * Hard stop for pages that must not run at all during a view-as session.
 * The note forms need this rather than per-button gating: a submit there is
 * half direct-Firestore (succeeds as the real admin) and half fire-and-forget
 * API calls (refused by the authedFetch view-as guard with nothing reading
 * the response), so letting the form open at all invites a silently
 * half-completed note and a diverged MAR.
 */
export function ViewAsWriteBlock({ children }: { children: ReactNode }) {
  const { viewingAs, stopViewAs } = useViewAs();
  if (!viewingAs) return <>{children}</>;
  return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
      <div style={{ maxWidth: 460, color: '#2c3e50', fontSize: 14, lineHeight: 1.6 }}>
        <strong>Not available while viewing as {viewingAs.displayName}.</strong>
        <br />
        View-as is a read-only preview, and this form submits real
        documentation. Exit view-as to author it as yourself.
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => {
              stopViewAs();
              window.location.reload();
            }}
            style={{ background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Exit view-as
          </button>
        </div>
      </div>
    </div>
  );
}
