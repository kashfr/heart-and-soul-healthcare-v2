'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { SettingsProvider } from '@/components/SettingsProvider';

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allow={['admin', 'supervisor', 'nurse', 'va']}>
      {/* SettingsProvider lives inside AuthGuard so the fetch only
          fires for authenticated users (it hits an admin-gated API).
          Wraps AppShell so every screen in the staff portal can read
          org-wide defaults via useSettings(). */}
      <SettingsProvider>
        <AppShell>{children}</AppShell>
      </SettingsProvider>
    </AuthGuard>
  );
}
