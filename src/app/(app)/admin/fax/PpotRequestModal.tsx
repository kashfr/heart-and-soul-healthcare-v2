'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Search, Send, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { formatUSFaxNumber, normalizeUSFaxNumber } from '@/lib/verbalOrderShared';
import type { OutboundFax } from '@/lib/faxShared';
import {
  defaultPpotNote,
  PPOT_REQUEST_LABEL,
  validatePpotSendInput,
  type PpotRequestType,
  type PpotSendField,
  type PpotSubject,
} from '@/lib/ppotShared';

// "Request a PPOT": pick the member (an open referral for a new case, a
// client for a recertification), confirm the physician's fax, and send the
// BLANK Appendix T behind a cover sheet that identifies the member. The form
// itself is never filled in: the GAPP manual (913.3) says providers cannot
// complete the PPOT; the physician does.

export type PpotSubjectRow = PpotSubject & {
  lastRequest: { date: string; requestType: PpotRequestType; byName: string } | null;
  recert: { due: boolean; daysLeft: number | null; requestedThisCycle: boolean } | null;
};

const FIELD_ORDER: readonly PpotSendField[] = ['subject', 'requestType', 'medicaidId', 'recipientName', 'toNumber', 'confirmNumber', 'note'];
const fieldId = (k: PpotSendField) => `ppot-${k}`;

export function subjectLabel(s: PpotSubject): string {
  return s.kind === 'referral' ? 'Referral' : 'Client';
}

