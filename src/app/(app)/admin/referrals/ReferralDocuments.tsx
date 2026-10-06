'use client';

import { useEffect, useState } from 'react';
import { btn, btnSm } from '@/components/buttons';
import { Eye, FileText } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import type { ReferralDocument } from '@/lib/referralDocumentsServer';

/**
 * Papers filed against a referral from the Fax Center before it has a client
 * record, with the signed Appendix T (kept with the PPOT request) listed first.
 * Once the record is created they are copied to the client's Documents, and
 * each row says so.
 */
export default function ReferralDocuments({ referralId, patientId, refreshKey }: { referralId: string; patientId: string | null | undefined; refreshKey: string | null | undefined }) {
  const [docs, setDocs] = useState<ReferralDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReferralDocument | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await authedFetch(`/api/admin/referrals/${referralId}/documents`);
        const d = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(d.error || 'Could not load documents.');
        setDocs(d.documents ?? []);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load documents.');
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [referralId, refreshKey]);

  if (docs === null && !error) return null;
  if (error) return <div style={{ ...emptyStyle, color: '#b3261e' }}>{error}</div>;
  if (!docs || docs.length === 0) return null;

  return (
    <>
      <div style={titleStyle}>Documents</div>
      <div style={listStyle}>
        {docs.map((d) => (
          <div key={d.id} style={rowStyle}>
            <FileText size={16} style={{ color: '#5c6b7a', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {d.kind === 'ppot' && <span style={ppotBadgeStyle}>Signed PPOT</span>}
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937' }}>{d.title}</div>
              <div style={metaStyle}>
                {d.category}{d.docDate ? ` · ${formatDateUS(d.docDate)}` : ''}{d.uploadedByName ? ` · filed by ${d.uploadedByName}` : ''}
                {d.patientDocumentId ? ' · now in the client’s Documents' : patientId ? '' : ' · moves to the client’s Documents when the record is created'}
              </div>
            </div>
            <button type="button" onClick={() => setPreview(d)} className={`${btn} ${btnSm}`} style={{ flexShrink: 0 }}>
              <Eye size={14} /> View
            </button>
          </div>
        ))}
      </div>
      {preview && <PdfPreviewModal title={preview.title} url={`/api/admin/referrals/${referralId}/documents/${preview.id}/pdf`} onClose={() => setPreview(null)} />}
    </>
  );
}

const titleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5c6b7a', margin: '22px 0 10px' };
const listStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f1f5f9', background: 'white' };
const metaStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 2 };
const ppotBadgeStyle: React.CSSProperties = { display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#1a3a5c', background: '#e8f0f8', borderRadius: 999, padding: '1px 8px', marginBottom: 3 };
const emptyStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', padding: '8px 0' };
