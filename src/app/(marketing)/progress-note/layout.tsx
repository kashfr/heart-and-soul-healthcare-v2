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
    <>
      {/* Hide the marketing header/footer BEFORE paint. HideChrome (JS) does
          the same in a useEffect, which runs after hydration and lets the
          marketing chrome flash for a frame on load/reload. This server-rendered
          style applies as soon as it's parsed, so there's no flicker. */}
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
