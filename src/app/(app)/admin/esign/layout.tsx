import { AuthGuard } from '@/components/AuthGuard';

// Same people as the Fax Center: the page checks the Settings grant and every
// /api/esign route enforces it. Signed copies are admin-only.
export default function EsignLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard allow={['admin', 'supervisor', 'va']}>{children}</AuthGuard>;
}
