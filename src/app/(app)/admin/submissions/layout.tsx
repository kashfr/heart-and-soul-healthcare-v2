'use client';

import { AuthGuard } from '@/components/AuthGuard';

/**
 * Notes are PHI; the VA role (referrals/agencies work) has no business need
 * here. The sidebar item was only HIDDEN from VA before the Aug 2026 nav
 * consolidation — this guard actually gates the route (the app-group layout
 * admits all four roles).
 */
export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard allow={['admin', 'supervisor', 'nurse']}>{children}</AuthGuard>;
}
