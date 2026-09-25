'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';

/**
 * Show a PDF from an authenticated API route inside the page. The bytes are
 * fetched with the user's token and shown from a blob URL, so nothing is
 * cached or reachable without signing in, and no pop-up blocker gets in the
 * way (opening a tab after an await is often blocked). Download and "Open in
 * new tab" are real links, so they work where an embedded PDF doesn't (some
 * phones show only the first page).
 */
export default function PdfPreviewModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('document.pdf');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let made: string | null = null;
    (async () => {
      try {
        const res = await authedFetch(url);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status}).`);
        }
        const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1];
        const blob = await res.blob();
        made = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (!live) return URL.revokeObjectURL(made);
        if (name) setFileName(name);
        setBlobUrl(made);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not open the document.');
      }
    })();
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div style={headerStyle}>
          <strong style={{ fontSize: 15, color: '#1a3a5c', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
          {blobUrl && (
            <>
              <a href={blobUrl} download={fileName} style={btnStyle}>
                <Download size={14} /> Download
              </a>
              <a href={blobUrl} target="_blank" rel="noopener noreferrer" style={btnStyle}>
                <ExternalLink size={14} /> Open in new tab
              </a>
            </>
          )}
          <button onClick={onClose} style={closeStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div style={bodyStyle}>
          {error ? (
            <div role="alert" style={{ ...msgStyle, color: '#b3261e' }}>{error}</div>
          ) : blobUrl ? (
            <iframe src={blobUrl} title={title} style={frameStyle} />
          ) : (
            <div style={msgStyle}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 960, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' };
const headerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' };
const btnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 11px', fontSize: 13, fontWeight: 600, color: '#374151', textDecoration: 'none', fontFamily: 'inherit' };
const closeStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex', padding: 4 };
const bodyStyle: React.CSSProperties = { flex: 1, minHeight: 0, background: '#f1f5f9' };
const frameStyle: React.CSSProperties = { width: '100%', height: '100%', border: 'none', display: 'block' };
const msgStyle: React.CSSProperties = { padding: 24, fontSize: 14, color: '#5c6b7a' };
