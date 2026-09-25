'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Eye, EyeOff, FileSignature, FileUp, Search, Send, ShieldCheck, Undo2, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { formatDateUS } from '@/lib/dateFormat';
import { formatUSPhone } from '@/lib/phone';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { formatUSFaxNumber, normalizeUSFaxNumber } from '@/lib/verbalOrderShared';
import { validateFaxSendInput, type FaxSendField, type OutboundFax } from '@/lib/faxShared';
import {
  DEFAULT_ROI_INFORMATION,
  defaultRoiFaxNote,
  defaultRoiPurpose,
  ROI_DIRECTION_LABEL,
  ROI_MAX_PDF_BYTES,
  ROI_TEXT_MAX,
  validateRoiInput,
  type RoiDirection,
  type RoiDuration,
  type RoiField,
  type RoiRecord,
} from '@/lib/roiShared';

// Releases of Information (DBHDD Attachment A, IDD version 6/22/2023): the
// office prepares the form here, downloads it and sends it to the guardian
// for signature (PandaDoc for now), uploads the signed copy (filed under the
// client's Documents), and faxes it to the facility behind a cover sheet and
// an introduction letter saying who we are and why they are getting it.

interface RoiClient {
  id: string;
  name: string;
  dob: string;
  program: string;
}

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

