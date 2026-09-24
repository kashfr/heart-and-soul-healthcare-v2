'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Eye, FileSignature, FileUp, RefreshCw, RotateCw, Search, Send, X } from 'lucide-react';
import PpotRequestModal, { type PpotSubjectRow } from './PpotRequestModal';
import { formatDateUS } from '@/lib/dateFormat';
import { PPOT_REQUEST_LABEL } from '@/lib/ppotShared';
import { authedFetch } from '@/lib/authedFetch';
import { useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { formatUSFaxNumber, normalizeUSFaxNumber } from '@/lib/verbalOrderShared';
import {
  canUseFax,
  FAX_MAX_PDF_BYTES,
  FAX_TEXT_MAX,
  faxDeliveryState,
  validateFaxSendInput,
  type FaxSendField,
  type OutboundFax,
} from '@/lib/faxShared';

// Fax Center: send a PDF to a fax number through SRFax (with a cover sheet)
// and watch it go out. Stage 1 of physician paperwork by fax; PPOT requests
// build on this. The outbox is shared: everyone with access sees every fax,
// so the office can pick up a failed send whoever started it.

const SEND_FIELD_ORDER: readonly FaxSendField[] = ['recipientName', 'toNumber', 'confirmNumber', 'regarding', 'note', 'file'];
const sendFieldId = (k: FaxSendField) => `fax-send-${k}`;

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function FaxCenterPage() {
  const { uid, role } = useEffectiveUser();
  const { settings, ready } = useSettings();
  const allowed = canUseFax(settings.fax, uid, role);

  const [faxes, setFaxes] = useState<OutboundFax[]>([]);
  const [configured, setConfigured] = useState(true);
  const [returnFax, setReturnFax] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ppotSubjects, setPpotSubjects] = useState<PpotSubjectRow[]>([]);
  const [recertLeadDays, setRecertLeadDays] = useState(45);
  const [ppotOpen, setPpotOpen] = useState<{ initial: PpotSubjectRow | null } | null>(null);
  const deepLinkDone = useRef(false);

  const loadPpot = useCallback(async () => {
    try {
      const res = await authedFetch('/api/fax/ppot');
      if (!res.ok) return;
      const data = await res.json();
      setPpotSubjects(data.subjects ?? []);
      if (typeof data.recertLeadDays === 'number') setRecertLeadDays(data.recertLeadDays);
    } catch {
      // The outbox still works; the PPOT picker just has nothing to offer.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/fax');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setFaxes(data.faxes ?? []);
      setConfigured(data.configured !== false);
      setReturnFax(String(data.returnFax || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the outbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && allowed) {
      void load();
      void loadPpot();
    }
  }, [ready, allowed, load, loadPpot]);

  // /admin/fax?ppot=client:<id> (the recertification bell) or
  // ?ppot=referral:<id> (the referral card) opens the request for that member.
  useEffect(() => {
    if (deepLinkDone.current || ppotSubjects.length === 0) return;
    const want = new URLSearchParams(window.location.search).get('ppot') || '';
    deepLinkDone.current = true;
    if (!want) return;
    const [kind, id] = want.split(':');
    const hit = ppotSubjects.find((x) => x.kind === kind && x.id === id);
    if (hit) setPpotOpen({ initial: hit });
    window.history.replaceState(null, '', window.location.pathname);
  }, [ppotSubjects]);

  const recertDue = useMemo(
    () =>
      ppotSubjects
        .filter((x) => x.recert?.due)
        .sort((a, b) => (a.recert?.daysLeft ?? 0) - (b.recert?.daysLeft ?? 0)),
    [ppotSubjects],
  );

  // While anything is still going out, check back every 30 seconds.
  const anySending = faxes.some((f) => f.faxDetailsId && faxDeliveryState(f.sentStatus) === 'sending');
  useEffect(() => {
    if (!anySending) return;
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [anySending, load]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      faxes.filter(
        (f) =>
          !needle ||
          `${f.recipientName} ${f.recipientOrg} ${f.regarding} ${f.toNumber} ${formatUSFaxNumber(f.toNumber)} ${f.sentByName} ${f.fileName}`
            .toLowerCase()
            .includes(needle),
      ),
    [faxes, needle],
  );

  const view = async (f: OutboundFax) => {
    setBusyId(f.id);
    try {
      const res = await authedFetch(`/api/fax/${f.id}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open the fax.');
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (f: OutboundFax) => {
    if (!confirm(`Resend this fax to ${formatUSFaxNumber(f.toNumber)} (${f.recipientName})?`)) return;
    setBusyId(f.id);
    try {
      const res = await authedFetch(`/api/fax/${f.id}/retry`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (data.fax) setFaxes((prev) => prev.map((x) => (x.id === f.id ? data.fax : x)));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not resend the fax.');
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return <div style={containerStyle}><div style={wrapStyle}><div style={emptyStyle}>Loading…</div></div></div>;

  if (!allowed) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={emptyStyle}>
            <strong>{settings.fax.enabled ? 'You do not have Fax Center access.' : 'The Fax Center is turned off.'}</strong>
            <div style={{ marginTop: 6 }}>
              {role === 'admin'
                ? 'Turn it on under Settings, Fax Center.'
                : 'Ask an admin to give you access under Settings, Fax Center.'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Office</p>
            <h1 style={titleStyle}>Fax Center</h1>
            <p style={subtitleStyle}>
              Fax a PDF to a physician&apos;s office or anyone else, with a cover sheet, and see when it goes
              through. Replies come back to {returnFax ? formatUSFaxNumber(returnFax) : 'the portal fax line'}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={load} style={ghostBtnStyle} title="Refresh">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={() => setComposing(true)} style={ghostBtnStyle} disabled={!configured}>
              <Send size={15} /> Send a fax
            </button>
            <button onClick={() => setPpotOpen({ initial: null })} style={primaryBtnStyle} disabled={!configured}>
              <FileSignature size={15} /> Request a PPOT
            </button>
          </div>
        </header>

        {!configured && !loading && (
          <div role="alert" style={warnBannerStyle}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            The portal&apos;s fax service is not set up yet, so faxes can&apos;t be sent from here. Ask the admin to
            finish the SRFax setup.
          </div>
        )}

        {recertDue.length > 0 && (
          <section style={{ marginBottom: 22 }}>
            <h2 style={sectionTitleStyle}>
              <CalendarClock size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
              Recertifications due ({recertDue.length})
            </h2>
            <p style={{ ...metaStyle, margin: '0 0 10px' }}>
              GAPP clients whose authorization ends within {recertLeadDays} days and who have no Appendix T request yet this cycle.
            </p>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <tbody>
                  {recertDue.map((c) => (
                    <tr key={c.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={metaStyle}>{c.physicianName ? `Physician: ${c.physicianName}` : 'No physician on file'}{c.physicianFax ? ` · fax ${formatUSFaxNumber(c.physicianFax)}` : ''}</div>
                      </td>
                      <td style={tdStyle}>
                        Authorization ends {formatDateUS(c.authEnd)}
                        <div style={{ ...metaStyle, color: (c.recert?.daysLeft ?? 0) <= 14 ? '#b3261e' : '#7f8c8d', fontWeight: (c.recert?.daysLeft ?? 0) <= 14 ? 700 : 400 }}>
                          {(c.recert?.daysLeft ?? 0) >= 0 ? `${c.recert?.daysLeft} day${c.recert?.daysLeft === 1 ? '' : 's'} left` : `ended ${-(c.recert?.daysLeft ?? 0)} days ago`}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button onClick={() => setPpotOpen({ initial: c })} style={ghostBtnStyle} disabled={!configured}>
                          <FileSignature size={14} /> Request PPOT
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={searchWrapStyle}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient, number, regarding, sender…" style={searchInputStyle} />
            {q && (
              <button onClick={() => setQ('')} style={searchClearStyle} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {loading && faxes.length === 0 ? (
          <div style={emptyStyle}>Loading…</div>
        ) : error ? (
          <div style={{ ...emptyStyle, color: '#b3261e' }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={load} style={ghostBtnStyle}>Try again</button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div style={emptyStyle}>{q ? 'No faxes match your search.' : 'Nothing sent yet. Use Send a fax to get started.'}</div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>To</th>
                  <th style={thStyle}>Regarding</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Sent by</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}> </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => {
                  const state = faxDeliveryState(f.sentStatus);
                  return (
                    <tr key={f.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{f.recipientName}</div>
                        <div style={metaStyle}>{[f.recipientOrg, formatUSFaxNumber(f.toNumber)].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={tdStyle}>
                        {f.kind === 'ppot' && f.ppot && (
                          <div style={ppotTagStyle}>PPOT request · {PPOT_REQUEST_LABEL[f.ppot.requestType]}</div>
                        )}
                        {f.regarding || <span style={{ color: '#94a3b8' }}>None</span>}
                        <div style={metaStyle}>
                          {f.fileName} · {f.pages} page{f.pages === 1 ? '' : 's'}{f.includeCover ? ' with cover' : ''}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <StatusPill state={state} />
                        <div style={metaStyle}>
                          {state === 'sent' ? fmtDateTime(f.sentAt) : state === 'failed' ? f.error : fmtDateTime(f.queuedAt || f.createdAt)}
                        </div>
                        {f.attempts > 1 && <div style={metaStyle}>{f.attempts} attempts</div>}
                      </td>
                      <td style={tdStyle}>
                        {f.sentByName || 'Staff'}
                        <div style={metaStyle}>{fmtDateTime(f.createdAt)}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => view(f)} style={ghostBtnStyle} disabled={busyId === f.id} title="Open the PDF that was faxed">
                          <Eye size={14} /> View
                        </button>
                        {state === 'failed' && (
                          <button onClick={() => retry(f)} style={{ ...ghostBtnStyle, marginLeft: 6 }} disabled={busyId === f.id || !configured}>
                            <RotateCw size={14} /> Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ppotOpen && (
        <PpotRequestModal
          subjects={ppotSubjects}
          initial={ppotOpen.initial}
          onClose={() => setPpotOpen(null)}
          onSent={(fax) => {
            setFaxes((prev) => [fax, ...prev.filter((x) => x.id !== fax.id)]);
            void loadPpot();
          }}
        />
      )}

      {composing && (
        <SendModal
          onClose={() => setComposing(false)}
          onSent={(fax) => {
            setFaxes((prev) => [fax, ...prev.filter((x) => x.id !== fax.id)]);
          }}
          onDone={() => setComposing(false)}
        />
      )}
    </div>
  );
}

function StatusPill({ state }: { state: 'sending' | 'sent' | 'failed' }) {
  const map = {
    sending: { bg: '#fef7e0', fg: '#8a5a00', icon: <Clock size={13} />, label: 'Sending' },
    sent: { bg: '#e6f4ea', fg: '#1e7e34', icon: <CheckCircle2 size={13} />, label: 'Delivered' },
    failed: { bg: '#fdecea', fg: '#b3261e', icon: <AlertTriangle size={13} />, label: 'Failed' },
  }[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: map.bg, color: map.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 }}>
      {map.icon} {map.label}
    </span>
  );
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

function SendModal({ onClose, onSent, onDone }: { onClose: () => void; onSent: (fax: OutboundFax) => void; onDone: () => void }) {
  const [recipientName, setRecipientName] = useState('');
  const [recipientOrg, setRecipientOrg] = useState('');
  const [toNumber, setToNumber] = useState('');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [regarding, setRegarding] = useState('');
  const [note, setNote] = useState('');
  const [includeCover, setIncludeCover] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FaxSendField, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const clearFieldError = (k: FaxSendField) => {
    if (fieldErrors[k]) setFieldErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const pickFile = (f: File | null) => {
    clearFieldError('file');
    if (!f) return setFile(null);
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      setFile(null);
      setFieldErrors((prev) => ({ ...prev, file: 'Choose a PDF. Scan or print other documents to PDF first.' }));
      return;
    }
    if (f.size > FAX_MAX_PDF_BYTES) {
      setFile(null);
      setFieldErrors((prev) => ({ ...prev, file: 'That file is too large to fax. Keep it under 10 MB.' }));
      return;
    }
    setFile(f);
  };

  const to = normalizeUSFaxNumber(toNumber);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const input = { recipientName, recipientOrg, toNumber, confirmNumber, regarding, note, includeCover };
    if (!applyFieldErrors(validateFaxSendInput(input, !!file), SEND_FIELD_ORDER, setFieldErrors, sendFieldId)) return;
    if (!confirm(`Fax "${file!.name}" to ${recipientName.trim()} at ${formatUSFaxNumber(to)}?`)) return;
    setBusy(true);
    try {
      const pdfBase64 = await readAsBase64(file!);
      const res = await authedFetch('/api/fax', {
        method: 'POST',
        body: JSON.stringify({ ...input, fileName: file!.name, pdfBase64 }),
      });
      const data = await res.json().catch(() => ({}));
      // A failed attempt is still recorded (with a Resend button), so show it.
      if (data.fax) onSent(data.fax);
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length > 0) {
          applyFieldErrors(data.fields, SEND_FIELD_ORDER, setFieldErrors, sendFieldId);
        } else {
          setErr(data.error || `Request failed (${res.status}).`);
        }
        return;
      }
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error && e2.message ? e2.message : 'Could not send the fax. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fax-send-title">
        <div style={modalHeaderStyle}>
          <strong id="fax-send-title" style={{ fontSize: 16, color: '#1a3a5c' }}>Send a fax</strong>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <div style={twoColStyle}>
              <label style={fieldStyle} id={sendFieldId('recipientName')}>
                <span style={fieldLabelStyle}>To</span>
                <input value={recipientName} maxLength={FAX_TEXT_MAX.recipientName} onChange={(e) => { setRecipientName(e.target.value); clearFieldError('recipientName'); }} style={{ ...inp, ...(fieldErrors.recipientName ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.recipientName} placeholder="e.g. Dr. Anita Patel" autoFocus />
                <FieldError message={fieldErrors.recipientName} />
              </label>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Office <span style={{ fontWeight: 400 }}>(optional)</span></span>
                <input value={recipientOrg} maxLength={FAX_TEXT_MAX.recipientOrg} onChange={(e) => setRecipientOrg(e.target.value)} style={inp} placeholder="e.g. Peachtree Pediatrics" />
              </label>
            </div>
            <div style={twoColStyle}>
              <label style={fieldStyle} id={sendFieldId('toNumber')}>
                <span style={fieldLabelStyle}>Fax number</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={toNumber} onChange={(e) => { setToNumber(e.target.value); clearFieldError('toNumber'); clearFieldError('confirmNumber'); }} style={{ ...inp, ...(fieldErrors.toNumber ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.toNumber} placeholder="(404) 555-0100" />
                <FieldError message={fieldErrors.toNumber} />
              </label>
              <label style={fieldStyle} id={sendFieldId('confirmNumber')}>
                <span style={fieldLabelStyle}>Type it again</span>
                <input type="tel" inputMode="tel" autoComplete="off" value={confirmNumber} onChange={(e) => { setConfirmNumber(e.target.value); clearFieldError('confirmNumber'); }} onPaste={(e) => e.preventDefault()} style={{ ...inp, ...(fieldErrors.confirmNumber ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.confirmNumber} placeholder="Retype, don't paste" />
                <FieldError message={fieldErrors.confirmNumber} />
              </label>
            </div>
            <p style={hintStyle}>
              A fax to the wrong number can expose a client&apos;s records, so the number has to be typed twice.
            </p>
            <label style={fieldStyle} id={sendFieldId('regarding')}>
              <span style={fieldLabelStyle}>Regarding <span style={{ fontWeight: 400 }}>(printed on the cover sheet)</span></span>
              <input value={regarding} maxLength={FAX_TEXT_MAX.regarding} onChange={(e) => { setRegarding(e.target.value); clearFieldError('regarding'); }} style={{ ...inp, ...(fieldErrors.regarding ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.regarding} placeholder="e.g. Jane Doe, DOB 01/02/2015, Medicaid 123456789012" />
              <FieldError message={fieldErrors.regarding} />
            </label>
            <label style={fieldStyle} id={sendFieldId('note')}>
              <span style={fieldLabelStyle}>Message <span style={{ fontWeight: 400 }}>(optional)</span></span>
              <textarea value={note} maxLength={FAX_TEXT_MAX.note} onChange={(e) => { setNote(e.target.value); clearFieldError('note'); }} style={{ ...inp, minHeight: 80, resize: 'vertical', ...(fieldErrors.note ? FIELD_ERROR_STYLE : null) }} aria-invalid={!!fieldErrors.note} placeholder="e.g. Please complete and sign the attached Appendix T and fax it back with any supporting office notes." />
              <FieldError message={fieldErrors.note} />
            </label>
            <div style={fieldStyle} id={sendFieldId('file')}>
              <span style={fieldLabelStyle}>Document (PDF, up to 10 MB)</span>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => fileRef.current?.click()} style={{ ...dropStyle, ...(fieldErrors.file ? FIELD_ERROR_STYLE : null) }}>
                <FileUp size={16} />
                {file ? <span><strong>{file.name}</strong> <span style={{ color: '#7f8c8d' }}>({(file.size / 1024 / 1024).toFixed(1)} MB) · change</span></span> : 'Choose a PDF'}
              </button>
              <FieldError message={fieldErrors.file} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} />
              Add a cover sheet with the confidentiality notice (recommended)
            </label>
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={modalFooterStyle}>
            <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={busy}>
              <Send size={14} /> {busy ? 'Sending…' : 'Send fax'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Visual language shared with the other admin list pages (see admin/edwp-consents).
const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = { marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' };
const kickerStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: React.CSSProperties = { fontSize: 32, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6, maxWidth: 620 };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const warnBannerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#fef7e0', border: '1px solid #f3d27a', color: '#6b4a00', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', maxWidth: 360 };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827' };
const searchClearStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '60px 24px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, color: '#5c6b7a', fontSize: 14 };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' };
const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#2c3e50', margin: '0 0 4px' };
const ppotTagStyle: React.CSSProperties = { display: 'inline-block', fontSize: 11.5, fontWeight: 700, color: '#1a3a5c', background: '#eef4fb', border: '1px solid #cfe0f1', borderRadius: 999, padding: '1px 8px', marginBottom: 4 };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const modalFooterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const twoColStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const hintStyle: React.CSSProperties = { margin: '-6px 0 0', fontSize: 12.5, color: '#7f8c8d' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
const dropStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', boxSizing: 'border-box', border: '1px dashed #9ca3af', borderRadius: 8, padding: '12px 14px', fontSize: 14, fontFamily: 'inherit', color: '#374151', background: '#f9fafb', cursor: 'pointer', textAlign: 'left' };
