'use client';

import { useEffect, useState } from 'react';
import { btn, btnSm } from '@/components/buttons';
import { Eye, FileText, FileUp } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import EditReferralDocumentModal from './EditReferralDocumentModal';
import UndoReferralPpotModal from './UndoReferralPpotModal';
import ReplaceReferralDocumentModal from './ReplaceReferralDocumentModal';
import UploadReferralDocumentModal from './UploadReferralDocumentModal';
import { EditRoiModal } from '../fax/RoiSection';
import type { RoiRecord } from '@/lib/roiShared';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import type { ReferralDocument } from '@/lib/referralDocumentsServer';

/**
 * Papers filed against a referral before it has a client record (from the Fax
 * Center, or uploaded here with Upload Document), with the signed Appendix T
 * (kept with the PPOT request) listed first.
 * Once the record is created they are copied to the client's Documents, and
 * each row says so.
 */
export default function ReferralDocuments({ referralId, patientId, refreshKey }: { referralId: string; patientId: string | null | undefined; refreshKey: string | null | undefined }) {
  const [docs, setDocs] = useState<ReferralDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReferralDocument | null>(null);

  const [edit, setEdit] = useState<ReferralDocument | null>(null);
  const [undo, setUndo] = useState<ReferralDocument | null>(null);
  const [replacement, setReplacement] = useState<ReferralDocument | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingRoi, setEditingRoi] = useState<RoiRecord | null>(null);
  const [roiLoading, setRoiLoading] = useState<string | null>(null);
  const [roiError, setRoiError] = useState('');

  // A release's signed copy is edited through the release itself (facility,
  // phone, fax, dates), which also keeps this row's title in step.
  const openRelease = async (roiId: string) => {
    setNotice('');
    setRoiError('');
    setRoiLoading(roiId);
    try {
      const res = await authedFetch(`/api/fax/roi?referralId=${encodeURIComponent(referralId)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not open the release.');
      const roi = ((d.rois || []) as RoiRecord[]).find((r) => r.id === roiId);
      if (!roi) throw new Error('That release could not be found. Refresh and try again.');
      setEditingRoi(roi);
    } catch (e) {
      setRoiError(e instanceof Error ? e.message : 'Could not open the release.');
    } finally {
      setRoiLoading(null);
    }
  };
  const [openPpot, setOpenPpot] = useState<{ recipientName: string } | null>(null);

  useEffect(() => {
    let live = true;
    setEdit(null); setUndo(null); setReplacement(null); setPreview(null); setDocs(null); setError(null);
    const load = async () => {
      try {
        const res = await authedFetch(`/api/admin/referrals/${referralId}/documents`);
        const d = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) throw new Error(d.error || 'Could not load documents.');
        setDocs(d.documents ?? []);
        setOpenPpot(d.openPpot?.open ? { recipientName: String(d.openPpot.recipientName || '') } : null);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Could not load documents.');
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [referralId, refreshKey, reload]);

  if (docs === null && !error) return null;
  if (error) return <div style={{ ...emptyStyle, color: '#b3261e' }}>{error}</div>;
  // Uploads are for referrals; once the client record exists they go on the
  // client's Documents tab instead.
  const canUpload = !patientId;
  if ((!docs || docs.length === 0) && !canUpload) return null;

  return (
    <>
      <div style={titleRowStyle}>
        <div style={{ ...titleStyle, margin: 0 }}>Documents</div>
        {canUpload && (
          <button type="button" className={`${btn} ${btnSm}`} onClick={() => { setNotice(''); setUploading(true); }}>
            <FileUp size={14} /> Upload Document
          </button>
        )}
      </div>
      {notice && <div role="status" style={noticeStyle}>{notice}</div>}
      {roiError && <div role="alert" style={{ ...noticeStyle, color: '#b3261e', background: '#fdecea', borderColor: '#f5c2c0' }}>{roiError}</div>}
      {(!docs || docs.length === 0) && <div style={emptyStyle}>Nothing filed yet. Upload releases, records, or a signed Appendix T here.</div>}
      {docs && docs.length > 0 && <div style={listStyle}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button type="button" onClick={() => setPreview(d)} className={`${btn} ${btnSm}`} style={{ flexShrink: 0 }}>
              <Eye size={14} /> View
            </button>
            {!patientId && !d.patientDocumentId && <button type="button" className={`${btn} ${btnSm}`} onClick={() => { setNotice(''); setReplacement(d); }}>Replace PDF</button>}
            {!patientId && !d.patientDocumentId && (d.roiId
              ? <button type="button" className={`${btn} ${btnSm}`} disabled={roiLoading === d.roiId} onClick={() => void openRelease(d.roiId!)}>{roiLoading === d.roiId ? 'Opening…' : 'Edit Release'}</button>
              : <button type="button" className={`${btn} ${btnSm}`} onClick={() => { setNotice(''); setEdit(d); }}>Edit details</button>)}
            {!patientId && !d.patientDocumentId && d.kind === 'ppot' && <button type="button" className={`${btn} ${btnSm}`} onClick={() => { setNotice(''); setUndo(d); }}>Undo PPOT filing</button>}
            </div>
          </div>
        ))}
      </div>}
      {edit && <EditReferralDocumentModal key={`${edit.referralId}/${edit.id}`} document={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setPreview(null); setNotice('Document details updated.'); setReload((n) => n + 1); }} />}
      {undo && <UndoReferralPpotModal key={undo.referralId} document={undo} onClose={() => setUndo(null)} onSaved={() => { setUndo(null); setPreview(null); setNotice('PPOT filing undone. The PDF is now a regular document, and the request is waiting on the physician again.'); setReload((n) => n + 1); }} />}
      {replacement && <ReplaceReferralDocumentModal key={`${replacement.referralId}/${replacement.id}`} document={replacement} onClose={() => setReplacement(null)} onSaved={() => { setReplacement(null); setPreview(null); setNotice('PDF replaced. The corrected copy is ready to view.'); setReload((n) => n + 1); }} />}
      {editingRoi && (
        <EditRoiModal
          roi={editingRoi}
          today={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}
          onClose={() => setEditingRoi(null)}
          onSaved={(roi, changed) => {
            setEditingRoi(null);
            setNotice(changed ? `The release with ${roi.facility.name} is updated.` : 'Nothing changed.');
            setReload((n) => n + 1);
          }}
        />
      )}
      {uploading && (
        <UploadReferralDocumentModal
          referralId={referralId}
          openPpot={openPpot}
          onClose={() => setUploading(false)}
          onSaved={(asPpot) => {
            setUploading(false);
            setNotice(asPpot ? 'Signed Appendix T filed. The PPOT request is marked received.' : 'Document uploaded. It moves to the client’s Documents when the client record is created.');
            setReload((n) => n + 1);
          }}
        />
      )}
      {preview && <PdfPreviewModal title={preview.title} url={`/api/admin/referrals/${referralId}/documents/${preview.id}/pdf`} onClose={() => setPreview(null)} />}
    </>
  );
}

const titleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '22px 0 10px' };
const noticeStyle: React.CSSProperties = { fontSize: 13, color: '#1e7e34', background: '#e6f4ea', border: '1px solid #b7dfc1', borderRadius: 8, padding: '8px 10px', marginBottom: 10 };
const titleStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5c6b7a', margin: '22px 0 10px' };
const listStyle: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f1f5f9', background: 'white' };
const metaStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 2 };
const ppotBadgeStyle: React.CSSProperties = { display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#1a3a5c', background: '#e8f0f8', borderRadius: 999, padding: '1px 8px', marginBottom: 3 };
const emptyStyle: React.CSSProperties = { fontSize: 13, color: '#7f8c8d', padding: '8px 0' };
