import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EDWP Client Consent Form | Heart and Soul Healthcare',
  description:
    'Complete and sign the Heart and Soul Healthcare client consent form for the Elderly and Disabled Waiver Program (CCSP and SOURCE) online.',
  // Sent to clients directly by staff; not a page we want search engines surfacing.
  robots: { index: false, follow: false },
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/edwp/consent' },
};

export default function EdwpConsentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
