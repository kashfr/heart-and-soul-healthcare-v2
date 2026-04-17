'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard allow={['admin']}>{children}</AuthGuard>;
}
