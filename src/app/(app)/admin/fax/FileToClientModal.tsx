'use client';

import { useEffect, useMemo, useState } from 'react';
import { FolderInput, Search, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { formatDateUS } from '@/lib/dateFormat';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';
import { DOC_CATEGORY_GROUPS, validateFileFaxToClient, type FileFaxToClientField } from '@/lib/docCategories';
import { inboundFaxSender } from '@/lib/verbalOrderShared';
import type { RoiRecord } from '@/lib/roiShared';
import { btn, btnPrimary } from '@/components/buttons';

interface Fax {
  id: string;
  callerId: string;
  remoteId: string;
  pages: number;
  receivedAt: string;
}

/** Where a fax can be filed: a client's Documents, or a referral that has no
 *  client record yet (its papers follow it when the record is created). */
interface Target {
  kind: 'client' | 'referral';
  id: string;
  name: string;
  dob: string;
}

/** A release we faxed recently that asked this facility to send records back. */
interface Suggestion {
  clientId: string;
  clientName: string;
  facility: string;
  faxedOn: string; // YYYY-MM-DD
}

const ORDER: readonly FileFaxToClientField[] = ['patientId', 'category', 'title', 'docDate'];
const fid = (k: FileFaxToClientField) => `fax-to-client-${k}`;
// A reply to a release usually lands within days; three weeks keeps the
// suggestion list to the releases someone is actually waiting on.
const SUGGEST_WINDOW_DAYS = 21;

/**
 * File an incoming fax into a client's Documents, or against an open referral.
 * Suggests the clients whose release of information we faxed in the last
 * three weeks, since records sent back on a release often come from a
 * different fax number (a hospital's eFax service) than the one we sent to,
 * so they can't be matched by number.
 */
export default function FileToClientModal({ fax, today, onView, onClose, onFiled }: { fax: Fax; today: string; onView: () => void; onClose: () => void; onFiled: (message: string) => void }) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [client, setClient] = useState<Target | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [docDate, setDocDate] = useState(today);
  const [errors, setErrors] = useState<Partial<Record<FileFaxToClientField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Clients (with their releases, for the suggestions) and open referrals.
    Promise.all([
      authedFetch('/api/fax/roi').then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
      authedFetch('/api/fax/ppot').then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
    ])
      .then(([roi, ppot]) => {
        if (cancelled) return;
        if (!roi.ok) throw new Error(roi.d.error || 'Could not load clients.');
        const d = roi.d;
        const list: Target[] = (d.clients || []).map((c: Target) => ({ kind: 'client' as const, id: c.id, name: c.name, dob: c.dob }));
        if (ppot.ok) {
          for (const s of (ppot.d.subjects || []) as Array<{ kind: string; id: string; name: string; dob: string }>) {
            if (s.kind === 'referral') list.push({ kind: 'referral', id: s.id, name: s.name, dob: s.dob });
          }
        }
        setTargets(list);
        const cutoff = new Date(Date.now() - SUGGEST_WINDOW_DAYS * 86400000).toISOString();
        const out: Suggestion[] = [];
        for (const r of (d.rois || []) as RoiRecord[]) {
          if (r.direction === 'from-us' || r.status !== 'signed') continue;
          const last = [...(r.faxes || [])].sort((a, b) => b.at.localeCompare(a.at))[0];
          if (!last || last.at < cutoff) continue;
          out.push({ clientId: r.patientId, clientName: r.memberName, facility: r.facility.name, faxedOn: last.at.slice(0, 10) });
        }
        setSuggestions(out.sort((a, b) => b.faxedOn.localeCompare(a.faxedOn)));
      })
      .catch((e) => { if (!cancelled) { setTargets([]); setErr(e instanceof Error ? e.message : 'Could not load clients.'); } });
    return () => { cancelled = true; };
  }, []);

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => (needle.length < 2 || !targets ? [] : targets.filter((c) => `${c.name} ${c.dob}`.toLowerCase().includes(needle)).slice(0, 8)), [targets, needle]);
  const clear = (k: FileFaxToClientField) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }));

  const pick = (c: Target) => { setClient(c); setQ(''); clear('patientId'); };
  const pickSuggestion = (s: Suggestion) => {
    pick(targets?.find((c) => c.kind === 'client' && c.id === s.clientId) || { kind: 'client', id: s.clientId, name: s.clientName, dob: '' });
    if (!title.trim()) { setTitle(`Records from ${s.facility}`); clear('title'); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const body = { patientId: client?.id || '', category, title, docDate };
    if (!applyFieldErrors(validateFileFaxToClient(body, today), ORDER, setErrors, fid)) return;
    setBusy(true);
    try {
      const payload = client!.kind === 'referral' ? { referralId: client!.id, category, title, docDate } : body;
      const res = await authedFetch(`/api/fax/inbound/${fax.id}/client`, { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onFiled(
        client!.kind === 'referral'
          ? `Filed "${title.trim()}" to ${client!.name}'s referral (${category}). It moves to the client's Documents when the client record is created.`
          : `Filed "${title.trim()}" to ${client!.name}'s Documents (${category}).`,
      );
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not file the fax.');
    } finally {
      setBusy(false);
    }
  };

  const sender = inboundFaxSender(fax.callerId, fax.remoteId).from || 'an unknown sender';

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="fax-to-client-title">
        <div style={header}>
          <strong id="fax-to-client-title" style={{ fontSize: 16, color: '#1a3a5c' }}>File to a Client or Referral</strong>
          <button onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 }}>
              Fax from {sender}, {fax.pages} page{fax.pages === 1 ? '' : 's'}, received {fax.receivedAt}.{' '}
              <button type="button" onClick={onView} style={linkBtn}>Open it</button> to check whose records these are before filing.
            </p>

            {!client && suggestions.length > 0 && (
              <div style={field}>
                <span style={label}>Waiting on records from a release</span>
                {suggestions.map((s) => (
                  <button key={`${s.clientId}-${s.facility}`} type="button" onClick={() => pickSuggestion(s)} style={suggestBtn}>
                    <strong>{s.clientName}</strong>
                    <span style={{ color: '#5c6b7a' }}> · release faxed to {s.facility} on {formatDateUS(s.faxedOn)}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={field} id={fid('patientId')}>
              <span style={label}>Client or referral</span>
              {client ? (
                <div style={chosen}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{client.name}</div>
                    <div style={meta}>{client.kind === 'referral' ? 'Referral (no client record yet)' : 'Client'}{client.dob ? ` · DOB ${client.dob}` : ''}</div>
                  </div>
                  <button type="button" onClick={() => setClient(null)} style={linkBtn}>Change</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ ...searchWrap, ...(errors.patientId ? FIELD_ERROR_STYLE : null) }}>
                    <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={targets === null ? 'Loading…' : 'Search a client or referral by name or DOB'} style={searchInput} disabled={targets === null} />
                  </div>
                  {matches.length > 0 && (
                    <div style={results} role="listbox">
                      {matches.map((c) => (
                        <button type="button" key={`${c.kind}:${c.id}`} onClick={() => pick(c)} style={resultRow}>
                          <span style={{ fontWeight: 600 }}>{c.name}</span>
                          <span style={meta}>{c.kind === 'referral' ? 'Referral' : 'Client'}{c.dob ? ` · DOB ${c.dob}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {needle.length >= 2 && targets && matches.length === 0 && <div style={{ ...meta, marginTop: 6 }}>No client or open referral matches.</div>}
                </div>
              )}
              <FieldError message={errors.patientId} />
            </div>

            <label style={field} id={fid('category')}>
              <span style={label}>Category</span>
              <select value={category} onChange={(e) => { setCategory(e.target.value); clear('category'); }} style={{ ...withSelectChevron(inp), ...(errors.category ? FIELD_ERROR_STYLE : null) }}>
                <option value="">Choose a Category…</option>
                {DOC_CATEGORY_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                ))}
              </select>
              <FieldError message={errors.category} />
            </label>

            <label style={field} id={fid('title')}>
              <span style={label}>Title</span>
              <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); clear('title'); }} placeholder="e.g. Endocrinology visit note and medication list" style={{ ...inp, ...(errors.title ? FIELD_ERROR_STYLE : null) }} />
              <FieldError message={errors.title} />
            </label>

            <label style={field} id={fid('docDate')}>
              <span style={label}>Document date</span>
              <input type="date" value={docDate} max={today} onChange={(e) => { setDocDate(e.target.value); clear('docDate'); }} style={{ ...inp, maxWidth: 200, ...(errors.docDate ? FIELD_ERROR_STYLE : null) }} />
              <span style={meta}>The date on the records (a visit or lab date), not the day they were faxed.</span>
              <FieldError message={errors.docDate} />
            </label>

            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} className={btn} disabled={busy}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <FolderInput size={14} /> {busy ? 'Filing…' : client?.kind === 'referral' ? 'File to Referral' : 'File to Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const field: React.CSSProperties = { display: 'grid', gap: 5 };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const meta: React.CSSProperties = { fontSize: 12.5, color: '#7f8c8d' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
const searchWrap: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #d1d5db', borderRadius: 8, padding: '0 10px' };
const searchInput: React.CSSProperties = { flex: 1, border: 'none', outline: 'none', padding: '8px 0', fontSize: 14, fontFamily: 'inherit', background: 'transparent' };
const results: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' };
const resultRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10, padding: '8px 12px', background: 'white', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left' };
const chosen: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#f5f8fb', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' };
const suggestBtn: React.CSSProperties = { textAlign: 'left', background: '#e6f4ea', border: '1px solid #b7dfc1', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#14532d', cursor: 'pointer', fontFamily: 'inherit' };
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', padding: 0, color: '#1a3a5c', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' };
