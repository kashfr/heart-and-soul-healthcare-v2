import type { Metadata } from 'next';
import HideChrome from './components/HideChrome';
import AuthedWrapper from './AuthedWrapper';

export const metadata: Metadata = {
  title: 'Progress Note Form | Heart and Soul Healthcare',
  description: 'Internal nurse progress note documentation form',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProgressNoteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthedWrapper>
      <HideChrome />
      <div
        style={{
          minHeight: '100vh',
          background: '#f5f5f5',
          padding: '20px',
        }}
      >
        {children}
      </div>
    </AuthedWrapper>
  );
}
