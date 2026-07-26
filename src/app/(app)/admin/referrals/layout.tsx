import { AuthGuard } from '@/components/AuthGuard';
import { PartnerAgenciesProvider } from './PartnerAgenciesProvider';

export default function ReferralsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard allow={['admin', 'va']}>
      <PartnerAgenciesProvider>{children}</PartnerAgenciesProvider>
    </AuthGuard>
  );
}
