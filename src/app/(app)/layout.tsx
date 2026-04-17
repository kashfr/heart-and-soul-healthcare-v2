'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allow={['admin', 'supervisor']}>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
