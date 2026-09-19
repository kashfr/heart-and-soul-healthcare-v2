'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Megaphone, Plus, Trash2, Check, Clock, AlertTriangle, Archive } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';
import { fmtWhen } from '@/components/HandoffInbox';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE, FIELD_ERROR_WRAP_STYLE } from '@/lib/formEscort';
import { publishAnnouncement, retireAnnouncement, subscribeAllAnnouncements } from '@/lib/announcements';
import {
  ANNOUNCEMENT_ROLES,
  ANNOUNCEMENT_ROLE_LABELS,
  MAX_ANNOUNCEMENT_ITEMS,
  announcementFieldOrder,
  validateAnnouncementInput,
  type Announcement,
  type AnnouncementField,
  type AnnouncementItem,
} from '@/lib/announcementShared';
import type { Role } from '@/lib/auth';

/**
 * /admin/announcements (admin only)
 * Compose a "What's new" modal for a role audience, then watch the read
 * receipts come in. Published text is never edited: retire and re-publish.
 */

const fieldId = (k: AnnouncementField) => `ann-field-${k}`;

/** Starting draft: the September 2026 release, so the first publish is one click. */
const SEED_ITEMS: AnnouncementItem[] = [
  { label: 'Seizure log.', text: 'Clients with a seizure disorder: the note now asks about seizures each shift. Log every event.' },
  { label: 'Handoffs.', text: 'Your Plans for Next Shift posts to the next nurse. Acknowledge each handoff you receive at login.' },
  { label: 'Verbal orders.', text: 'Phone orders go in Verbal Orders, not on paper. The portal faxes the physician for signature.' },
  { label: 'Med error reports.', text: 'Report any error you find, same day, under Med Errors. Full sentences, no N/A.' },
];

interface StaffLite { uid: string; name: string; role: Role }

