'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function AuthedWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allow={['admin', 'supervisor', 'nurse']}>{children}</AuthGuard>
  );
}
