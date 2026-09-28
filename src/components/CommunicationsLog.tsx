'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, MessageSquarePlus, X, XCircle } from 'lucide-react';
import { getCommunications, logCommunication, type CommsPayload } from '@/lib/communications';
import {
  agencyNowLocal,
  channelLabel,
  deliveryStatus,
  EMPTY_MANUAL_COMM,
  eventLabel,
  MANUAL_CHANNELS,
  MANUAL_COMM_ERROR_ORDER,
  validateManualComm,
  type CommunicationEntry,
  type ManualCommErrorKey,
  type ManualCommInput,
} from '@/lib/communicationsShared';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';

const NAVY = '#1a3a5c';

interface Props {
  /** Scope to one client (the client page). Omit for the portal-wide log. */
  patientId?: string;
  /** Hide "Log a message" (view-as sessions are read-only). */
  readOnly?: boolean;
  onToast?: (msg: string) => void;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * The communications log: what the portal sent staff about clients' care
 * (every channel, word for word, and whether it was delivered) plus messages
 * logged by hand. Admins and supervisors.
 */
export default function CommunicationsLog({ patientId, readOnly, onToast }: Props) {
  const [data, setData] = useState<CommsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [logging, setLogging] = useState(false);

  const load = useCallback(() => {
    getCommunications({ patientId })
      .then((d) => { setData(d); setLoadError(null); })
      .catch((err) => { console.error('Communications load failed:', err); setLoadError('Could not load the communications log.'); });
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const entries = useMemo(
    () => (data?.entries || []).filter((e) => (!staffFilter || e.staffUid === staffFilter) && (!clientFilter || e.patientId === clientFilter)),
    [data, staffFilter, clientFilter],
  );
  const staffInLog = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.entries || []) if (e.staffUid) m.set(e.staffUid, e.staffName || e.staffUid);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const clientsInLog = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of data?.entries || []) if (e.patientId) m.set(e.patientId, e.patientName || e.patientId);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  return (
    <div>
      <div style={toolbar}>
        <p style={sub}>
          Every notice the portal sends staff about {patientId ? "this client's" : "clients'"} care, word for word, and whether it was delivered. Log emails, calls and texts sent outside the portal so the record is complete.
        </p>
        {!readOnly && data && (
          <button type="button" style={primaryBtn} onClick={() => setLogging(true)}>
            <MessageSquarePlus size={14} /> Log a message
          </button>
        )}
      </div>

      {data && (staffInLog.length > 1 || (!patientId && clientsInLog.length > 1)) && (
        <div style={filters}>
          {staffInLog.length > 1 && (
            <select aria-label="Filter by staff member" style={selectSmall} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
              <option value="">All staff</option>
              {staffInLog.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
            </select>
          )}
          {!patientId && clientsInLog.length > 1 && (
            <select aria-label="Filter by client" style={selectSmall} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
              <option value="">All clients</option>
              {clientsInLog.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
        </div>
      )}

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && !data && <div style={muted}>Loading...</div>}
      {data && entries.length === 0 && <div style={muted}>Nothing logged yet.</div>}

      {entries.length > 0 && (
        <ul style={list}>
          {entries.map((e) => (
            <EntryRow key={e.id} e={e} showClient={!patientId} open={!!open[e.id]} onToggle={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))} />
          ))}
        </ul>
      )}

      {logging && data && (
        <LogMessageModal
          data={data}
          patientId={patientId}
          onClose={() => setLogging(false)}
          onLogged={() => { setLogging(false); onToast?.('Message logged.'); load(); }}
        />
      )}
    </div>
  );
}

function EntryRow({ e, showClient, open, onToggle }: { e: CommunicationEntry; showClient: boolean; open: boolean; onToggle: () => void }) {
  const status = e.source === 'manual' ? 'logged' : deliveryStatus(e);
  const who = e.staffName || e.counterpartyName;
  return (
    <li style={row}>
      <button type="button" style={rowHead} onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={15} style={chev} /> : <ChevronRight size={15} style={chev} />}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={rowTitle}>
            <span>{eventLabel(e.event)}</span>
            <span style={dot}>·</span>
            <span>{e.direction === 'inbound' ? 'from' : 'to'} {who || 'unknown'}</span>
            {showClient && e.patientName && (
              <>
                <span style={dot}>·</span>
                <span style={{ color: '#5c6b7a', fontWeight: 600 }}>{e.patientName}</span>
              </>
            )}
          </div>
          <div style={rowMeta}>
            {fmtWhen(e.occurredAt)} · {e.channels.map((c) => channelLabel(c.channel)).join(', ')}
            {e.loggedByName ? ` · ${e.source === 'manual' ? 'logged' : 'sent'} by ${e.loggedByName}` : ''}
          </div>
        </div>
        <StatusChip status={status} />
      </button>
      {open && (
        <div style={detail}>
          {e.channels.map((c, i) => (
            <div key={i} style={channelBox}>
              <div style={channelHead}>
                <strong>{channelLabel(c.channel)}</strong>
                {c.to ? <span style={{ color: '#5c6b7a' }}> {e.direction === 'inbound' ? 'from' : 'to'} {c.to}</span> : null}
                {e.source !== 'manual' && (
                  c.ok
                    ? <span style={okText}><CheckCircle2 size={13} /> Sent</span>
                    : <span style={failText}><XCircle size={13} /> {c.skipped ? 'Not sent' : 'Failed'}{c.error ? `: ${c.error}` : ''}</span>
                )}
              </div>
              {c.subject && <div style={subjectLine}>Subject: {c.subject}</div>}
              <pre style={bodyText}>{c.body}</pre>
            </div>
          ))}
          {e.patientId && showClient && (
            <Link href={`/admin/clients/${e.patientId}`} style={clientLink}>Open {e.patientName || 'client'}</Link>
          )}
        </div>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: 'delivered' | 'partial' | 'failed' | 'logged' }) {
  const s = {
    delivered: { text: 'Delivered', bg: '#e8f4e8', fg: '#1e5c1e' },
    partial: { text: 'Partly delivered', bg: '#fff4e0', fg: '#8a5a0d' },
    failed: { text: 'Not delivered', bg: '#fdeaea', fg: '#b3261e' },
    logged: { text: 'Logged', bg: '#eef2f6', fg: NAVY },
  }[status];
  return <span style={{ ...chip, background: s.bg, color: s.fg }}>{s.text}</span>;
}

function LogMessageModal({ data, patientId, onClose, onLogged }: { data: CommsPayload; patientId?: string; onClose: () => void; onLogged: () => void }) {
  const [form, setForm] = useState<ManualCommInput>(() => ({ ...EMPTY_MANUAL_COMM, patientId: patientId || '', occurredAt: agencyNowLocal() }));
  const [errors, setErrors] = useState<Partial<Record<ManualCommErrorKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fieldId = (k: ManualCommErrorKey) => `comm-field-${k}`;
  const set = <K extends keyof ManualCommInput>(k: K, v: ManualCommInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    const key = (k === 'staffUid' || k === 'counterpartyName' ? 'who' : k) as ManualCommErrorKey;
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = async () => {
    if (!applyFieldErrors(validateManualComm(form, agencyNowLocal(10 * 60 * 1000)), MANUAL_COMM_ERROR_ORDER, setErrors, fieldId)) return;
    setSaving(true);
    setSaveError('');
    try {
      await logCommunication(form);
      onLogged();
    } catch (err) {
      const withFields = err as Error & { fields?: Partial<Record<ManualCommErrorKey, string>> };
      if (withFields.fields) applyFieldErrors(withFields.fields, MANUAL_COMM_ERROR_ORDER, setErrors, fieldId);
      setSaveError(withFields.message || 'Could not log the message.');
      setSaving(false);
    }
  };

  const clientName = patientId ? data.clients.find((c) => c.id === patientId)?.name || '' : '';

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Log a message">
      <div style={modal}>
        <div style={modalHead}>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Log a message</div>
          <button type="button" onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>
        </div>
        <p style={{ ...sub, margin: '0 0 12px' }}>Record an email, text, call or conversation that happened outside the portal. Paste the message itself so the wording is on file.</p>

        <div style={grid2}>
          <Field label="Direction">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['outbound', 'inbound'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={form.direction === d} style={form.direction === d ? chipOn : chipOff} onClick={() => set('direction', d)}>
                  {d === 'outbound' ? 'We sent it' : 'We received it'}
                </button>
              ))}
            </div>
          </Field>
          <Field id={fieldId('channel')} label="How *" error={errors.channel}>
            <select style={{ ...select, ...(errors.channel ? FIELD_ERROR_STYLE : null) }} value={form.channel} onChange={(e) => set('channel', e.target.value as ManualCommInput['channel'])}>
              <option value="">Select...</option>
              {MANUAL_CHANNELS.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
            </select>
          </Field>
        </div>

        <div id={fieldId('who')} style={grid2}>
          <Field label={form.direction === 'inbound' ? 'From staff member' : 'To staff member'}>
            <select style={{ ...select, ...(errors.who ? FIELD_ERROR_STYLE : null) }} value={form.staffUid} onChange={(e) => set('staffUid', e.target.value)}>
              <option value="">Not a staff member</option>
              {data.staff.map((s) => <option key={s.uid} value={s.uid}>{s.name}{s.credential ? `, ${s.credential}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Or someone else" error={errors.who}>
            <input style={{ ...input, ...(errors.who ? FIELD_ERROR_STYLE : null) }} value={form.counterpartyName} onChange={(e) => set('counterpartyName', e.target.value)} placeholder="e.g. Mother, Dr. Patel's office" />
          </Field>
        </div>

        <div style={grid2}>
          <Field label="About client">
            {patientId ? (
              <div style={{ ...input, background: '#f6f9fc', display: 'flex', alignItems: 'center' }}>{clientName}</div>
            ) : (
              <select style={select} value={form.patientId} onChange={(e) => set('patientId', e.target.value)}>
                <option value="">Not about one client</option>
                {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
          <Field id={fieldId('occurredAt')} label="When *" error={errors.occurredAt}>
            <input type="datetime-local" style={{ ...input, ...(errors.occurredAt ? FIELD_ERROR_STYLE : null) }} value={form.occurredAt} onChange={(e) => set('occurredAt', e.target.value)} />
          </Field>
        </div>

        <Field label="Subject (optional)">
          <input style={input} value={form.subject} onChange={(e) => set('subject', e.target.value)} />
        </Field>
        <Field id={fieldId('body')} label="Message *" error={errors.body}>
          <textarea style={{ ...input, height: 'auto', minHeight: 160, resize: 'vertical', lineHeight: 1.5, ...(errors.body ? FIELD_ERROR_STYLE : null) }} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Paste the email or text, or summarize the call." />
        </Field>

        {saveError && <div style={{ ...errBox, marginBottom: 10 }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {saveError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={ghostBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" style={primaryBtn} onClick={() => void save()} disabled={saving}>{saving ? 'Saving...' : 'Log message'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, error, children }: { id?: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
      <FieldError message={error} />
    </div>
  );
}

const toolbar: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 10 };
const sub: CSSProperties = { fontSize: 12.5, color: '#7f8c8d', margin: 0, lineHeight: 1.5, flex: '1 1 320px' };
const filters: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 };
const inputBase: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white', height: 36 };
const input: CSSProperties = inputBase;
const select: CSSProperties = withSelectChevron(inputBase);
const selectSmall: CSSProperties = withSelectChevron({ ...inputBase, width: 'auto', minWidth: 180 });
const list: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 };
const row: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' };
const rowHead: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const chev: CSSProperties = { color: '#8a949e', flexShrink: 0 };
const rowTitle: CSSProperties = { fontSize: 13.5, fontWeight: 700, color: '#2c3e50', display: 'flex', flexWrap: 'wrap', gap: 4 };
const dot: CSSProperties = { color: '#b0b8c1' };
const rowMeta: CSSProperties = { fontSize: 12, color: '#7f8c8d', marginTop: 2 };
const chip: CSSProperties = { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap', flexShrink: 0 };
const detail: CSSProperties = { borderTop: '1px solid #f1f3f5', padding: '10px 12px 12px 35px', display: 'flex', flexDirection: 'column', gap: 8 };
const channelBox: CSSProperties = { background: '#f8fafc', border: '1px solid #e8edf2', borderRadius: 6, padding: '8px 10px' };
const channelHead: CSSProperties = { fontSize: 12.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 };
const okText: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, color: '#1e5c1e', fontWeight: 600 };
const failText: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, color: '#b3261e', fontWeight: 600 };
const subjectLine: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#2c3e50', marginTop: 4 };
const bodyText: CSSProperties = { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#2c3e50', margin: '4px 0 0', lineHeight: 1.5 };
const clientLink: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: NAVY };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: NAVY, color: 'white', border: `1px solid ${NAVY}`, borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };
const ghostBtn: CSSProperties = { background: 'white', border: '1px solid #d0d7de', borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: NAVY, fontFamily: 'inherit' };
const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 3000, overflowY: 'auto' };
const modal: CSSProperties = { background: 'white', borderRadius: 12, padding: 18, width: '100%', maxWidth: 620, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' };
const modalHead: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
const iconBtn: CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#5c6b7a', padding: 4 };
const grid2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 };
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5c6b7a' };
const chipOff: CSSProperties = { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipOn: CSSProperties = { ...chipOff, background: '#e8eef4', color: NAVY, borderColor: NAVY };
