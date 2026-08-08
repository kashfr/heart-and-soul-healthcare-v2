'use client';

import { Suspense } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { SettingsProvider } from '@/components/SettingsProvider';
import CorrectionsBlockGate from '@/components/CorrectionsBlockGate';

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
      <SettingsProvider>
        {/* Corrections hard stop: a nurse with a note flagged "must be
            corrected" (or a manual admin block) can't use the note form until
            she amends it. Lives HERE — not only in the admin AppShell —
            because /progress-note is where nurses actually document, and the
            Aug 2026 incident showed a nurse can work for weeks without ever
            opening /admin. Suspense: the gate reads useSearchParams. */}
        <Suspense fallback={null}>
          <CorrectionsBlockGate />
        </Suspense>
        {children}
      </SettingsProvider>
    </AuthGuard>
  );
}
