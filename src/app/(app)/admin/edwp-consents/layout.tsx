'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { canUseEdwp } from '@/lib/edwpAccess';

/** Admins, plus the supervisors and VAs checked in Settings. The API routes
 *  enforce the same rule; this only keeps the page from rendering. */
export default function EdwpConsentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allow={['admin', 'supervisor', 'va']}>
      <Gate>{children}</Gate>
    </AuthGuard>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { uid, role } = useEffectiveUser();
  const { settings, ready } = useSettings();
  if (!ready) return null;
  if (!canUseEdwp(settings.edwp, uid, role)) {
    return (
      <div style={{ maxWidth: 640, margin: '48px auto', padding: '0 20px', color: '#5c6b7a', fontSize: 14.5, lineHeight: 1.5 }}>
        You do not have access to EDWP Consents. Ask an admin to add you in Settings.
      </div>
    );
  }
  return <>{children}</>;
}
