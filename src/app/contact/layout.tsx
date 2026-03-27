import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | Heart and Soul Healthcare',
  description: 'Contact Heart and Soul Healthcare in Atlanta, GA. Call (678) 644-0337 or send a message. We respond within 24 hours. Mon–Fri, 10:00 AM – 3:00 PM EST.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/contact' },
  openGraph: {
    title: 'Contact Us | Heart and Soul Healthcare',
    description: 'Reach Heart and Soul Healthcare at (678) 644-0337. Located at 1372 Peachtree St NE, Atlanta, GA 30309.',
    url: 'https://www.heartandsoulhc.org/contact',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
