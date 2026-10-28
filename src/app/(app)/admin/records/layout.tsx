'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { AssistantAccessGate } from '@/components/AssistantAccessGate';

export default function RecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A granted assistant reads the order book like staff; the pages' own
  // gates keep charting and medication changes with clinicians and admin.
  return <AuthGuard allow={['admin', 'supervisor', 'va']}><AssistantAccessGate>{children}</AssistantAccessGate></AuthGuard>;
}
