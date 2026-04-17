'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
