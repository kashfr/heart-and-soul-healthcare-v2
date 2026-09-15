'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, RefreshCw, Search, Send, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { buildEdwpConsentUrl } from '@/lib/shareLink';
import { PROGRAM_LABEL, serviceLabels, type EdwpProgram } from '@/lib/edwpConsent';
import { formatDateUS } from '@/lib/dateFormat';
import type { EdwpConsentRecord, EdwpConsentInvite } from '@/lib/edwpConsentServer';

// Staff view of the EDWP consent form: who has been sent it, who has signed,
// and a PDF of each signed copy. "Send form" emails a client a link; the
// signed form is matched back to that invite when it comes in.

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function EdwpConsentsPage() {
  const [consents, setConsents] = useState<EdwpConsentRecord[]>([]);
  const [invites, setInvites] = useState<EdwpConsentInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/edwp-consents');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const data = await res.json();
      setConsents(data.consents ?? []);
      setInvites(data.invites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load consents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needle = q.trim().toLowerCase();
  const filteredConsents = useMemo(
    () =>
      needle
        ? consents.filter((c) =>
            `${c.clientName} ${c.email} ${c.phone} ${c.medicaidId} ${c.signerName} ${c.careCoordinatorName} ${c.careCoordinatorAgency}`
              .toLowerCase()
              .includes(needle)
          )
        : consents,
    [consents, needle]
  );
  // Completed invites are visible through their signed consent; only the
  // outstanding ones need chasing.
  const pendingInvites = useMemo(
    () =>
      invites
        .filter((i) => i.status === 'sent')
        .filter((i) => !needle || `${i.clientName} ${i.email} ${i.sentByName}`.toLowerCase().includes(needle)),
    [invites, needle]
  );
  const inviteById = useMemo(() => new Map(invites.map((i) => [i.id, i])), [invites]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildEdwpConsentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert(buildEdwpConsentUrl());
    }
  };

  const downloadPdf = async (c: EdwpConsentRecord) => {
    setDownloading(c.id);
    try {
      const res = await authedFetch(`/api/admin/edwp-consents/${c.id}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EDWP_Consent_${(c.clientName || 'client').replace(/[^a-zA-Z0-9-]+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not download the PDF.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Admin</p>
            <h1 style={titleStyle}>EDWP Consents</h1>
            <p style={subtitleStyle}>
              Client consent forms for CCSP and SOURCE services, signed online. Send the form to a client by
              email, or copy the link to share it any other way. Every signed form is also emailed to
              info@heartandsoulhc.org.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={load} style={ghostBtnStyle} title="Refresh">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={copyLink} style={ghostBtnStyle} title={buildEdwpConsentUrl()}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy form link'}
            </button>
            <button onClick={() => setSending(true)} style={primaryBtnStyle}>
              <Send size={15} /> Send form to a client
            </button>
          </div>
        </header>

        <div style={{ marginBottom: 14 }}>
          <div style={searchWrapStyle}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, email, coordinator…" style={searchInputStyle} />
            {q && (
              <button onClick={() => setQ('')} style={searchClearStyle} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : error ? (
          <div style={{ ...emptyStyle, color: '#b3261e' }}>
            {error}
            <div style={{ marginTop: 12 }}>
              <button onClick={load} style={ghostBtnStyle}>Try again</button>
            </div>
          </div>
        ) : (
          <>
            {pendingInvites.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <h2 style={sectionTitleStyle}>Awaiting signature ({pendingInvites.length})</h2>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Sent to</th>
                        <th style={thStyle}>Sent by</th>
                        <th style={thStyle}>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvites.map((i) => (
                        <tr key={i.id}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{i.clientName}</td>
                          <td style={tdStyle}>{i.email}</td>
                          <td style={tdStyle}>{i.sentByName || '—'}</td>
                          <td style={tdStyle}>{fmtDateTime(i.sentAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h2 style={sectionTitleStyle}>Signed ({filteredConsents.length})</h2>
              {filteredConsents.length === 0 ? (
                <div style={emptyStyle}>
                  {q ? 'No signed consents match your search.' : 'No signed consents yet. Send the form to a client to get started.'}
                </div>
              ) : (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Program</th>
                        <th style={thStyle}>Services</th>
                        <th style={thStyle}>Signed by</th>
                        <th style={thStyle}>Signed</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsents.map((c) => {
                        const invite = c.inviteId ? inviteById.get(c.inviteId) : null;
                        return (
                          <tr key={c.id}>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 600 }}>{c.clientName}</div>
                              <div style={metaStyle}>
                                DOB {formatDateUS(c.dob)}{c.medicaidId ? ` · Medicaid ${c.medicaidId}` : ''}
                              </div>
                              <div style={metaStyle}>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td style={tdStyle}>
                              {c.program ? PROGRAM_LABEL[c.program as EdwpProgram].split(' (')[0] : '—'}
                              {(c.careCoordinatorName || c.careCoordinatorAgency) && (
                                <div style={metaStyle}>
                                  CC: {[c.careCoordinatorName, c.careCoordinatorAgency].filter(Boolean).join(', ')}
                                </div>
                              )}
                            </td>
                            <td style={tdStyle}>{serviceLabels(c.services, c.servicesOther).join(', ') || '—'}</td>
                            <td style={tdStyle}>
                              {c.signerName}
                              <div style={metaStyle}>
                                {c.signerType === 'representative' ? c.signerRelationship || 'Representative' : 'Client'}
                                {invite ? ` · sent by ${invite.sentByName || 'staff'}` : ''}
                              </div>
                            </td>
                            <td style={tdStyle}>{fmtDateTime(c.submittedAt)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <button
                                onClick={() => downloadPdf(c)}
                                style={ghostBtnStyle}
                                disabled={downloading === c.id}
                                title="Download signed PDF"
                              >
                                <Download size={14} /> {downloading === c.id ? '…' : 'PDF'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {sending && (
        <SendModal
          onClose={() => setSending(false)}
          onSent={(invite) => {
            setInvites((prev) => [invite, ...prev]);
            setSending(false);
          }}
        />
      )}
    </div>
  );
}

function SendModal({ onClose, onSent }: { onClose: () => void; onSent: (invite: EdwpConsentInvite) => void }) {
  const [clientName, setClientName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await authedFetch('/api/admin/edwp-consents/send', {
        method: 'POST',
        body: JSON.stringify({ clientName, email, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onSent(data.invite);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not send the form.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <strong style={{ fontSize: 16, color: '#1a3a5c' }}>Send consent form</strong>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#5c6b7a' }}>
              The client (or whoever is signing for them) gets an email with a link to the form. Their name is
              prefilled, and the signed copy shows up here and in the office inbox.
            </p>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Client name</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={inp} required autoFocus />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Send to (email)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} required placeholder="Client or representative email" />
            </label>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Personal note <span style={{ fontWeight: 400 }}>(optional)</span></span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inp, minHeight: 72, resize: 'vertical' }} placeholder="e.g. It was great speaking with you today. Please sign by Friday so we can start services next week." />
            </label>
            {err && <div style={{ color: '#b3261e', fontSize: 13 }}>{err}</div>}
          </div>
          <div style={modalFooterStyle}>
            <button type="button" onClick={onClose} style={ghostBtnStyle} disabled={busy}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={busy}>
              <Send size={14} /> {busy ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Visual language shared with the other admin list pages (see admin/agencies).
const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = { marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' };
const kickerStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: React.CSSProperties = { fontSize: 32, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6, maxWidth: 620 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#2c3e50', margin: '0 0 10px' };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', maxWidth: 360 };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827' };
const searchClearStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '60px 24px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, color: '#5c6b7a', fontSize: 14 };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const modalFooterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 5 };
const fieldLabelStyle: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
