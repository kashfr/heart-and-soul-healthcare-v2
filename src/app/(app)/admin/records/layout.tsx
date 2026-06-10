'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function RecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard allow={['admin', 'supervisor']}>{children}</AuthGuard>;
}
