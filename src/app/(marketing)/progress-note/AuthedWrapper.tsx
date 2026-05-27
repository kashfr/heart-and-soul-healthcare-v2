'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { SettingsProvider } from '@/components/SettingsProvider';

export default function AuthedWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allow={['admin', 'supervisor', 'nurse']}>
      {/* SettingsProvider lets the progress-note form read org-wide
          settings (e.g. patient.allowFreeText, vital range overrides).
          Inside AuthGuard so the GET only fires for signed-in users. */}
      <SettingsProvider>{children}</SettingsProvider>
    </AuthGuard>
  );
}