export default function PpotRequestModal({
  subjects,
  initial,
  onClose,
  onSent,
}: {
  subjects: PpotSubjectRow[];
  initial: PpotSubjectRow | null;
  onClose: () => void;
  onSent: (fax: OutboundFax, ok: boolean) => void;
}) {
  const [subject, setSubject] = useState<PpotSubjectRow | null>(initial);
  const [q, setQ] = useState('');
  const [requestType, setRequestType] = useState<PpotRequestType | ''>(initial ? (initial.kind === 'client' ? 'recert' : 'new') : '');
  const [medicaidId, setMedicaidId] = useState('');
  const [recipientName, setRecipientName] = useState(initial?.physicianName || '');
  const [recipientOrg, setRecipientOrg] = useState(initial?.physicianOffice || '');
  const [toNumber, setToNumber] = useState(initial?.physicianFax ? formatUSFaxNumber(initial.physicianFax) : '');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PpotSendField, string>>>({});
  const clear = (k: PpotSendField) => {
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const needle = q.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle.length < 2
        ? []
        : subjects.filter((s) => `${s.name} ${s.dob} ${s.medicaidId}`.toLowerCase().includes(needle)).slice(0, 8),
    [subjects, needle],
  );

  const choose = (s: PpotSubjectRow) => {
    setSubject(s);
    setQ('');
    clear('subject');
    setRequestType(s.kind === 'client' ? 'recert' : 'new');
    setMedicaidId('');
    setRecipientName(s.physicianName || '');
    setRecipientOrg(s.physicianOffice || '');
    setToNumber(s.physicianFax ? formatUSFaxNumber(s.physicianFax) : '');
    setConfirmNumber('');
  };

  const hasMedicaid = !!(subject?.medicaidId || medicaidId.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const input = {
      subjectKind: subject?.kind,
      subjectId: subject?.id || '',
      requestType: requestType || undefined,
      recipientName,
      recipientOrg,
      toNumber,
      confirmNumber,
      medicaidId: subject?.medicaidId ? '' : medicaidId,
      note,
    };
    if (!applyFieldErrors(validatePpotSendInput(input), FIELD_ORDER, setFieldErrors, fieldId)) return;
    if (!confirm(`Fax the Appendix T request for ${subject!.name} to ${recipientName.trim()} at ${formatUSFaxNumber(normalizeUSFaxNumber(toNumber))}?`)) return;
    setBusy(true);
    try {
      const res = await authedFetch('/api/fax/ppot', { method: 'POST', body: JSON.stringify(input) });
      const data = await res.json().catch(() => ({}));
      if (data.fax) onSent(data.fax, res.ok);
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length > 0) applyFieldErrors(data.fields, FIELD_ORDER, setFieldErrors, fieldId);
        else setErr(data.error || `Request failed (${res.status}).`);
        return;
      }
      onClose();
    } catch (e2) {
      setErr(e2 instanceof Error && e2.message ? e2.message : 'Could not send the request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ppot-title">
        <div style={modalHeaderStyle}>
          <strong id="ppot-title" style={{ fontSize: 16, color: '#1a3a5c' }}>Request a Plan of Treatment (Appendix T)</strong>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 }}>
              The physician gets a cover sheet naming the member and the <strong>blank</strong> Appendix T to complete,
              sign, and fax back. Nothing is filled in on the form itself (GAPP manual 913.3).{' '}
              <a href="/forms/gapp-appendix-t.pdf" target="_blank" rel="noopener" style={{ color: '#1a3a5c', fontWeight: 600 }}>
                See the form <ExternalLink size={12} style={{ verticalAlign: -1 }} />
              </a>
            </p>

            <div style={fieldStyle} id={fieldId('subject')}>
              <span style={fieldLabelStyle}>Member</span>
              {subject ? (
                <div style={subjectCardStyle}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{subject.name}</div>
                    <div style={metaStyle}>
                      {subjectLabel(subject)}
                      {subject.dob ? ` · DOB ${subject.dob}` : ''}
                      {subject.medicaidId ? ` · Medicaid ${subject.medicaidId}` : ' · no Medicaid ID on file'}
                    </div>
                  </div>
                  {!initial && (
                    <button type="button" onClick={() => setSubject(null)} style={linkBtnStyle}>Change</button>
                  )}
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ ...searchWrapStyle, ...(fieldErrors.subject ? FIELD_ERROR_STYLE : null) }}>
                    <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a referral or client by name, DOB, or Medicaid ID" style={searchInputStyle} autoFocus />
                  </div>
                  {matches.length > 0 && (
                    <div style={resultsStyle} role="listbox">
                      {matches.map((s) => (
                        <button type="button" key={`${s.kind}:${s.id}`} onClick={() => choose(s)} style={resultStyle}>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span style={metaStyle}>
                            {subjectLabel(s)}{s.dob ? ` · DOB ${s.dob}` : ''}{s.medicaidId ? ` · Medicaid ${s.medicaidId}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {needle.length >= 2 && matches.length === 0 && <div style={{ ...metaStyle, marginTop: 6 }}>No open referral or client matches.</div>}
                </div>
              )}
              <FieldError message={fieldErrors.subject} />
            </div>

            {subject && !subject.medicaidId && (
              <label style={fieldStyle} id={fieldId('medicaidId')}>
                <span style={fieldLabelStyle}>Medicaid ID <span style={{ fontWeight: 400 }}>(optional: leave blank and the office fills it in on the form)</span></span>
                <input value={medicaidId} maxLength={24} onChange={(e) => { setMedicaidId(e.target.value); clear('medicaidId'); }} style={{ ...inp, ...(fieldErrors.medicaidId ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.medicaidId} placeholder="From the member's Medicaid card" />
                <FieldError message={fieldErrors.medicaidId} />
              </label>
            )}

            <div style={fieldStyle} id={fieldId('requestType')}>
              <span style={fieldLabelStyle}>Request type</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...(fieldErrors.requestType ? { ...FIELD_ERROR_STYLE, borderRadius: 8, padding: 6 } : null) }}>
                {(['new', 'recert'] as const).map((t) => (
                  <label key={t} style={{ ...chipStyle, ...(requestType === t ? chipOnStyle : null) }}>
                    <input type="radio" name="ppot-type" checked={requestType === t} onChange={() => { setRequestType(t); clear('requestType'); }} style={{ margin: 0 }} />
                    {PPOT_REQUEST_LABEL[t]}
                  </label>
                ))}
              </div>
              <FieldError message={fieldErrors.requestType} />
            </div>

            <div style={twoColStyle}>
              <label style={fieldStyle} id={fieldId('recipientName')}>
                <span style={fieldLabelStyle}>Physician</span>
                <input value={recipientName} maxLength={80} onChange={(e) => { setRecipientName(e.target.value); clear('recipientName'); }} style={{ ...inp, ...(fieldErrors.recipientName ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.recipientName} placeholder="e.g. Dr. Anita Patel" />
                <FieldError message={fieldErrors.recipientName} />
              </label>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Office <span style={{ fontWeight: 400 }}>(optional)</span></span>
                <input value={recipientOrg} maxLength={80} onChange={(e) => setRecipientOrg(e.target.value)} style={inp} placeholder="e.g. Peachtree Pediatrics" />
              </label>
            </div>
            <div style={twoColStyle}>
              <label style={fieldStyle} id={fieldId('toNumber')}>
                <span style={fieldLabelStyle}>Physician fax{subject?.physicianFax ? ' (from the record)' : ''}</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={toNumber} onChange={(e) => { setToNumber(e.target.value); clear('toNumber'); clear('confirmNumber'); }} style={{ ...inp, ...(fieldErrors.toNumber ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.toNumber} placeholder="(404) 555-0101" />
                <FieldError message={fieldErrors.toNumber} />
              </label>
              <label style={fieldStyle} id={fieldId('confirmNumber')}>
                <span style={fieldLabelStyle}>Type it again</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={confirmNumber} onChange={(e) => { setConfirmNumber(e.target.value); clear('confirmNumber'); }} onPaste={(e) => e.preventDefault()} style={{ ...inp, ...(fieldErrors.confirmNumber ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.confirmNumber} placeholder="Retype, don't paste" />
                <FieldError message={fieldErrors.confirmNumber} />
              </label>
            </div>

            <label style={fieldStyle} id={fieldId('note')}>
              <span style={fieldLabelStyle}>Message <span style={{ fontWeight: 400 }}>(optional: a standard request is used when blank)</span></span>
              <textarea value={note} maxLength={1200} onChange={(e) => { setNote(e.target.value); clear('note'); }} style={{ ...inp, minHeight: 72, resize: 'vertical', ...(fieldErrors.note ? FIELD_ERROR_STYLE : null) }} placeholder={requestType ? defaultPpotNote(requestType, hasMedicaid) : 'Choose the request type to see the standard message.'} />
              <FieldError message={fieldErrors.note} />
            </label>

            {subject?.lastRequest && (
              <div style={infoStyle}>
                <FileText size={14} style={{ flexShrink: 0 }} />
                Last request for {subject.name}: {PPOT_REQUEST_LABEL[subject.lastRequest.requestType].toLowerCase()} on {formatDateUS(subject.lastRequest.date)}
                {subject.lastRequest.byName ? ` by ${subject.lastRequest.byName}` : ''}.
              </div>
            )}
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={modalFooterStyle}>
            <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={busy}>
              <Send size={14} /> {busy ? 'Sending…' : 'Fax the request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const modalFooterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#1a3a5c', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px' };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827', minWidth: 0 };
const resultsStyle: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2, maxHeight: 280, overflowY: 'auto' };
const resultStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '9px 12px', background: 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: '#111827', textAlign: 'left' };
const subjectCardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #cfe0f1', background: '#f3f8fd', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1f2937' };
const chipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151', background: 'white' };
const chipOnStyle: React.CSSProperties = { borderColor: '#1a3a5c', background: '#eef4fb', color: '#1a3a5c', fontWeight: 600 };
const infoStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#5c6b7a' };
