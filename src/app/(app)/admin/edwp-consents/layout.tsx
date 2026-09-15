import { AuthGuard } from '@/components/AuthGuard';

export default function EdwpConsentsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard allow={['admin', 'va']}>{children}</AuthGuard>;
}
