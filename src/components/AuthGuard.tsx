'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import type { Role } from '@/lib/auth';

interface AuthGuardProps {
  children: ReactNode;
  allow?: Role[];
}

export function AuthGuard({ children, allow }: AuthGuardProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const params = new URLSearchParams({ redirect: pathname || '/' });
      router.replace(`/login?${params.toString()}`);
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return <GuardMessage>Loading…</GuardMessage>;
  }

  if (!user) {
    return <GuardMessage>Redirecting to sign in…</GuardMessage>;
  }

  if (allow && allow.length > 0 && (!role || !allow.includes(role))) {
    return (
      <GuardMessage>
        <strong>Access denied.</strong>
        <br />
        Your account doesn&apos;t have permission to view this page. If you
        believe this is a mistake, contact your administrator.
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
