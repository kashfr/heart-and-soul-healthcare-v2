'use client';

/**
 * Full-area loading screen for the moments before we know who is signed in.
 *
 * Firebase restores a saved session asynchronously, so for a beat after a
 * hard load neither "signed in" nor "signed out" is known. Anything rendered
 * in that gap is a guess: the login page used to guess "signed out" and
 * flashed its form at people who were already signed in. This screen is the
 * neutral answer for that gap (and for the redirect that follows).
 *
 * It fades in after a short delay, so a fast session restore shows nothing
 * at all instead of a flickering spinner.
 */
export function PortalLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={wrap}>
      <div style={inner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo-2026.webp" alt="" width={180} height={48} style={{ width: 180, height: 'auto' }} />
        <span aria-hidden style={ring} className="hs-portal-loading-ring" />
        <span style={text}>{label}</span>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '70vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  opacity: 0,
  animation: 'fadeIn 0.25s ease-out 0.2s forwards',
};
const inner: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 };
const ring: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '3px solid #e2e8f0',
  borderTopColor: '#1a3a5c',
  animation: 'hs-spin 0.8s linear infinite',
};
const text: React.CSSProperties = { fontSize: 13.5, color: '#5c6b7a' };
