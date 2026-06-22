import { AuthGuard } from '@/components/AuthGuard';

export default function AgenciesLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard allow={['admin', 'va']}>{children}</AuthGuard>;
}
