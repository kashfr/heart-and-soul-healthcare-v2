'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, EyeOff, Eye, FileCheck2, Hourglass, Inbox, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import { formatUSFaxNumber } from '@/lib/verbalOrderShared';
import { daysBetween, PPOT_REQUEST_LABEL, validatePpotFiling, type PpotOpenRequest, type PpotRequestType } from '@/lib/ppotShared';

// The return half of PPOT requests: faxes that arrived on the portal line,
// the requests still waiting on a physician, and the signed copies filed.
// Nothing files itself: a person opens the fax and says which request it
// answers (the same office also sends labs, records, and verbal orders).

interface IncomingFax {
  id: string;
  callerId: string;
  remoteId: string;
  pages: number;
  receivedAt: string;
  ppotCandidateKeys: string[];
  verbalOrderCandidates: number;
}

interface ReceivedPpot {
  key: string;
  subjectKind: 'referral' | 'client';
  memberName: string;
  requestType: PpotRequestType;
  recipientName: string;
  signedDate: string;
  byName: string;
}

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function openPdf(url: string) {
  const res = await authedFetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  const blobUrl = URL.createObjectURL(await res.blob());
  window.open(blobUrl, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export default function PpotInbox({ refreshKey }: { refreshKey: number }) {
  const [incoming, setIncoming] = useState<IncomingFax[]>([]);
  const [openRequests, setOpenRequests] = useState<PpotOpenRequest[]>([]);
  const [received, setReceived] = useState<ReceivedPpot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filing, setFiling] = useState<IncomingFax | null>(null);
  const [canDismiss, setCanDismiss] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/fax/inbound');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setIncoming(data.incoming ?? []);
      setOpenRequests(data.openRequests ?? []);
      setReceived(data.received ?? []);
      setCanDismiss(data.canDismissIncoming === true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load incoming faxes.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const view = async (key: string, url: string) => {
    setBusy(key);
    try {
      await openPdf(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open the fax.');
    } finally {
      setBusy(null);
    }
  };

  // One helper for the three "clear it off the list" actions.
  const act = async (key: string, url: string, body: object, question: string) => {
    if (!confirm(question)) return;
    setBusy(key);
    try {
      const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update the list.');
    } finally {
      setBusy(null);
    }
  };

  const byKey = new Map(openRequests.map((r) => [r.key, r]));
  const today = todayET();

  return (
    <>
      {error && <div role="alert" style={{ ...noteStyle, color: '#b3261e', marginBottom: 14 }}>{error}</div>}

      {incoming.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>
            <Inbox size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
            Incoming faxes ({incoming.length})
          </h2>
          <p style={noteStyle}>
            Faxes on the portal line that haven&apos;t been filed. Open one to see what it is; if it is a signed Appendix T,
            file it against its request. Signed verbal orders are matched under Verbal Orders instead.
          </p>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <tbody>
                {incoming.map((f) => {
                  const suggested = f.ppotCandidateKeys.map((k) => byKey.get(k)).filter((r): r is PpotOpenRequest => !!r);
                  const from = f.callerId || f.remoteId;
                  return (
                    <tr key={f.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{from ? formatUSFaxNumber(from) : 'Unknown sender'}</div>
                        <div style={metaStyle}>{f.receivedAt} · {f.pages} page{f.pages === 1 ? '' : 's'}</div>
                      </td>
                      <td style={tdStyle}>
                        {suggested.length > 0 ? (
                          <span style={suggestStyle}>
                            Looks like the signed Appendix T for {suggested.map((r) => r.memberName).join(' or ')}
                          </span>
                        ) : f.verbalOrderCandidates > 0 ? (
                          <span style={metaStyle}>May be a signed verbal order (see Verbal Orders)</span>
                        ) : (
                          <span style={metaStyle}>No match suggested</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => view(f.id, `/api/fax/inbound/${f.id}/pdf`)} style={ghostBtnStyle} disabled={busy === f.id}>
                          <Eye size={14} /> View
                        </button>
                        <button onClick={() => setFiling(f)} style={{ ...ghostBtnStyle, marginLeft: 6 }} disabled={openRequests.length === 0} title={openRequests.length === 0 ? 'No PPOT request is waiting on a signed copy' : undefined}>
                          <FileCheck2 size={14} /> File as signed PPOT
                        </button>
                        {canDismiss && (
                          <button
                            onClick={() => act(f.id, `/api/fax/inbound/${f.id}/dismiss`, {}, 'Dismiss this fax without filing it? It also leaves the Verbal Orders queue, so only do this if it is not a signed verbal order.')}
                            style={{ ...ghostBtnStyle, marginLeft: 6 }}
                            disabled={busy === f.id}
                            title="Not anything to file (junk, duplicate, test)"
                          >
                            <X size={14} /> Dismiss
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {openRequests.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>
            <Hourglass size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
            Waiting on physicians ({openRequests.length})
          </h2>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <tbody>
                {openRequests.map((r) => {
                  const waited = r.date ? daysBetween(r.date, today) : 0;
                  return (
                    <tr key={r.key}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{r.memberName}</div>
                        <div style={metaStyle}>{PPOT_REQUEST_LABEL[r.requestType]} · {r.subjectKind === 'client' ? 'Client' : 'Referral'}</div>
                      </td>
                      <td style={tdStyle}>
                        {r.recipientName}
                        <div style={metaStyle}>{r.toNumber ? `fax ${formatUSFaxNumber(r.toNumber)}` : ''}</div>
                      </td>
                      <td style={tdStyle}>
                        Sent {formatDateUS(r.date)}
                        <div style={{ ...metaStyle, color: waited >= 14 ? '#b3261e' : '#7f8c8d', fontWeight: waited >= 14 ? 700 : 400 }}>
                          {waited <= 0 ? 'today' : `${waited} day${waited === 1 ? '' : 's'} waiting`}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button
                          onClick={() => act(r.key, `/api/fax/ppot/requests/${r.key}`, { action: 'cancel' }, `Cancel the Appendix T request for ${r.memberName}? It leaves this list and no longer counts as this cycle's request. The fax itself stays in Sent faxes.`)}
                          style={ghostBtnStyle}
                          disabled={busy === r.key}
                          title="Withdraw it (wrong office, no longer needed, or a test)"
                        >
                          <Ban size={14} /> Cancel request
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {received.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={sectionTitleStyle}>
            <CheckCircle2 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
            Signed PPOTs
          </h2>
          <p style={noteStyle}>Clients&apos; copies are also under Documents on the client&apos;s record.</p>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <tbody>
                {received.map((r) => (
                  <tr key={r.key}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{r.memberName}</div>
                      <div style={metaStyle}>{PPOT_REQUEST_LABEL[r.requestType]} · {r.subjectKind === 'client' ? 'Client' : 'Referral'}</div>
                    </td>
                    <td style={tdStyle}>
                      Signed {formatDateUS(r.signedDate)}
                      <div style={metaStyle}>{[r.recipientName, r.byName ? `filed by ${r.byName}` : ''].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={() => view(r.key, `/api/fax/ppot/signed/${r.key}`)} style={ghostBtnStyle} disabled={busy === r.key}>
                        <Eye size={14} /> View
                      </button>
                      <button
                        onClick={() => act(r.key, `/api/fax/ppot/requests/${r.key}`, { action: 'hide' }, `Remove ${r.memberName}'s signed PPOT from this list? The signed copy stays filed${r.subjectKind === 'client' ? " under the client's Documents" : ''}.`)}
                        style={{ ...ghostBtnStyle, marginLeft: 6 }}
                        disabled={busy === r.key}
                      >
                        <EyeOff size={14} /> Remove from list
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {filing && (
        <FileModal
          fax={filing}
          openRequests={openRequests}
          today={today}
          onView={() => view(filing.id, `/api/fax/inbound/${filing.id}/pdf`)}
          onClose={() => setFiling(null)}
          onFiled={() => {
            setFiling(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function FileModal({
  fax,
  openRequests,
  today,
  onView,
  onClose,
  onFiled,
}: {
  fax: IncomingFax;
  openRequests: PpotOpenRequest[];
  today: string;
  onView: () => void;
  onClose: () => void;
  onFiled: () => void;
}) {
  const suggestedKey = fax.ppotCandidateKeys.find((k) => openRequests.some((r) => r.key === k)) || '';
  const [requestKey, setRequestKey] = useState(suggestedKey);
  const [signedDate, setSignedDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validatePpotFiling({ requestKey, signedDate }, today);
    if (invalid) return setErr(invalid);
    const req = openRequests.find((r) => r.key === requestKey);
    if (!confirm(`File this fax as the signed Appendix T for ${req?.memberName || 'this member'}?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await authedFetch(`/api/fax/inbound/${fax.id}/ppot`, { method: 'POST', body: JSON.stringify({ requestKey, signedDate }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onFiled();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not file the fax.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={busy ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ppot-file-title">
        <div style={modalHeaderStyle}>
          <strong id="ppot-file-title" style={{ fontSize: 16, color: '#1a3a5c' }}>File as signed Appendix T</strong>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 }}>
              Fax from {fax.callerId || fax.remoteId ? formatUSFaxNumber(fax.callerId || fax.remoteId) : 'an unknown sender'}, {fax.pages} page
              {fax.pages === 1 ? '' : 's'}.{' '}
              <button type="button" onClick={onView} style={linkBtnStyle}>Open it</button> and check that it is the completed,
              signed form before filing. A client&apos;s copy goes under Documents (ISP / Plan of Treatment).
            </p>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Which request does it answer?</span>
              <select value={requestKey} onChange={(e) => { setRequestKey(e.target.value); setErr(null); }} style={inp}>
                <option value="">Choose a request…</option>
                {openRequests.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.memberName}: {PPOT_REQUEST_LABEL[r.requestType].toLowerCase()}, sent to {r.recipientName || 'physician'} {formatDateUS(r.date)}
                    {r.key === suggestedKey ? ' (suggested)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Date the physician signed</span>
              <input type="date" value={signedDate} max={today} onChange={(e) => { setSignedDate(e.target.value); setErr(null); }} style={{ ...inp, maxWidth: 200 }} />
            </label>
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={modalFooterStyle}>
            <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={busy}>
              <FileCheck2 size={14} /> {busy ? 'Filing…' : 'File signed PPOT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#2c3e50', margin: '0 0 4px' };
const noteStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: '0 0 10px' };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const suggestStyle: React.CSSProperties = { display: 'inline-block', fontSize: 12.5, fontWeight: 700, color: '#1e7e34', background: '#e6f4ea', borderRadius: 999, padding: '3px 10px' };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: '#1a3a5c', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const modalFooterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
