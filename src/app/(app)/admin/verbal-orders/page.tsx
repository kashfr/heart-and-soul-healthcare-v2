'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Check, Clock, Download, Eye, FileSignature, Inbox, PhoneCall, Plus, RefreshCw, Send, X } from 'lucide-react';
import { useAuth, useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import {
  fetchInboundFaxPdf,
  fetchVerbalOrderPdf,
  getAllVerbalOrders,
  ignoreInboundFax,
  getMyVerbalOrders,
  getUnmatchedInboundFaxes,
  recordVerbalOrderSignedByOffice,
  resendVerbalOrderFax,
  type UnmatchedInboundFax,
  type VerbalOrder,
} from '@/lib/verbalOrders';
import { formatUSFaxNumber, verbalOrderAgeDays, verbalOrderStatusLabel, verbalOrderUrgency, type VerbalOrderUrgency } from '@/lib/verbalOrderShared';
import { formatDateUS } from '@/lib/dateFormat';
import { escortToField, FieldError, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';

/**
 * /admin/verbal-orders
 * Staff: the open queue (awaiting fax, awaiting signature, overdue) with
 * Resend and Record signature, the unmatched inbound faxes the sweep could
 * not tie to one order, and history. Nurse: the verbal orders she took.
 */
export default function VerbalOrdersPage() {
  return (
    <Suspense fallback={null}>
      <VerbalOrdersInner />
    </Suspense>
  );
}

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function VerbalOrdersInner() {
  const { user } = useAuth();
  const { uid: effectiveUid, role, isViewingAs } = useEffectiveUser();
  const { settings } = useSettings();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('vo');
  const isStaff = role === 'admin' || role === 'supervisor';
  const isNurse = role === 'nurse';

  const [orders, setOrders] = useState<VerbalOrder[] | null>(null);
  const [inbound, setInbound] = useState<UnmatchedInboundFax[]>([]);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [signModal, setSignModal] = useState<{ order: VerbalOrder; fax?: UnmatchedInboundFax } | null>(null);
  const [matchFax, setMatchFax] = useState<UnmatchedInboundFax | null>(null);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!role) return;
    const uid = isNurse ? effectiveUid : user?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const list = isStaff ? await getAllVerbalOrders() : await getMyVerbalOrders(uid);
        const faxes = isStaff ? await getUnmatchedInboundFaxes().catch(() => []) : [];
        if (cancelled) return;
        setOrders(list);
        setInbound(faxes);
        setError(false);
      } catch (err) {
        console.error('Verbal orders load failed:', err);
        if (cancelled) return;
        setError(true);
        setOrders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, isStaff, isNurse, effectiveUid, user?.uid, reloadKey]);

  useEffect(() => {
    if (!highlightId || !orders) return;
    document.getElementById(`vo-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, orders]);

  const thresholds = settings.verbalOrders;
  const today = todayISO();
  const visible = useMemo(() => {
    if (!orders) return [];
    if (filter === 'all') return orders;
    return orders.filter((o) => o.status !== 'signed' || o.id === highlightId);
  }, [orders, filter, highlightId]);
  const openCount = orders ? orders.filter((o) => o.status !== 'signed').length : 0;
  const overdueCount = orders ? orders.filter((o) => ['overdue', 'escalated'].includes(verbalOrderUrgency(o, today, thresholds))).length : 0;

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 3500);
  };

  const download = async (o: VerbalOrder) => {
    try {
      const blob = await fetchVerbalOrderPdf(o.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('The PDF could not be loaded.');
    }
  };

  const previewFax = async (f: UnmatchedInboundFax) => {
    try {
      const blob = await fetchInboundFaxPdf(f.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      showToast('The fax could not be loaded.');
    }
  };

  const dismissFax = async (f: UnmatchedInboundFax) => {
    if (!window.confirm('Dismiss this fax as not a signed verbal order? It stays in the SRFax inbox; it just leaves this list.')) return;
    const r = await ignoreInboundFax(f.id);
    if (r.ok) {
      showToast('Fax dismissed.');
      reload();
    } else {
      showToast(r.error || 'Could not dismiss the fax.');
    }
  };

  const resend = async (o: VerbalOrder) => {
    setBusyId(o.id);
    const r = await resendVerbalOrderFax(o.id);
    setBusyId(null);
    if (r.ok) {
      showToast(`Fax to ${o.physicianName} queued.`);
      reload();
    } else if (r.configured === false) {
      showToast('Faxing is not set up yet. Download the PDF and fax it by hand.');
    } else {
      showToast(r.error || 'The fax could not be sent.');
    }
  };

  if (!role) return null;
  if (role === 'va') return null;

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <p style={kickerStyle}>Physician orders</p>
            <h1 style={titleStyle}>Verbal orders</h1>
            <p style={subtitleStyle}>
              {isStaff
                ? `Every telephone order and where its physician signature stands. Overdue after ${thresholds.overdueDays} days, escalated after ${thresholds.escalateDays}.`
                : 'The verbal orders you have taken and whether the physician has signed them yet.'}
            </p>
          </div>
          {!isViewingAs && (
            <Link href="/admin/verbal-orders/new" style={primaryLinkStyle}><Plus size={15} /> Take a verbal order</Link>
          )}
        </header>

        {toast && <div style={toastStyle}>{toast}</div>}

        {isStaff && inbound.length > 0 && (
          <section style={{ ...cardStyle, borderColor: '#f0c8c4', background: '#fffafa' }}>
            <div style={sectionTitleStyle}><Inbox size={16} /> Faxes that need matching <span style={countChipWarnStyle}>{inbound.length}</span></div>
            <p style={{ ...mutedStyle, marginBottom: 10 }}>
              These came in on the portal fax line. Preview each one, then match it to its order. Dismiss anything that is
              not a signed verbal order; it stays in the SRFax inbox for the office.
            </p>
            <ul style={listStyle}>
              {inbound.map((f) => (
                <li key={f.id} style={rowStyle}>
                  <div style={rowHeadStyle}>
                    <span style={{ fontWeight: 700, color: '#2c3e50' }}>From {formatUSFaxNumber(f.remoteId) || formatUSFaxNumber(f.callerId) || 'unknown sender'}</span>
                    <span style={metaStyle}>{f.receivedAt} · {f.pages} page{f.pages === 1 ? '' : 's'}{f.candidateOrderIds.length ? ' · sender matches an open order' : ''}</span>
                    <span style={{ display: 'inline-flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                      <button type="button" style={smallBtnStyle} onClick={() => void previewFax(f)}><Eye size={13} /> Preview</button>
                      <button type="button" style={{ ...smallBtnStyle, background: '#e6f6ec', color: '#1e7a44', borderColor: '#bfe3cc' }} onClick={() => setMatchFax(f)}><FileSignature size={13} /> Match to an order</button>
                      <button type="button" style={{ ...smallBtnStyle, color: '#5c6b7a' }} onClick={() => void dismissFax(f)}><X size={13} /> Not a signed order</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section style={cardStyle}>
          <div style={{ ...sectionTitleStyle, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall size={16} /> {isStaff ? 'Queue' : 'My verbal orders'}
              {openCount > 0 && <span style={countChipStyle}>{openCount} open</span>}
              {overdueCount > 0 && <span style={countChipWarnStyle}>{overdueCount} overdue</span>}
            </span>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button type="button" style={filter === 'open' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('open')}>Awaiting signature</button>
              <button type="button" style={filter === 'all' ? filterActiveStyle : filterBtnStyle} onClick={() => setFilter('all')}>All</button>
              <button type="button" style={filterBtnStyle} onClick={reload} title="Refresh"><RefreshCw size={13} /></button>
            </span>
          </div>

          {orders === null ? (
            <div style={mutedStyle}>Loading…</div>
          ) : error ? (
            <div style={errRowStyle}><AlertTriangle size={14} /> Verbal orders couldn&apos;t be loaded. <button type="button" style={retryBtnStyle} onClick={reload}>Retry</button></div>
          ) : visible.length === 0 ? (
            <div style={mutedStyle}>{filter === 'open' ? 'Every verbal order has been signed.' : 'No verbal orders yet.'}</div>
          ) : (
            <ul style={listStyle}>
              {visible.map((o) => {
                const urgency = verbalOrderUrgency(o, today, thresholds);
                const age = verbalOrderAgeDays(o, today);
                const faxFailed = o.status !== 'signed' && o.fax?.sentStatus === 'Failed';
                const needsManualFax = o.status === 'taken';
                return (
                  <li key={o.id} id={`vo-${o.id}`} style={{ ...rowStyle, ...urgencyRowStyle(urgency, faxFailed), ...(o.id === highlightId ? hotStyle : null) }}>
                    <div style={rowHeadStyle}>
                      <UrgencyChip urgency={urgency} faxFailed={faxFailed} needsManualFax={needsManualFax} label={verbalOrderStatusLabel(o)} />
                      <Link href={`/admin/clients/${o.patientId}`} style={clientLinkStyle}>{o.patientName}</Link>
                      <span style={metaStyle}>
                        {o.orderType === 'medication' ? 'Medication' : 'Treatment/other'} · from {o.physicianName}
                        {o.physicianSpecialty ? ` (${o.physicianSpecialty})` : ''} · taken {formatDateUS(o.takenDate)} by {o.nurseName}
                        {age !== null && o.status !== 'signed' ? ` · ${age} day${age === 1 ? '' : 's'} ago` : ''}
                      </span>
                    </div>
                    <div style={textStyle}>{o.orderText}</div>
                    {o.marMedName && (
                      <div style={{ ...metaStyle, marginTop: 4 }}>
                        MAR: {o.marChangeType === 'discontinue' ? 'discontinued' : o.marChangeType === 'change' ? 'changed' : 'added'} {o.marMedName}
                        {o.status !== 'signed' ? ' (awaiting signature)' : ` (signed ${formatDateUS(o.signed?.signedDate || '')})`}
                      </div>
                    )}
                    {faxFailed && o.fax?.error && <div style={{ ...metaStyle, color: '#b3261e', marginTop: 4 }}>Fax error: {o.fax.error}</div>}
                    {o.status === 'signed' && o.signed && (
                      <div style={{ ...metaStyle, marginTop: 4, color: '#1e7a44' }}>
                        <Check size={12} style={{ verticalAlign: -2 }} /> Signed {formatDateUS(o.signed.signedDate)} by {o.signed.physicianPrintedName || o.physicianName}
                        {o.signed.method === 'esign' ? ' online' : o.signed.method === 'fax' ? ' (returned by fax)' : ` (recorded by ${o.signed.receivedByName || 'the office'})`}
                        {o.signed.documentId ? <> · <Link href={`/admin/clients/${o.patientId}?tab=documents`} style={{ color: '#1e7a44' }}>filed in Documents</Link></> : null}
                      </div>
                    )}
                    <div style={actionsRowStyle}>
                      <button type="button" style={smallBtnStyle} onClick={() => void download(o)}><Download size={13} /> PDF</button>
                      {o.status !== 'signed' && !isViewingAs && (isStaff || o.nurseId === effectiveUid) && (
                        <button type="button" style={{ ...smallBtnStyle, opacity: busyId === o.id ? 0.6 : 1 }} disabled={busyId === o.id} onClick={() => void resend(o)}>
                          <Send size={13} /> {busyId === o.id ? 'Sending…' : o.status === 'taken' ? 'Fax now' : 'Resend fax'}
                        </button>
                      )}
                      {o.status !== 'signed' && isStaff && !isViewingAs && (
                        <button type="button" style={{ ...smallBtnStyle, background: '#e6f6ec', color: '#1e7a44', borderColor: '#bfe3cc' }} onClick={() => setSignModal({ order: o })}>
                          <FileSignature size={13} /> Record signature
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {signModal && (
        <RecordSignatureModal
          order={signModal.order}
          fax={signModal.fax}
          onClose={() => setSignModal(null)}
          onDone={(msg) => {
            setSignModal(null);
            showToast(msg);
            reload();
          }}
        />
      )}
      {matchFax && orders && (
        <MatchFaxModal
          fax={matchFax}
          openOrders={orders.filter((o) => o.status !== 'signed')}
          onClose={() => setMatchFax(null)}
          onPreview={() => void previewFax(matchFax)}
          onPick={(o) => {
            setMatchFax(null);
            setSignModal({ order: o, fax: matchFax });
          }}
        />
      )}
    </div>
  );
}

function UrgencyChip({ urgency, faxFailed, needsManualFax, label }: { urgency: VerbalOrderUrgency; faxFailed: boolean; needsManualFax: boolean; label: string }) {
  if (urgency === 'signed') return <span style={chipSignedStyle}><Check size={11} /> Signed</span>;
  if (faxFailed) return <span style={chipDangerStyle}><AlertTriangle size={11} /> {label}</span>;
  if (urgency === 'escalated') return <span style={chipDangerStyle}><AlertTriangle size={11} /> Escalated</span>;
  if (urgency === 'overdue') return <span style={chipWarnStyle}><Clock size={11} /> Overdue</span>;
  if (needsManualFax) return <span style={chipWarnStyle}><Send size={11} /> Needs fax</span>;
  return <span style={chipOpenStyle}><Clock size={11} /> {label}</span>;
}

function RecordSignatureModal({ order, fax, onClose, onDone }: { order: VerbalOrder; fax?: UnmatchedInboundFax; onClose: () => void; onDone: (msg: string) => void }) {
  const [signedDate, setSignedDate] = useState(todayISO());
  const [printedName, setPrintedName] = useState(order.physicianName);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fileError, setFileError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (busy) return;
    if (file && file.type !== 'application/pdf') {
      setFileError('The signed copy must be a PDF.');
      escortToField('vo-signed-copy');
      return;
    }
    setFileError('');
    setBusy(true);
    setErr('');
    let signedPdfBase64: string | undefined;
    if (file) {
      const buf = await file.arrayBuffer();
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      signedPdfBase64 = btoa(bin);
    }
    const r = await recordVerbalOrderSignedByOffice(order.id, { signedDate, physicianPrintedName: printedName, signedPdfBase64, inboundFaxFileName: fax?.fileName });
    if (!r.ok) {
      setErr(r.error || 'The signature could not be recorded.');
      setBusy(false);
      return;
    }
    onDone(`Signature recorded for ${order.patientName}. ${order.marOrderId ? 'The MAR order now shows the signed date.' : ''}`);
  };

  return (
    <div style={backdropStyle} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div style={sheetStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={sheetTitleStyle}>Record the physician&apos;s signature</div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}><X size={16} /></button>
        </div>
        <div style={sheetHintStyle}>
          {fax
            ? `Files the fax from ${formatUSFaxNumber(fax.callerId) || 'the sender'} as the signed copy of this order and updates the MAR.`
            : 'Use this when the signed order came back on paper or by email. Attach the signed copy if you have it as a PDF; it is filed under the client\'s Documents.'}
        </div>
        <div style={{ ...mutedStyle, marginBottom: 10 }}>
          <strong>{order.patientName}</strong> · {order.physicianName} · taken {formatDateUS(order.takenDate)}
        </div>
        <label style={fieldStyle}>
          <span style={labelStyle}>Date the physician signed *</span>
          <input type="date" value={signedDate} min={order.takenDate} max={todayISO()} onChange={(e) => setSignedDate(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} disabled={busy} />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Physician&apos;s printed name</span>
          <input type="text" value={printedName} onChange={(e) => setPrintedName(e.target.value)} style={inputStyle} disabled={busy} />
        </label>
        {!fax && (
          <label style={fieldStyle} id="vo-signed-copy">
            <span style={labelStyle}>Signed copy (PDF, optional)</span>
            <div style={fileError ? FIELD_ERROR_WRAP_STYLE : undefined}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  if (fileError) setFileError('');
                }}
                disabled={busy}
                style={{ fontSize: 13 }}
                aria-invalid={!!fileError}
              />
            </div>
            <FieldError message={fileError} />
            <span style={hintStyle}>Without a file, the completed form is generated from the record and filed instead.</span>
          </label>
        )}
        {err && <div style={errBoxStyle} role="alert">{err}</div>}
        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" style={{ ...saveBtnStyle, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Record signature'}</button>
        </div>
      </div>
    </div>
  );
}

function MatchFaxModal({ fax, openOrders, onClose, onPick, onPreview }: { fax: UnmatchedInboundFax; openOrders: VerbalOrder[]; onClose: () => void; onPick: (o: VerbalOrder) => void; onPreview: () => void }) {
  const suggested = openOrders.filter((o) => fax.candidateOrderIds.includes(o.id));
  const rest = openOrders.filter((o) => !fax.candidateOrderIds.includes(o.id));
  // Picking a row is not filing: the office confirms the match first, so a
  // mis-click on the wrong client never lands a fax on the wrong chart.
  const [pending, setPending] = useState<VerbalOrder | null>(null);
  const Row = ({ o }: { o: VerbalOrder }) => (
    <button type="button" style={{ ...pickRowStyle, ...(pending?.id === o.id ? { borderColor: NAVY, background: '#e8eef4' } : null) }} onClick={() => setPending(o)}>
      <span style={{ fontWeight: 700, color: '#2c3e50' }}>{o.patientName}</span>
      <span style={metaStyle}>{o.physicianName} · fax {formatUSFaxNumber(o.physicianFax)} · taken {formatDateUS(o.takenDate)}</span>
    </button>
  );
  return (
    <div style={backdropStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={sheetStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={sheetTitleStyle}>Which order is this fax for?</div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="Close"><X size={16} /></button>
        </div>
        {pending ? (
          <>
            <div style={{ ...mutedStyle, marginBottom: 12 }}>
              File this fax as the signed order for <strong>{pending.patientName}</strong>, {pending.physicianName}?
              <br />
              Taken {formatDateUS(pending.takenDate)} · fax {formatUSFaxNumber(pending.physicianFax)}
            </div>
            <div style={actionsStyle}>
              <button type="button" style={cancelBtnStyle} onClick={() => setPending(null)}>Cancel</button>
              <button type="button" style={saveBtnStyle} onClick={() => onPick(pending)}>Confirm</button>
            </div>
          </>
        ) : (
        <>
        <div style={{ ...sheetHintStyle, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>From {formatUSFaxNumber(fax.remoteId) || formatUSFaxNumber(fax.callerId) || 'unknown'} · {fax.receivedAt} · {fax.pages} page{fax.pages === 1 ? '' : 's'}</span>
          <button type="button" style={smallBtnStyle} onClick={onPreview}><Eye size={13} /> Preview the fax</button>
        </div>
        <div style={{ ...mutedStyle, marginBottom: 10 }}>Open the preview and check the client name and order on the page before choosing.</div>
        {suggested.length > 0 && (
          <>
            <div style={labelStyle}>Same physician fax number</div>
            <div style={pickListStyle}>{suggested.map((o) => <Row key={o.id} o={o} />)}</div>
          </>
        )}
        <div style={{ ...labelStyle, marginTop: 10 }}>All open orders</div>
        <div style={pickListStyle}>{rest.length === 0 && suggested.length === 0 ? <div style={mutedStyle}>No open verbal orders.</div> : rest.map((o) => <Row key={o.id} o={o} />)}</div>
        <div style={actionsStyle}>
          <button type="button" style={cancelBtnStyle} onClick={onClose}>Close</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function urgencyRowStyle(u: VerbalOrderUrgency, faxFailed: boolean): CSSProperties {
  if (u === 'signed') return { borderLeftColor: '#27ae60' };
  if (faxFailed || u === 'escalated') return { borderLeftColor: '#b3261e', background: '#fffafa' };
  if (u === 'overdue') return { borderLeftColor: '#e0a100', background: '#fffdf5' };
  return { borderLeftColor: NAVY };
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 1000, margin: '0 auto' };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 30, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5, maxWidth: 720 };
const cardStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 };
const sectionTitleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 12 };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: CSSProperties = { background: 'white', borderWidth: 1, borderStyle: 'solid', borderColor: '#e5e7eb', borderLeftWidth: 4, borderLeftColor: '#cbd5e1', borderRadius: 10, padding: '12px 14px' };
const hotStyle: CSSProperties = { boxShadow: '0 0 0 3px rgba(26,58,92,0.25)' };
const rowHeadStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 };
const clientLinkStyle: CSSProperties = { fontWeight: 700, color: NAVY, textDecoration: 'none', fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 12.5, color: '#5c6b7a' };
const textStyle: CSSProperties = { fontSize: 14, color: '#1f2937', lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const actionsRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 };
const smallBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f1f5f9', color: NAVY, borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '6px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const chip = (bg: string, fg: string): CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700 });
const chipSignedStyle = chip('#e6f6ec', '#1e7a44');
const chipOpenStyle = chip('#e8eef4', NAVY);
const chipWarnStyle = chip('#fff4e0', '#9a5b00');
const chipDangerStyle = chip('#fdeaea', '#b3261e');
const countChipStyle: CSSProperties = chip('#e8eef4', NAVY);
const countChipWarnStyle: CSSProperties = chip('#fff4e0', '#9a5b00');
const filterBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const filterActiveStyle: CSSProperties = { ...filterBtnStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const mutedStyle: CSSProperties = { fontSize: 13, color: '#7f8c8d', lineHeight: 1.5 };
const hintStyle: CSSProperties = { fontSize: 12, color: '#8a949e', lineHeight: 1.4 };
const errRowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#fdeaea', color: '#b3261e', borderRadius: 8, fontSize: 13, fontWeight: 600 };
const retryBtnStyle: CSSProperties = { background: 'white', color: '#b3261e', border: '1px solid #e5b6b1', padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
const toastStyle: CSSProperties = { background: '#1f2937', color: 'white', padding: '10px 14px', borderRadius: 8, fontSize: 13.5, marginBottom: 14 };
const primaryLinkStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' };
const backdropStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 3200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', overflowY: 'auto' };
const sheetStyle: CSSProperties = { width: '100%', maxWidth: 520, background: 'white', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' };
const sheetTitleStyle: CSSProperties = { fontWeight: 700, fontSize: 17, color: '#1f2937', marginBottom: 6 };
const sheetHintStyle: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', lineHeight: 1.5, marginBottom: 12 };
const closeBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#5c6b7a' };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 38 };
const errBoxStyle: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13, marginBottom: 10 };
const actionsStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 };
const cancelBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const saveBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '9px 16px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const pickListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: '40vh', overflowY: 'auto' };
const pickRowStyle: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', textAlign: 'left', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' };
