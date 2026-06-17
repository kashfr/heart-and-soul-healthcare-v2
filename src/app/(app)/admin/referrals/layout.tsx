import { AuthGuard } from '@/components/AuthGuard';

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard allow={['admin']}>{children}</AuthGuard>;
}
