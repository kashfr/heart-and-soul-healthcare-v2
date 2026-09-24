import { AuthGuard } from '@/components/AuthGuard';

// Role gate only. The per-person grant from Settings is checked by the page
// (to explain itself) and, authoritatively, by every /api/fax route.
export default function FaxLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard allow={['admin', 'supervisor', 'va']}>{children}</AuthGuard>;
}
