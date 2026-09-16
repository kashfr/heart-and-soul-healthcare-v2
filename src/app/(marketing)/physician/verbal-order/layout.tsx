import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign a Verbal Order | Heart and Soul Healthcare',
  description: 'Review and electronically sign a verbal order taken by a Heart and Soul Healthcare nurse.',
  robots: { index: false, follow: false },
};

export default function PhysicianVerbalOrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
