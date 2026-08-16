import type { Metadata } from 'next';
import HideChrome from '../progress-note/components/HideChrome';
import AuthedWrapper from '../progress-note/AuthedWrapper';

export const metadata: Metadata = {
  title: 'RN Oversight Visit Note | Heart and Soul Healthcare',
  description: 'Internal RN oversight visit documentation form',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OversightNoteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {/* Same pre-paint chrome hide as the progress-note layout. */}
      <style
        dangerouslySetInnerHTML={{
          __html: 'header, footer { display: none !important; } main { padding-top: 0 !important; }',
        }}
      />
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
    </>
  );
}
