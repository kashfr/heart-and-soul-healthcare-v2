'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function PatientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard allow={['admin']}>{children}</AuthGuard>;
}
