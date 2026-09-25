'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, PenLine, RefreshCw, Search, Upload, X, XCircle } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { useEffectiveUser } from '@/components/AuthProvider';
import { useSettings } from '@/components/SettingsProvider';
import { canUseFax } from '@/lib/faxShared';
import { PACKET_STAGE_LABEL, type PacketStage, type PandadocRecipient } from '@/lib/pandadocShared';

// E-signatures: where every tracked PandaDoc packet stands (onboarding
// packets by default). Packets are still sent from PandaDoc; a PandaDoc
// webhook keeps this page current. On the current plan the portal can't
// download the signed PDF, so an admin attaches it by hand once complete.

interface Packet {
  id: string;
  name: string;
  templateName: string;
  status: string;
  stage: PacketStage;
  modifiedAt: string;
  sentByName: string;
  recipients: PandadocRecipient[];
  subjectEmail: string;
  subjectName: string;
  staffUid: string;
  staffName: string;
  signedCopy: { fileName: string; uploadedByName: string; uploadedAt: string | null } | null;
}

const OPEN: PacketStage[] = ['awaiting-countersign', 'with-recipient', 'draft', 'other'];

function fmt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

export default function EsignPage() {
  const { uid, role } = useEffectiveUser();
  const { settings, ready } = useSettings();
  const allowed = canUseFax(settings.fax, uid, role);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [canFiles, setCanFiles] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/esign');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      setPackets(data.packets ?? []);
      setCanFiles(data.canHandleSignedCopies === true);
      setConfigured(data.webhookConfigured !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load packets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && allowed) void load();
  }, [ready, allowed, load]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      packets.filter(
        (p) => !needle || `${p.subjectName} ${p.subjectEmail} ${p.staffName} ${p.name} ${p.templateName}`.toLowerCase().includes(needle),
      ),
    [packets, needle],
  );
  const open = shown.filter((p) => OPEN.includes(p.stage)).sort((a, b) => OPEN.indexOf(a.stage) - OPEN.indexOf(b.stage));
  const done = shown.filter((p) => !OPEN.includes(p.stage));

  const pickUpload = (id: string) => {
    uploadFor.current = id;
    fileRef.current?.click();
  };

  const upload = async (file: File | null) => {
    const id = uploadFor.current;
    if (!file || !id) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return alert('Choose the signed PDF.');
    setBusy(id);
    try {
      const res = await authedFetch(`/api/esign/${id}/signed-copy`, { method: 'POST', body: JSON.stringify({ pdfBase64: await readAsBase64(file) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not save the signed copy.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const view = async (id: string) => {
    setBusy(id);
    try {
      const res = await authedFetch(`/api/esign/${id}/signed-copy`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open the signed copy.');
    } finally {
      setBusy(null);
    }
  };

  if (!ready) return <div style={containerStyle}><div style={wrapStyle}><div style={emptyStyle}>Loading…</div></div></div>;
  if (!allowed) {
    return (
      <div style={containerStyle}>
        <div style={wrapStyle}>
          <div style={emptyStyle}>
            <strong>You do not have access to E-signatures.</strong>
            <div style={{ marginTop: 6 }}>It uses the same access as the Fax Center. Ask an admin to add you under Settings, Fax Center.</div>
          </div>
        </div>
      </div>
    );
  }

  const row = (p: Packet) => {
    const outside = p.recipients.filter((r) => !r.internal);
    const inside = p.recipients.filter((r) => r.internal);
    return (
      <tr key={p.id}>
        <td style={tdStyle}>
          <div style={{ fontWeight: 600 }}>{p.staffName || p.subjectName || p.subjectEmail || 'Unknown recipient'}</div>
          <div style={metaStyle}>{p.subjectEmail}{p.staffUid ? '' : p.subjectEmail ? ' · not in Staff & Roles yet' : ''}</div>
        </td>
        <td style={tdStyle}>
          {p.templateName || p.name}
          {p.templateName && p.name && p.name !== p.templateName && <div style={metaStyle}>{p.name}</div>}
        </td>
        <td style={tdStyle}>
          <StagePill stage={p.stage} />
          <div style={metaStyle}>
            {[...outside, ...inside].map((r) => `${r.name || r.email} ${r.completed ? '✓' : '…'}`).join(' · ')}
          </div>
          <div style={metaStyle}>Updated {fmt(p.modifiedAt)}{p.sentByName ? ` · sent by ${p.sentByName}` : ''}</div>
        </td>
        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {canFiles && p.signedCopy && (
            <button onClick={() => view(p.id)} style={ghostBtnStyle} disabled={busy === p.id} title={`Uploaded by ${p.signedCopy.uploadedByName}`}>
              <Download size={14} /> Signed copy
            </button>
          )}
          {canFiles && p.stage === 'completed' && !p.signedCopy && (
            <button onClick={() => pickUpload(p.id)} style={ghostBtnStyle} disabled={busy === p.id}>
              <Upload size={14} /> {busy === p.id ? 'Saving…' : 'Attach signed PDF'}
            </button>
          )}
          {!canFiles && p.stage === 'completed' && (
            <span style={metaStyle}>{p.signedCopy ? 'Signed copy on file' : 'Signed copy not attached yet'}</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Office</p>
            <h1 style={titleStyle}>E-signatures</h1>
            <p style={subtitleStyle}>
              PandaDoc packets and where each one stands. Keep sending them from PandaDoc; this page updates on its own.
              {canFiles ? ' When a packet is complete, attach the signed PDF from PandaDoc here.' : ''}
            </p>
          </div>
          <button onClick={load} style={ghostBtnStyle} title="Refresh">
            <RefreshCw size={15} /> Refresh
          </button>
        </header>

        {!configured && (
          <div role="alert" style={warnBannerStyle}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            The PandaDoc webhook isn&apos;t connected yet, so nothing will show here. The setup steps are under Settings,
            E-signature tracking.
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={searchWrapStyle}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, packet…" style={searchInputStyle} />
            {q && (
              <button onClick={() => setQ('')} style={searchClearStyle} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {loading && packets.length === 0 ? (
          <div style={emptyStyle}>Loading…</div>
        ) : error ? (
          <div style={{ ...emptyStyle, color: '#b3261e' }}>{error}</div>
        ) : shown.length === 0 ? (
          <div style={emptyStyle}>{q ? 'No packets match your search.' : 'No packets yet. They appear here as soon as one is sent from PandaDoc.'}</div>
        ) : (
          <>
            <section style={{ marginBottom: 22 }}>
              <h2 style={sectionTitleStyle}>In progress ({open.length})</h2>
              {open.length === 0 ? (
                <div style={{ ...emptyStyle, padding: '24px' }}>Nothing in progress.</div>
              ) : (
                <div style={tableWrapStyle}><table style={tableStyle}><tbody>{open.map(row)}</tbody></table></div>
              )}
            </section>
            {done.length > 0 && (
              <section>
                <h2 style={sectionTitleStyle}>Finished ({done.length})</h2>
                <div style={tableWrapStyle}><table style={tableStyle}><tbody>{done.map(row)}</tbody></table></div>
              </section>
            )}
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}

function StagePill({ stage }: { stage: PacketStage }) {
  const look: Record<PacketStage, { bg: string; fg: string; icon: React.ReactNode }> = {
    'awaiting-countersign': { bg: '#fdecea', fg: '#b3261e', icon: <PenLine size={13} /> },
    'with-recipient': { bg: '#fef7e0', fg: '#8a5a00', icon: <Clock size={13} /> },
    draft: { bg: '#f1f5f9', fg: '#475569', icon: <Clock size={13} /> },
    other: { bg: '#f1f5f9', fg: '#475569', icon: <Clock size={13} /> },
    completed: { bg: '#e6f4ea', fg: '#1e7e34', icon: <CheckCircle2 size={13} /> },
    declined: { bg: '#fdecea', fg: '#b3261e', icon: <XCircle size={13} /> },
    voided: { bg: '#f1f5f9', fg: '#475569', icon: <XCircle size={13} /> },
    expired: { bg: '#f1f5f9', fg: '#475569', icon: <XCircle size={13} /> },
  };
  const l = look[stage];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: l.bg, color: l.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 700 }}>
      {l.icon} {PACKET_STAGE_LABEL[stage]}
    </span>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = { marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' };
const kickerStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: React.CSSProperties = { fontSize: 32, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6, maxWidth: 640 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#2c3e50', margin: '0 0 10px' };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const warnBannerStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#fef7e0', border: '1px solid #f3d27a', color: '#6b4a00', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, marginBottom: 14 };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', maxWidth: 360 };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827' };
const searchClearStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '60px 24px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, color: '#5c6b7a', fontSize: 14 };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'auto' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151', verticalAlign: 'top' };
const metaStyle: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d', marginTop: 3 };
