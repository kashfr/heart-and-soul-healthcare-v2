import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Make a Referral | Heart and Soul Healthcare',
  description: 'Refer a patient to Heart and Soul Healthcare. Submit a home health referral for GAPP, NOW/COMP, ICWP, or EDWP waiver programs serving clients throughout Georgia.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/referral' },
  openGraph: {
    title: 'Make a Referral | Heart and Soul Healthcare',
    description: 'Submit a home health referral for waiver programs serving clients throughout Georgia.',
    url: 'https://www.heartandsoulhc.org/referral',
  },
};

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return children;
}
