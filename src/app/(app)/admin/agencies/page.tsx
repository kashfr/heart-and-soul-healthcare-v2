'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, RefreshCw, Plus, Pencil, Trash2, Mail, Phone } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';

interface PartnerAgency {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactName: string;
  notes: string;
  shareCount: number;
  lastSharedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

type EditTarget = PartnerAgency | 'new' | null;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<PartnerAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<EditTarget>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/agencies');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      const data = await res.json();
      setAgencies(data.agencies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agencies.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return agencies;
    return agencies.filter((a) =>
      `${a.name} ${a.email} ${a.contactName} ${a.phone}`.toLowerCase().includes(needle)
    );
  }, [agencies, q]);

  const remove = async (a: PartnerAgency) => {
    if (!confirm(`Remove ${a.name} from your agency directory? Past shares are unaffected.`)) return;
    try {
      const res = await authedFetch(`/api/admin/agencies/${a.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      setAgencies((prev) => prev.filter((x) => x.id !== a.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove agency.');
    }
  };

  const onSaved = (saved: PartnerAgency) => {
    setAgencies((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      const next = exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    });
    setEditing(null);
  };

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <header style={headerStyle}>
          <div>
            <p style={kickerStyle}>Admin</p>
            <h1 style={titleStyle}>Agencies</h1>
            <p style={subtitleStyle}>
              Partner agencies you share referrals with. Saved here so the share box can autocomplete
              instead of retyping.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} style={ghostBtnStyle} title="Refresh">
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={() => setEditing('new')} style={primaryBtnStyle}>
              <Plus size={15} /> Add agency
            </button>
          </div>
        </header>

        <div style={{ marginBottom: 14 }}>
          <div style={searchWrapStyle}>
            <Search size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agency, email, contact…"
              style={searchInputStyle}
            />
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
        ) : filtered.length === 0 ? (
          <div style={emptyStyle}>
            {q ? 'No agencies match your search.' : 'No partner agencies yet. Add one, or share a referral and it will be saved here automatically.'}
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Agency</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Contact</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                  <th style={thStyle}>Last shared</th>
                  <th style={{ ...thStyle, width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ verticalAlign: 'top' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#2c3e50' }}>
                      {a.name}
                      {a.notes && <div style={notesStyle}>{a.notes}</div>}
                    </td>
                    <td style={tdStyle}>
                      <a href={`mailto:${a.email}`} style={linkStyle}><Mail size={13} /> {a.email}</a>
                    </td>
                    <td style={tdStyle}>
                      {a.phone ? <a href={`tel:${a.phone}`} style={linkStyle}><Phone size={13} /> {a.phone}</a> : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td style={tdStyle}>{a.contactName || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.shareCount}</td>
                    <td style={tdStyle}>{formatDate(a.lastSharedAt)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      <button onClick={() => setEditing(a)} style={iconBtnStyle} title="Edit"><Pencil size={15} /></button>
                      <button onClick={() => remove(a)} style={{ ...iconBtnStyle, color: '#b3261e' }} title="Remove"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <AgencyForm
          agency={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function AgencyForm({
  agency,
  onClose,
  onSaved,
}: {
  agency: PartnerAgency | null;
  onClose: () => void;
  onSaved: (a: PartnerAgency) => void;
}) {
  const [name, setName] = useState(agency?.name ?? '');
  const [email, setEmail] = useState(agency?.email ?? '');
  const [phone, setPhone] = useState(agency?.phone ?? '');
  const [contactName, setContactName] = useState(agency?.contactName ?? '');
  const [notes, setNotes] = useState(agency?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !email.trim() || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const body = { name: name.trim(), email: email.trim(), phone: phone.trim(), contactName: contactName.trim(), notes: notes.trim() };
      const res = await authedFetch(
        agency ? `/api/admin/agencies/${agency.id}` : '/api/admin/agencies',
        { method: agency ? 'PATCH' : 'POST', body: JSON.stringify(body) }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
      onSaved(data.agency);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save agency.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={modalHeaderStyle}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#2c3e50' }}>
            {agency ? 'Edit agency' : 'Add agency'}
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close"><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Agency name *"><input value={name} onChange={(e) => setName(e.target.value)} style={inp} autoFocus /></Field>
          <Field label="Email *"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={inp} /></Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inp} /></Field>
            <Field label="Contact person"><input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inp} /></Field>
          </div>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} /></Field>
          {err && <div style={{ color: '#b3261e', fontSize: 13 }}>{err}</div>}
        </div>
        <div style={modalFooterStyle}>
          <button onClick={onClose} style={ghostBtnStyle}>Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || !email.trim()}
            style={{ ...primaryBtnStyle, opacity: saving || !name.trim() || !email.trim() ? 0.55 : 1 }}
          >
            {saving ? 'Saving…' : agency ? 'Save changes' : 'Add agency'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', flex: 1 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#5c6b7a', marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const containerStyle: React.CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const headerStyle: React.CSSProperties = { marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 };
const kickerStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: React.CSSProperties = { fontSize: 32, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: React.CSSProperties = { color: '#7f8c8d', fontSize: 15, marginTop: 6, maxWidth: 620 };
const ghostBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const searchWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 12px', maxWidth: 360 };
const searchInputStyle: React.CSSProperties = { border: 'none', outline: 'none', fontSize: 14, flex: 1, fontFamily: 'inherit', color: '#111827' };
const searchClearStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '60px 24px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, color: '#5c6b7a', fontSize: 14 };
const tableWrapStyle: React.CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 };
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', color: '#374151' };
const notesStyle: React.CSSProperties = { fontWeight: 400, fontSize: 12.5, color: '#7f8c8d', marginTop: 3, whiteSpace: 'pre-wrap' };
const linkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1a3a5c', textDecoration: 'none' };
const iconBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#5c6b7a', cursor: 'pointer', padding: 6, display: 'inline-flex' };
const backdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modalStyle: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const modalHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const modalFooterStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