function daysUntil(ymd: string, today: string): number {
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export default function RoiSection({
  refreshKey,
  openRequest,
  faxConfigured,
  onFaxSent,
}: {
  /** Bumped by the page's Refresh button. */
  refreshKey: number;
  /** Bumped by the page's "Release of Information" button. */
  openRequest: number;
  faxConfigured: boolean;
  onFaxSent: (fax: OutboundFax) => void;
}) {
  const [rois, setRois] = useState<RoiRecord[]>([]);
  const [clients, setClients] = useState<RoiClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState<RoiRecord | null>(null);
  const [faxing, setFaxing] = useState<RoiRecord | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/fax/roi');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setRois(data.rois ?? []);
      setClients(data.clients ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load releases of information.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Open the dialog when the button is pressed, not on mount.
  const seenOpen = useRef(openRequest);
  useEffect(() => {
    if (openRequest !== seenOpen.current) {
      seenOpen.current = openRequest;
      setPreparing(true);
    }
  }, [openRequest]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const act = (r: RoiRecord, action: 'cancel' | 'hide' | 'unhide', question?: string) => {
    if (question && !confirm(question)) return;
    void run(r.id, async () => {
      const res = await authedFetch(`/api/fax/roi/${r.id}`, { method: 'POST', body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      await load();
    });
  };

  const today = todayET();
  const hiddenCount = rois.filter((r) => r.hidden).length;
  const shown = rois.filter((r) => showHidden || !r.hidden);

  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={sectionTitleStyle}>
          <ShieldCheck size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Releases of information{shown.length > 0 ? ` (${shown.length})` : ''}
        </h2>
        {hiddenCount > 0 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5c6b7a', cursor: 'pointer' }}>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Show removed ({hiddenCount})
          </label>
        )}
      </div>
      <p style={noteStyle}>
        Prepare the DBHDD authorization here, send it to the guardian for signature (download it and upload it to PandaDoc),
        then upload the signed copy. It is filed under the client&apos;s Documents, and you can fax it to the facility with an
        introduction letter.
      </p>
      {error && <div role="alert" style={{ ...noteStyle, color: '#b3261e' }}>{error}</div>}
      {notice && (
        <div role="status" style={noticeStyle}>
          <span style={{ flex: 1 }}>{notice}</span>
          <button onClick={() => setNotice(null)} style={closeBtnStyle} aria-label="Dismiss message"><X size={15} /></button>
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ ...tableWrapStyle, padding: '14px 16px', fontSize: 13.5, color: '#7f8c8d' }}>
          No releases yet. Use <strong>Release of Information</strong> at the top of the page to prepare one.
        </div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <tbody>
              {shown.map((r) => {
                const lastFax = r.faxes[r.faxes.length - 1];
                const left = r.signed?.expiresOn ? daysUntil(r.signed.expiresOn, today) : null;
                return (
                  <tr key={r.id} style={r.hidden ? { opacity: 0.6 } : undefined}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{r.memberName}</div>
                      <div style={metaStyle}>{r.facility.name} · {ROI_DIRECTION_LABEL[r.direction].toLowerCase()}</div>
                    </td>
                    <td style={tdStyle}>
                      {r.status === 'awaiting-signature' && (
                        <>
                          <span style={pill('#fef7e0', '#8a5a00')}>Waiting on signature</span>
                          <div style={metaStyle}>Prepared {r.createdAt ? formatDateUS(r.createdAt.slice(0, 10)) : ''}{r.createdByName ? ` by ${r.createdByName}` : ''}</div>
                        </>
                      )}
                      {r.status === 'signed' && r.signed && (
                        <>
                          <span style={pill('#e6f4ea', '#1e7e34')}>Signed {formatDateUS(r.signed.signedDate)}</span>
                          <div style={{ ...metaStyle, color: left !== null && left <= 30 ? '#b3261e' : '#7f8c8d', fontWeight: left !== null && left <= 30 ? 700 : 400 }}>
                            {r.signed.expiresOn
                              ? left !== null && left < 0
                                ? `Expired ${formatDateUS(r.signed.expiresOn)}`
                                : `Good through ${formatDateUS(r.signed.expiresOn)}`
                              : 'Good until services end'}
                          </div>
                        </>
                      )}
                      {r.status === 'cancelled' && <span style={pill('#f1f5f9', '#5c6b7a')}>Cancelled</span>}
                      {lastFax && (
                        <div style={metaStyle}>
                          Faxed to {lastFax.recipientName || r.facility.name} {formatDateUS(lastFax.at.slice(0, 10))}
                          {r.faxes.length > 1 ? ` (${r.faxes.length} times)` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.status === 'awaiting-signature' && (
                        <>
                          <button onClick={() => setPreview({ title: `Release to sign: ${r.memberName}, ${r.facility.name}`, url: `/api/fax/roi/${r.id}/form` })} style={ghostBtnStyle} title="See the prepared form, and download it to send for signature">
                            <Eye size={14} /> Form
                          </button>
                          <button onClick={() => setUploading(r)} style={{ ...ghostBtnStyle, marginLeft: 6 }}>
                            <FileUp size={14} /> Upload signed
                          </button>
                          <button onClick={() => act(r, 'cancel', `Cancel the release for ${r.memberName} with ${r.facility.name}? Use this if it won't be signed.`)} style={{ ...ghostBtnStyle, marginLeft: 6 }} disabled={busy === r.id}>
                            <Ban size={14} /> Cancel
                          </button>
                        </>
                      )}
                      {r.status === 'signed' && (
                        <>
                          <button onClick={() => setPreview({ title: `Signed release: ${r.memberName}, ${r.facility.name}`, url: `/api/fax/roi/${r.id}/signed` })} style={ghostBtnStyle}>
                            <Eye size={14} /> View
                          </button>
                          <button onClick={() => setFaxing(r)} style={{ ...primaryBtnStyle, marginLeft: 6 }} disabled={!faxConfigured}>
                            <Send size={14} /> Fax to facility
                          </button>
                          <button onClick={() => setUploading(r)} style={{ ...ghostBtnStyle, marginLeft: 6 }} title="Upload a corrected signed copy">
                            <FileUp size={14} /> Replace
                          </button>
                        </>
                      )}
                      {r.status !== 'awaiting-signature' &&
                        (r.hidden ? (
                          <button onClick={() => act(r, 'unhide')} style={{ ...ghostBtnStyle, marginLeft: 6 }} disabled={busy === r.id}>
                            <Undo2 size={14} /> Restore
                          </button>
                        ) : (
                          <button onClick={() => act(r, 'hide')} style={{ ...ghostBtnStyle, marginLeft: 6 }} disabled={busy === r.id} title="Take it off this list. The signed copy stays in the client's Documents.">
                            <EyeOff size={14} /> Remove
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preparing && (
        <PrepareModal
          clients={clients}
          onClose={() => setPreparing(false)}
          onCreated={async (roi) => {
            setPreparing(false);
            await load();
            // Show it right away so it can be checked before it goes out;
            // Download in the preview saves the copy for PandaDoc.
            setPreview({ title: `Release to sign: ${roi.memberName}, ${roi.facility.name}`, url: `/api/fax/roi/${roi.id}/form` });
            setNotice(`The release for ${roi.memberName} is ready. Check it, then use Download to save it for PandaDoc. In PandaDoc, add the guardian's initials, signature, printed name, date, and Guardian checkbox fields, and send it. When it comes back signed, use Upload signed. Form opens it again any time.`);
          }}
        />
      )}
      {uploading && (
        <UploadModal
          roi={uploading}
          today={today}
          onClose={() => setUploading(null)}
          onDone={async (roi) => {
            setUploading(null);
            await load();
            setNotice(`The signed release for ${roi.memberName} is filed under the client's Documents (Consent / Release). Use Fax to facility to send it with the introduction letter.`);
          }}
        />
      )}
      {preview && <PdfPreviewModal title={preview.title} url={preview.url} onClose={() => setPreview(null)} />}
      {faxing && (
        <FaxModal
          roi={faxing}
          onClose={() => setFaxing(null)}
          onSent={async (fax, ok) => {
            onFaxSent(fax);
            await load();
            if (ok) {
              setFaxing(null);
              setNotice(`Faxing the release for ${faxing.memberName} to ${faxing.facility.name}. Watch Sent faxes below for delivery.`);
            }
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

const PREP_ORDER: readonly RoiField[] = ['patientId', 'direction', 'facilityName', 'facilityAddress', 'facilityPhone', 'facilityFax', 'information', 'purpose', 'duration'];
const prepId = (k: RoiField) => `roi-${k}`;

function PrepareModal({ clients, onClose, onCreated }: { clients: RoiClient[]; onClose: () => void; onCreated: (roi: RoiRecord) => void }) {
  const [client, setClient] = useState<RoiClient | null>(null);
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<RoiDirection>('to-us');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [information, setInformation] = useState(DEFAULT_ROI_INFORMATION);
  const [purpose, setPurpose] = useState(defaultRoiPurpose(undefined));
  const [purposeEdited, setPurposeEdited] = useState(false);
  const [duration, setDuration] = useState<RoiDuration>('year');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RoiField, string>>>({});
  const clear = (k: RoiField) => fieldErrors[k] && setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => (needle.length < 2 ? [] : clients.filter((c) => `${c.name} ${c.dob}`.toLowerCase().includes(needle)).slice(0, 8)), [clients, needle]);

  const choose = (c: RoiClient) => {
    setClient(c);
    setQ('');
    clear('patientId');
    if (!purposeEdited) setPurpose(defaultRoiPurpose(c.program));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const body = { patientId: client?.id || '', direction, facility: { name, address, phone, fax }, information, purpose, duration };
    if (!applyFieldErrors(validateRoiInput(body).errors, PREP_ORDER, setFieldErrors, prepId)) return;
    setBusy(true);
    try {
      const res = await authedFetch('/api/fax/roi', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length > 0) applyFieldErrors(data.fields, PREP_ORDER, setFieldErrors, prepId);
        else setErr(data.error || `Request failed (${res.status}).`);
        return;
      }
      onCreated(data.roi);
    } catch (e2) {
      setErr(e2 instanceof Error && e2.message ? e2.message : 'Could not prepare the release.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Prepare a Release of Information" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate style={formStyle}>
        <div style={bodyStyle}>
          <p style={leadStyle}>
            Fills in the DBHDD Authorization for Release of Information (Attachment A, IDD version). The portal prints the
            client, who shares with whom, what, why, and for how long. The guardian initials, signs, prints their name,
            dates it, and checks Guardian.{' '}
            <a href="/forms/dbhdd-roi-attachment-a.pdf" target="_blank" rel="noopener" style={{ color: '#1a3a5c', fontWeight: 600 }}>See the blank form</a>
          </p>

          <div style={fieldStyle} id={prepId('patientId')}>
            <span style={labelStyle}>Client</span>
            {client ? (
              <div style={cardStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{client.name}</div>
                  <div style={metaStyle}>{client.dob ? `DOB ${client.dob}` : 'No DOB on file'}</div>
                </div>
                <button type="button" onClick={() => setClient(null)} style={linkBtnStyle}>Change</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ ...searchWrapStyle, ...(fieldErrors.patientId ? FIELD_ERROR_STYLE : null) }}>
                  <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a client by name or DOB" style={searchInputStyle} autoFocus />
                </div>
                {matches.length > 0 && (
                  <div style={resultsStyle} role="listbox">
                    {matches.map((c) => (
                      <button type="button" key={c.id} onClick={() => choose(c)} style={resultStyle}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={metaStyle}>{c.dob ? `DOB ${c.dob}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                {needle.length >= 2 && matches.length === 0 && <div style={{ ...metaStyle, marginTop: 6 }}>No client matches.</div>}
              </div>
            )}
            <FieldError message={fieldErrors.patientId} />
          </div>

          <div style={fieldStyle} id={prepId('direction')}>
            <span style={labelStyle}>Which way do the records go?</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['to-us', 'from-us', 'both'] as const).map((d) => (
                <label key={d} style={{ ...chipStyle, ...(direction === d ? chipOnStyle : null) }}>
                  <input type="radio" name="roi-direction" checked={direction === d} onChange={() => setDirection(d)} style={{ margin: 0 }} />
                  {ROI_DIRECTION_LABEL[d]}
                </label>
              ))}
            </div>
            <span style={hintStyle}>
              {direction === 'to-us'
                ? 'From: the facility. To: Heart and Soul. Use this when the facility needs permission to share with us.'
                : direction === 'from-us'
                  ? 'From: Heart and Soul. To: the facility. Use this when we will send our records to them.'
                  : 'Two copies in one PDF, one each way. The guardian signs both.'}
            </span>
          </div>

          <label style={fieldStyle} id={prepId('facilityName')}>
            <span style={labelStyle}>Facility or agency</span>
            <input value={name} maxLength={ROI_TEXT_MAX.name} onChange={(e) => { setName(e.target.value); clear('facilityName'); }} style={{ ...inp, ...(fieldErrors.facilityName ? FIELD_ERROR_STYLE : null) }} placeholder="e.g. Magnolia Manor Health and Rehabilitation" />
            <FieldError message={fieldErrors.facilityName} />
          </label>
          <label style={fieldStyle} id={prepId('facilityAddress')}>
            <span style={labelStyle}>Address <span style={{ fontWeight: 400 }}>(optional)</span></span>
            <input value={address} maxLength={ROI_TEXT_MAX.address} onChange={(e) => { setAddress(e.target.value); clear('facilityAddress'); }} style={{ ...inp, ...(fieldErrors.facilityAddress ? FIELD_ERROR_STYLE : null) }} placeholder="Street, city, state ZIP" />
            <FieldError message={fieldErrors.facilityAddress} />
          </label>
          <div style={twoColStyle}>
            <label style={fieldStyle} id={prepId('facilityPhone')}>
              <span style={labelStyle}>Phone <span style={{ fontWeight: 400 }}>(optional)</span></span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(formatUSPhone(e.target.value)); clear('facilityPhone'); }} style={{ ...inp, ...(fieldErrors.facilityPhone ? FIELD_ERROR_STYLE : null) }} placeholder="(404) 555-0101" />
              <FieldError message={fieldErrors.facilityPhone} />
            </label>
            <label style={fieldStyle} id={prepId('facilityFax')}>
              <span style={labelStyle}>Fax <span style={{ fontWeight: 400 }}>(optional)</span></span>
              <input type="tel" inputMode="tel" value={fax} onChange={(e) => { setFax(formatUSPhone(e.target.value)); clear('facilityFax'); }} style={{ ...inp, ...(fieldErrors.facilityFax ? FIELD_ERROR_STYLE : null) }} placeholder="(404) 555-0102" />
              <FieldError message={fieldErrors.facilityFax} />
            </label>
          </div>

          <label style={fieldStyle} id={prepId('information')}>
            <span style={labelStyle}>Information that may be shared</span>
            <textarea value={information} maxLength={ROI_TEXT_MAX.information} onChange={(e) => { setInformation(e.target.value); clear('information'); }} style={{ ...inp, minHeight: 64, resize: 'vertical', ...(fieldErrors.information ? FIELD_ERROR_STYLE : null) }} />
            <FieldError message={fieldErrors.information} />
          </label>
          <label style={fieldStyle} id={prepId('purpose')}>
            <span style={labelStyle}>Purpose</span>
            <textarea value={purpose} maxLength={ROI_TEXT_MAX.purpose} onChange={(e) => { setPurpose(e.target.value); setPurposeEdited(true); clear('purpose'); }} style={{ ...inp, minHeight: 48, resize: 'vertical', ...(fieldErrors.purpose ? FIELD_ERROR_STYLE : null) }} />
            <FieldError message={fieldErrors.purpose} />
          </label>
          <div style={fieldStyle} id={prepId('duration')}>
            <span style={labelStyle}>Good for</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['year', 'One (1) year'], ['transactions', 'Until services are complete']] as const).map(([d, label]) => (
                <label key={d} style={{ ...chipStyle, ...(duration === d ? chipOnStyle : null) }}>
                  <input type="radio" name="roi-duration" checked={duration === d} onChange={() => setDuration(d)} style={{ margin: 0 }} />
                  {label}
                </label>
              ))}
            </div>
            <span style={hintStyle}>One year is clearer for facilities, and the portal shows when it needs renewing.</span>
          </div>
          {err && <div role="alert" style={errStyle}>{err}</div>}
        </div>
        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={busy}>
            <FileSignature size={14} /> {busy ? 'Preparing…' : 'Prepare and preview'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({ roi, today, onClose, onDone }: { roi: RoiRecord; today: string; onClose: () => void; onDone: (roi: RoiRecord) => void }) {
  const [signedDate, setSignedDate] = useState(roi.signed?.signedDate || today);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!file) return setErr('Choose the signed PDF.');
    if (file.type && file.type !== 'application/pdf') return setErr('The signed copy must be a PDF.');
    if (file.size > ROI_MAX_PDF_BYTES) return setErr('That file is too large. Keep it under 10 MB.');
    if (!signedDate || signedDate > today) return setErr('Enter the date it was signed (today or earlier).');
    setBusy(true);
    setErr(null);
    try {
      const pdfBase64 = await readAsBase64(file);
      const res = await authedFetch(`/api/fax/roi/${roi.id}/signed`, { method: 'POST', body: JSON.stringify({ signedDate, pdfBase64 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onDone(data.roi);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not upload the signed copy.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Upload the signed release" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate style={formStyle}>
        <div style={bodyStyle}>
          <p style={leadStyle}>
            {roi.memberName}, {roi.facility.name}. Download the completed PDF from PandaDoc (or scan the paper copy) and check
            that every Initials line, the signature, printed name, date, and Guardian box are filled in. It is filed under the
            client&apos;s Documents (Consent / Release).
          </p>
          <label style={fieldStyle}>
            <span style={labelStyle}>Signed PDF</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => { setFile(e.target.files?.[0] || null); setErr(null); }} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Date signed</span>
            <input type="date" value={signedDate} max={today} onChange={(e) => { setSignedDate(e.target.value); setErr(null); }} style={{ ...inp, maxWidth: 200 }} />
            {roi.duration === 'year' && <span style={hintStyle}>It is good for one year from this date.</span>}
          </label>
          {err && <div role="alert" style={errStyle}>{err}</div>}
        </div>
        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={busy}>
            <FileUp size={14} /> {busy ? 'Uploading…' : 'File signed copy'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const FAX_ORDER: readonly FaxSendField[] = ['recipientName', 'toNumber', 'confirmNumber', 'note'];
const faxId = (k: FaxSendField) => `roi-fax-${k}`;

function FaxModal({ roi, onClose, onSent }: { roi: RoiRecord; onClose: () => void; onSent: (fax: OutboundFax, ok: boolean) => void }) {
  const [recipientName, setRecipientName] = useState(roi.facility.name);
  const [toNumber, setToNumber] = useState(roi.facility.fax ? formatUSFaxNumber(roi.facility.fax) : '');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FaxSendField, string>>>({});
  const clear = (k: FaxSendField) => fieldErrors[k] && setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const input = { recipientName, recipientOrg: '', toNumber, confirmNumber, regarding: '', note, includeCover: true };
    if (!applyFieldErrors(validateFaxSendInput(input, true), FAX_ORDER, setFieldErrors, faxId)) return;
    if (!confirm(`Fax the signed release for ${roi.memberName} to ${recipientName.trim()} at ${formatUSFaxNumber(normalizeUSFaxNumber(toNumber))}?`)) return;
    setBusy(true);
    try {
      const res = await authedFetch(`/api/fax/roi/${roi.id}/fax`, { method: 'POST', body: JSON.stringify({ recipientName, toNumber, confirmNumber, note }) });
      const data = await res.json().catch(() => ({}));
      if (data.fax) onSent(data.fax, res.ok);
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length > 0) applyFieldErrors(data.fields, FAX_ORDER, setFieldErrors, faxId);
        else setErr(data.error || `Request failed (${res.status}).`);
      }
    } catch (e2) {
      setErr(e2 instanceof Error && e2.message ? e2.message : 'Could not send the fax.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Fax the release to the facility" onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate style={formStyle}>
        <div style={bodyStyle}>
          <p style={leadStyle}>
            Sends three things to {roi.facility.name}: the cover sheet, a letter on our letterhead introducing Heart and Soul as{' '}
            {roi.memberName}&apos;s skilled nursing provider and explaining the release, and the signed form.
          </p>
          <label style={fieldStyle} id={faxId('recipientName')}>
            <span style={labelStyle}>Attention</span>
            <input value={recipientName} maxLength={80} onChange={(e) => { setRecipientName(e.target.value); clear('recipientName'); }} style={{ ...inp, ...(fieldErrors.recipientName ? FIELD_ERROR_STYLE : null) }} placeholder="e.g. Medical Records, or a person's name" />
            <FieldError message={fieldErrors.recipientName} />
          </label>
          <div style={twoColStyle}>
            <label style={fieldStyle} id={faxId('toNumber')}>
              <span style={labelStyle}>Fax number</span>
              <input type="tel" inputMode="tel" autoComplete="off" value={toNumber} onChange={(e) => { setToNumber(formatUSPhone(e.target.value)); clear('toNumber'); clear('confirmNumber'); }} style={{ ...inp, ...(fieldErrors.toNumber ? FIELD_ERROR_STYLE : null) }} placeholder="(404) 555-0102" />
              <FieldError message={fieldErrors.toNumber} />
            </label>
            <label style={fieldStyle} id={faxId('confirmNumber')}>
              <span style={labelStyle}>Type it again</span>
              <input type="tel" inputMode="tel" autoComplete="off" value={confirmNumber} onChange={(e) => { setConfirmNumber(formatUSPhone(e.target.value)); clear('confirmNumber'); }} onPaste={(e) => e.preventDefault()} style={{ ...inp, ...(fieldErrors.confirmNumber ? FIELD_ERROR_STYLE : null) }} placeholder="Retype, don't paste" />
              <FieldError message={fieldErrors.confirmNumber} />
            </label>
          </div>
          <label style={fieldStyle} id={faxId('note')}>
            <span style={labelStyle}>Cover sheet message <span style={{ fontWeight: 400 }}>(optional: a standard message is used when blank)</span></span>
            <textarea value={note} maxLength={1200} onChange={(e) => { setNote(e.target.value); clear('note'); }} style={{ ...inp, minHeight: 64, resize: 'vertical', ...(fieldErrors.note ? FIELD_ERROR_STYLE : null) }} placeholder={defaultRoiFaxNote(roi.memberName)} />
            <FieldError message={fieldErrors.note} />
          </label>
          {err && <div role="alert" style={errStyle}>{err}</div>}
        </div>
        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
          <button type="submit" style={primaryBtnStyle} disabled={busy}>
            <Send size={14} /> {busy ? 'Sending…' : 'Fax it'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div style={modalHeaderStyle}>
          <strong style={{ fontSize: 16, color: '#1a3a5c' }}>{title}</strong>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const pill = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', background: bg, color: fg, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 });
const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#2c3e50', margin: '0 0 4px' };
const noteStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: '0 0 10px' };
const noticeStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#1e7e34', background: '#e6f4ea', border: '1px solid #b7dfc1', borderRadius: 8, padding: '10px 12px', marginBottom: 10 };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#1a3a5c', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const formStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0 };
const bodyStyle: React.CSSProperties = { padding: 20, display: 'grid', gap: 14, overflowY: 'auto' };
const footerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const leadStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5 };
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', lineHeight: 1.45 };
const errStyle: React.CSSProperties = { color: '#b3261e', fontSize: 13, fontWeight: 600 };
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px' };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827', minWidth: 0 };
const resultsStyle: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2, maxHeight: 280, overflowY: 'auto' };
const resultStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', padding: '9px 12px', background: 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: '#111827', textAlign: 'left' };
const cardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #cfe0f1', background: '#f3f8fd', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#1f2937' };
const chipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#374151', background: 'white' };
const chipOnStyle: React.CSSProperties = { borderColor: '#1a3a5c', background: '#eef4fb', color: '#1a3a5c', fontWeight: 600 };
