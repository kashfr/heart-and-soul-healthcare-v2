'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { useViewAs } from './ImpersonationProvider';
import { buildLoginRedirect } from '@/lib/loginRedirect';
import type { Role } from '@/lib/auth';

interface AuthGuardProps {
  children: ReactNode;
  allow?: Role[];
}

export function AuthGuard({ children, allow }: AuthGuardProps) {
  const { user, role, loading } = useAuth();
  const { viewingAs } = useViewAs();
  const router = useRouter();
  const pathname = usePathname();
  // During "View as" the allow check uses the TARGET's role, so the preview
  // is faithful both ways: pages the target can't open show their denial
  // screen instead of the admin's view. This only ever narrows access — the
  // signed-in check and every server-side rule still use the real user, and
  // view-as targets are never admins.
  const effectiveRole = viewingAs ? viewingAs.role : role;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const params = new URLSearchParams({ redirect: buildLoginRedirect(pathname) });
      router.replace(`/login?${params.toString()}`);
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return <GuardMessage>Loading…</GuardMessage>;
  }

  if (!user) {
    return <GuardMessage>Redirecting to sign in…</GuardMessage>;
  }

  if (allow && allow.length > 0 && (!effectiveRole || !allow.includes(effectiveRole))) {
    return (
      <GuardMessage>
        <strong>Access denied.</strong>
        <br />
        {viewingAs ? (
          <>
            {viewingAs.displayName} doesn&apos;t have access to this page, so the
            view-as preview can&apos;t show it. Exit view-as to open it as yourself.
          </>
        ) : (
          <>
            Your account doesn&apos;t have permission to view this page. If you
            believe this is a mistake, contact your administrator.
          </>
        )}
      </GuardMessage>
    );
  }

  return <>{children}</>;
}

function GuardMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        textAlign: 'center',
        color: '#4a5568',
        fontSize: 14,
      }}
    >
      <div>{children}</div>
    </div>
  );
}