export default function AnnouncementsPage() {
  const { role, loading } = useAuth();
  const [list, setList] = useState<Announcement[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [testUids, setTestUids] = useState<string[]>([]);

  const [title, setTitle] = useState("What's new in the portal");
  const [items, setItems] = useState<AnnouncementItem[]>(SEED_ITEMS);
  const [footer, setFooter] = useState('If a form will not submit, look for the red box. It shows you the exact field.');
  const [audience, setAudience] = useState<Role[]>(['nurse']);
  const [errors, setErrors] = useState<Partial<Record<AnnouncementField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);

  useEffect(() => {
    if (loading || role !== 'admin') return;
    const unsub = subscribeAllAnnouncements(
      (l) => { setList(l); setListError(null); },
      (e) => setListError(e.message || 'Could not load announcements.'),
    );
    // Active staff, so the receipts view can list who has NOT clicked through.
    getDocs(query(collection(db, 'users'), where('active', '==', true)))
      .then((snap) => {
        const rows = snap.docs.map((d) => {
          const u = d.data() as { displayName?: string; role?: Role; isTestAccount?: boolean };
          return { uid: d.id, name: u.displayName || '', role: u.role as Role, test: u.isTestAccount === true };
        });
        setTestUids(rows.filter((u) => u.test).map((u) => u.uid));
        setStaff(rows.filter((u) => u.name && u.role && !u.test).map(({ uid, name, role: r }) => ({ uid, name, role: r })));
      })
      .catch(() => setStaff([]));
    return unsub;
  }, [loading, role]);

  const clearErr = (k: AnnouncementField) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const hi = (k: AnnouncementField): CSSProperties => (errors[k] ? FIELD_ERROR_STYLE : {});

  const submit = async () => {
    if (saving) return;
    setFormError(null);
    const input = { title, items, footer, audience };
    const order = announcementFieldOrder(Math.max(items.length, 1));
    if (!applyFieldErrors(validateAnnouncementInput(input), order, setErrors, fieldId)) return;
    setSaving(true);
    try {
      await publishAnnouncement(input);
      // Clear the form so a second click cannot publish a duplicate.
      setTitle('');
      setItems([{ label: '', text: '' }]);
      setFooter('');
      setErrors({});
      setToast('Published. Everyone in the audience will see it at their next sign-in or note.');
      setTimeout(() => setToast(null), 5000);
    } catch (e) {
      const err = e as Error & { field?: string };
      if (err.field) applyFieldErrors({ [err.field]: err.message } as Partial<Record<AnnouncementField, string>>, order, setErrors, fieldId);
      else setFormError(err.message || 'Could not publish. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const retire = async (id: string) => {
    if (retiring) return;
    if (!window.confirm('Take this announcement down? It will stop appearing; the read receipts stay on record.')) return;
    setRetiring(id);
    try {
      await retireAnnouncement(id);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not retire that announcement.');
    } finally {
      setRetiring(null);
    }
  };

  const updateItem = (i: number, patch: Partial<AnnouncementItem>) => {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  };

  if (loading) return null;
  if (role !== 'admin') {
    return (
      <div style={containerStyle}><div style={wrapStyle}><div style={noticeStyle}><AlertTriangle size={16} /> Announcements are managed by the administrator.</div></div></div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={wrapStyle}>
        <p style={kickerStyle}>Communication</p>
        <h1 style={titleStyle}>Announcements</h1>
        <p style={subtitleStyle}>
          A short &ldquo;What&rsquo;s new&rdquo; message that opens as a popup the next time each person in the audience signs in or opens a
          progress note. They must click <strong>Got it</strong> to continue, and that click is recorded here so you can see who has read it.
        </p>

        {toast && <div style={okStyle}><Check size={16} /> {toast}</div>}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}><Megaphone size={16} style={{ verticalAlign: -3, marginRight: 6 }} />New announcement</h2>
          <p style={hintStyle}>Keep it to one screen on a phone: a title, up to {MAX_ANNOUNCEMENT_ITEMS} items with a bold lead-in and one or two sentences each, and an optional closing line.</p>

          <div style={fieldStyle} id={fieldId('title')}>
            <label style={labelStyle} htmlFor="ann-title">Title *</label>
            <input id="ann-title" value={title} maxLength={80} style={{ ...inputStyle, ...hi('title') }} aria-invalid={!!errors.title}
              onChange={(e) => { clearErr('title'); setTitle(e.target.value); }} />
            <FieldError message={errors.title} />
          </div>

          <div style={{ ...labelStyle, marginBottom: 6 }}>Items *</div>
          {items.map((it, i) => (
            <div key={i} style={itemRowStyle}>
              <span style={numStyle}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={fieldStyle} id={fieldId(`item-${i}-label`)}>
                  <input value={it.label} placeholder="Bold lead-in, e.g. Handoffs." maxLength={40} style={{ ...inputStyle, ...hi(`item-${i}-label`) }} aria-invalid={!!errors[`item-${i}-label`]}
                    onChange={(e) => { clearErr(`item-${i}-label`); updateItem(i, { label: e.target.value }); }} />
                  <FieldError message={errors[`item-${i}-label`]} />
                </div>
                <div style={fieldStyle} id={fieldId(`item-${i}-text`)}>
                  <textarea value={it.text} placeholder="What to do and where, in one or two sentences." maxLength={240} style={{ ...textareaStyle, ...hi(`item-${i}-text`) }} aria-invalid={!!errors[`item-${i}-text`]}
                    onChange={(e) => { clearErr(`item-${i}-text`); updateItem(i, { text: e.target.value }); }} />
                  <FieldError message={errors[`item-${i}-text`]} />
                </div>
              </div>
              <button type="button" title="Remove this item" style={iconBtnStyle} disabled={items.length === 1}
                onClick={() => { setErrors({}); setItems((prev) => prev.filter((_, j) => j !== i)); }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {items.length < MAX_ANNOUNCEMENT_ITEMS && (
            <button type="button" style={linkBtnStyle} onClick={() => setItems((prev) => [...prev, { label: '', text: '' }])}>
              <Plus size={14} /> Add an item
            </button>
          )}

          <div style={{ ...fieldStyle, marginTop: 12 }} id={fieldId('footer')}>
            <label style={labelStyle} htmlFor="ann-footer">Closing line (optional)</label>
            <input id="ann-footer" value={footer} maxLength={200} style={{ ...inputStyle, ...hi('footer') }} aria-invalid={!!errors.footer}
              onChange={(e) => { clearErr('footer'); setFooter(e.target.value); }} />
            <FieldError message={errors.footer} />
          </div>

          <div style={fieldStyle} id={fieldId('audience')}>
            <div style={labelStyle}>Who sees it *</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...(errors.audience ? FIELD_ERROR_WRAP_STYLE : {}) }}>
              {ANNOUNCEMENT_ROLES.map((r) => {
                const on = audience.includes(r);
                return (
                  <button key={r} type="button" style={on ? chipActiveStyle : chipStyle} aria-pressed={on}
                    onClick={() => { clearErr('audience'); setAudience((a) => (on ? a.filter((x) => x !== r) : [...a, r])); }}>
                    {ANNOUNCEMENT_ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.audience} />
          </div>

          {formError && <div style={noticeStyle} role="alert"><AlertTriangle size={16} /> {formError}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={{ ...primaryBtnStyle, opacity: saving ? 0.7 : 1 }} onClick={() => void submit()} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </section>

        <h2 style={{ ...sectionTitleStyle, marginTop: 24 }}>Published</h2>
        {listError && <div style={noticeStyle} role="alert"><AlertTriangle size={16} /> {listError}</div>}
        {list.length === 0 && !listError && <p style={hintStyle}>Nothing published yet.</p>}
        {list.map((a) => (
          <AnnouncementCard key={a.id} a={a} staff={staff} testUids={testUids} retiring={retiring === a.id} onRetire={() => void retire(a.id)} />
        ))}
      </div>
    </div>
  );
}

function AnnouncementCard({ a, staff, testUids, retiring, onRetire }: { a: Announcement; staff: StaffLite[]; testUids: string[]; retiring: boolean; onRetire: () => void }) {
  const [open, setOpen] = useState(false);
  const expected = useMemo(() => staff.filter((s) => a.audience.includes(s.role)).sort((x, y) => x.name.localeCompare(y.name)), [staff, a.audience]);
  const acked = expected.filter((s) => a.acks[s.uid]);
  const waiting = expected.filter((s) => !a.acks[s.uid]);
  // People who acked but are no longer active staff. The test account is left out.
  const others = Object.entries(a.acks).filter(([uid]) => !expected.some((s) => s.uid === uid) && !testUids.includes(uid));

  return (
    <section style={{ ...cardStyle, opacity: a.active ? 1 : 0.7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{a.title}</div>
          <div style={hintStyle}>
            {a.active ? <span style={activePill}>Active</span> : <span style={retiredPill}><Archive size={11} /> Retired</span>}
            {' '}To {a.audience.map((r) => ANNOUNCEMENT_ROLE_LABELS[r].toLowerCase()).join(', ')} · published {fmtWhen(a.publishedAt)} by {a.publishedByName || 'the office'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={countPill}><Check size={12} /> {acked.length + others.length} read</span>
          {expected.length > 0 && <span style={{ ...countPill, background: waiting.length ? '#fff4e0' : '#e6f4ec', color: waiting.length ? '#9a5b00' : '#0e7c4a' }}><Clock size={12} /> {waiting.length} waiting</span>}
          {a.active && (
            <button type="button" style={secondaryBtnStyle} onClick={onRetire} disabled={retiring}>{retiring ? 'Retiring…' : 'Retire'}</button>
          )}
        </div>
      </div>

      <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13.5, color: '#2c3e50', lineHeight: 1.5 }}>
        {a.items.map((it, i) => <li key={i}><strong>{it.label}</strong> {it.text}</li>)}
      </ol>
      {a.footer && <div style={{ ...hintStyle, marginTop: 6, fontStyle: 'italic' }}>{a.footer}</div>}

      <button type="button" style={{ ...linkBtnStyle, marginTop: 10 }} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'Show'} who has read it
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 8 }}>
          <div>
            <div style={labelStyle}>Read ({acked.length + others.length})</div>
            <ul style={receiptList}>
              {acked.map((s) => <li key={s.uid}><Check size={12} color="#0e7c4a" /> {s.name} <span style={hintStyle}>{fmtWhen(a.acks[s.uid].at)}</span></li>)}
              {others.map(([uid, ack]) => <li key={uid}><Check size={12} color="#0e7c4a" /> {ack.name || uid} <span style={hintStyle}>{fmtWhen(ack.at)}</span></li>)}
              {acked.length + others.length === 0 && <li style={hintStyle}>No one yet.</li>}
            </ul>
          </div>
          <div>
            <div style={labelStyle}>Waiting ({waiting.length})</div>
            <ul style={receiptList}>
              {waiting.map((s) => <li key={s.uid}><Clock size={12} color="#9a5b00" /> {s.name}</li>)}
              {waiting.length === 0 && <li style={hintStyle}>Everyone has read it.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

const NAVY = '#1a3a5c';
const containerStyle: CSSProperties = { minHeight: '70vh', background: '#f5f7fa', padding: '32px 20px' };
const wrapStyle: CSSProperties = { maxWidth: 820, margin: '0 auto' };
const kickerStyle: CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#27ae60', margin: 0 };
const titleStyle: CSSProperties = { fontSize: 28, color: '#2c3e50', margin: '4px 0 0' };
const subtitleStyle: CSSProperties = { color: '#7f8c8d', fontSize: 14.5, marginTop: 6, lineHeight: 1.5, marginBottom: 18 };
const cardStyle: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 14 };
const sectionTitleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 8px' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, minWidth: 0 };
const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#5c6b7a' };
const hintStyle: CSSProperties = { fontSize: 12.5, color: '#8a949e', lineHeight: 1.45 };
const inputStyle: CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #d0d7de', borderRadius: 6, fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', height: 40 };
const textareaStyle: CSSProperties = { ...inputStyle, height: 'auto', minHeight: 60, resize: 'vertical', lineHeight: 1.5 };
const itemRowStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 4 };
const numStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: '#0e7c4a', color: 'white', fontSize: 11.5, fontWeight: 700, flexShrink: 0, marginTop: 9 };
const iconBtnStyle: CSSProperties = { background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, color: '#7f8c8d', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginTop: 4, flexShrink: 0 };
const linkBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 };
const chipStyle: CSSProperties = { background: '#f1f5f9', color: '#475569', borderWidth: 1, borderStyle: 'solid', borderColor: '#e2e8f0', padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const chipActiveStyle: CSSProperties = { ...chipStyle, background: '#e8eef4', color: NAVY, borderColor: NAVY };
const noticeStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: '#fdeaea', color: '#b3261e', border: '1px solid #f0c8c4', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 14 };
const okStyle: CSSProperties = { ...noticeStyle, background: '#e6f4ec', color: '#0e7c4a', border: '1px solid #b7e0c6' };
const primaryBtnStyle: CSSProperties = { background: NAVY, color: 'white', border: 'none', padding: '11px 18px', borderRadius: 8, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
const secondaryBtnStyle: CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d0d7de', padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const countPill: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e6f4ec', color: '#0e7c4a', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 };
const activePill: CSSProperties = { display: 'inline-block', background: '#e6f4ec', color: '#0e7c4a', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const retiredPill: CSSProperties = { ...activePill, background: '#f1f5f9', color: '#64748b' };
const receiptList: CSSProperties = { listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, color: '#2c3e50' };
