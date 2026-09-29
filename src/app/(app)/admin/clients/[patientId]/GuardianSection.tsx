'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Scale, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getGuardian, saveGuardian } from '@/lib/guardian';
import {
  DECISION_MAKER_LABELS,
  GUARDIAN_ROLES,
  hasGuardianErrors,
  requiredRole,
  validateGuardian,
  type ContactErrorKey,
  type DecisionMaker,
  type GuardianContact,
  type GuardianErrors,
  type GuardianRecord,
} from '@/lib/guardianShared';
import { FieldError, FIELD_ERROR_STYLE, escortToField } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';
import { formatUSPhoneExt } from '@/lib/phone';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Staff edit; the rest of the care team reads. */
  canEdit: boolean;
  actorName: string;
  onToast: (msg: string) => void;
}

const DM_ID = 'gd-decision-maker';
const LIST_ID = 'gd-contacts';
const rowFieldId = (rowId: string, k: ContactErrorKey) => `gd-${rowId}-${k}`;
const newId = () => Math.random().toString(36).slice(2, 10);
const emptyErrors: GuardianErrors = { rows: {} };

/**
 * Client-dashboard card: who makes legal decisions for the client and how to
 * reach them, plus payee, conservator, and responsible-party contacts. The
 * person to call for consents and signatures (releases of information, ISP
 * signature pages, service agreements).
 */
export default function GuardianSection({ patientId, canEdit, actorName, onToast }: Props) {
  const [record, setRecord] = useState<GuardianRecord | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dm, setDm] = useState<DecisionMaker | undefined>(undefined);
  const [draft, setDraft] = useState<GuardianContact[]>([]);
  const [errors, setErrors] = useState<GuardianErrors>(emptyErrors);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    setEditing(false);
    getGuardian(patientId)
      .then((d) => { if (!cancelled) setRecord(d); })
      .catch((err) => { console.error('Guardian load failed:', err); if (!cancelled) setLoadError('Could not load guardian information.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const contacts = record?.contacts || [];
  const hasRecord = !!record?.decisionMaker;

  const startEdit = () => {
    setDm(record?.decisionMaker || undefined);
    setDraft(contacts.map((c) => ({ ...c })));
    setErrors(emptyErrors);
    setSaveError(null);
    setEditing(true);
  };

  const pickDm = (v: DecisionMaker) => {
    setDm(v);
    const need = requiredRole(v);
    // Offer the row the answer calls for, so the next step is obvious.
    if (need && !draft.some((c) => c.role === need)) setDraft((d) => [{ id: newId(), role: need, name: '' }, ...d]);
    setErrors((e) => ({ ...e, decisionMaker: undefined, contacts: undefined }));
  };

  const setField = (rowId: string, k: keyof GuardianContact, v: string) => {
    setDraft((d) => d.map((c) => (c.id === rowId ? { ...c, [k]: v } : c)));
    const errKey: ContactErrorKey | null = k === 'role' || k === 'name' ? k : k === 'phone' || k === 'email' ? 'reach' : null;
    if (errKey && errors.rows[rowId]?.[errKey]) {
      setErrors((e) => {
        const row = { ...(e.rows[rowId] || {}) };
        delete row[errKey];
        return { ...e, rows: { ...e.rows, [rowId]: row } };
      });
    }
    if (k === 'role') setErrors((e) => ({ ...e, contacts: undefined }));
  };

  const save = async () => {
    const rec: GuardianRecord = { decisionMaker: dm, contacts: draft };
    const errs = validateGuardian(rec);
    setErrors(errs);
    if (hasGuardianErrors(errs)) {
      if (errs.decisionMaker) return escortToField(DM_ID);
      for (const c of draft) {
        const e = errs.rows[c.id];
        const first = e && (['role', 'name', 'reach'] as const).find((k) => e[k]);
        if (first) return escortToField(rowFieldId(c.id, first));
      }
      return escortToField(LIST_ID);
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveGuardian(patientId, rec, actorName);
      setRecord(await getGuardian(patientId));
      setEditing(false);
      onToast('Guardian information saved.');
    } catch (err) {
      console.error('Guardian save failed:', err);
      setSaveError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const updatedAt = record?.updatedAt && typeof (record.updatedAt as { toDate?: () => Date }).toDate === 'function'
    ? (record.updatedAt as { toDate: () => Date }).toDate()
    : null;
  const updatedISO = updatedAt
    ? `${updatedAt.getFullYear()}-${String(updatedAt.getMonth() + 1).padStart(2, '0')}-${String(updatedAt.getDate()).padStart(2, '0')}`
    : '';

  return (
    <section style={card}>
      <div style={head}>
        <div style={title}><Scale size={16} /> Guardian and Responsible Parties</div>
        {canEdit && !editing && record !== undefined && !loadError && (
          <button type="button" onClick={startEdit} style={ghostBtn}>
            <Pencil size={13} /> {hasRecord ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && record === undefined && <div style={muted}>Loading...</div>}

      {!loadError && record !== undefined && !editing && (
        <>
          {!hasRecord ? (
            <div style={muted}>No guardian information on file.{canEdit ? ' Add who signs consents and releases for this client.' : ''}</div>
          ) : (
            <>
              <div style={statusLine}>{DECISION_MAKER_LABELS[record!.decisionMaker as DecisionMaker]}</div>
              {contacts.length > 0 && (
                <ul style={rows}>
                  {contacts.map((c) => (
                    <li key={c.id} style={rowItem}>
                      <div>
                        <strong style={{ color: NAVY }}>{c.name}</strong>
                        <span style={chip}>{c.role}</span>
                      </div>
                      {c.relationship && <div style={sub}>{c.relationship}</div>}
                      {(c.phone || c.email) && (
                        <div style={contactLine}>
                          {c.phone && <a href={`tel:${c.phone}`} style={link}>{c.phone}</a>}
                          {c.email && <a href={`mailto:${c.email}`} style={link}>{c.email}</a>}
                        </div>
                      )}
                      {c.address && <div style={sub}>{c.address}</div>}
                      {c.notes && <div style={{ ...sub, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
                    </li>
                  ))}
                </ul>
              )}
              <div style={stamp}>
                Last updated{updatedISO ? ` ${formatDateUS(updatedISO)}` : ''}{record?.updatedByName ? ` by ${record.updatedByName}` : ''}
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <div>
          <div id={DM_ID} style={{ marginBottom: 14 }}>
            <div style={label}>Who makes legal decisions for this client? *</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, ...(errors.decisionMaker ? { ...FIELD_ERROR_STYLE, borderRadius: 8, padding: 6 } : null) }}>
              {(Object.keys(DECISION_MAKER_LABELS) as DecisionMaker[]).map((v) => (
                <button key={v} type="button" onClick={() => pickDm(v)} style={{ ...choiceBtn, ...(dm === v ? choiceBtnOn : null) }}>
                  {DECISION_MAKER_LABELS[v]}
                </button>
              ))}
            </div>
            <FieldError message={errors.decisionMaker} />
          </div>

          <div id={LIST_ID}>
            {draft.map((c, i) => {
              const e = errors.rows[c.id] || {};
              return (
                <div key={c.id} style={editRow}>
                  <div style={editRowHead}>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>Contact {i + 1}</span>
                    <button type="button" onClick={() => setDraft((d) => d.filter((x) => x.id !== c.id))} style={removeBtn} aria-label={`Remove contact ${i + 1}`}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                  <div style={formGrid}>
                    <Field id={rowFieldId(c.id, 'role')} label="Role *" error={e.role}>
                      <select style={e.role ? { ...select, ...FIELD_ERROR_STYLE } : select} value={c.role} onChange={(ev) => setField(c.id, 'role', ev.target.value)}>
                        <option value="">Select...</option>
                        {GUARDIAN_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Field>
                    <Field id={rowFieldId(c.id, 'name')} label="Name *" error={e.name}>
                      <input style={inputFor(e.name)} value={c.name} onChange={(ev) => setField(c.id, 'name', ev.target.value)} />
                    </Field>
                    <Field label="Relationship or agency">
                      <input style={input} value={c.relationship || ''} onChange={(ev) => setField(c.id, 'relationship', ev.target.value)} placeholder="e.g. Mother, or State (DHS representative)" />
                    </Field>
                    <Field id={rowFieldId(c.id, 'reach')} label="Phone" error={e.reach}>
                      <input type="tel" style={inputFor(e.reach)} value={c.phone || ''} onChange={(ev) => setField(c.id, 'phone', formatUSPhoneExt(ev.target.value))} />
                    </Field>
                    <Field label="Email">
                      <input type="email" style={inputFor(e.reach)} value={c.email || ''} onChange={(ev) => setField(c.id, 'email', ev.target.value)} />
                    </Field>
                    <Field label="Address" wide>
                      <input style={input} value={c.address || ''} onChange={(ev) => setField(c.id, 'address', ev.target.value)} />
                    </Field>
                    <Field label="Notes" wide>
                      <input style={input} value={c.notes || ''} onChange={(ev) => setField(c.id, 'notes', ev.target.value)} placeholder="Where this came from, best way to reach them, etc." />
                    </Field>
                  </div>
                </div>
              );
            })}
            <FieldError message={errors.contacts} />
          </div>
          <button type="button" onClick={() => setDraft((d) => [...d, { id: newId(), role: '', name: '' }])} style={{ ...ghostBtn, marginTop: 6 }}>
            <Plus size={13} /> Add Contact
          </button>
          {saveError && <div style={{ ...errBox, marginTop: 10 }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(false)} style={ghostBtn} disabled={saving}>Cancel</button>
            <button type="button" onClick={save} style={primaryBtn} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ id, label: l, error, wide, children }: { id?: string; label: string; error?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div id={id} style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={label}>{l}</div>
      {children}
      <FieldError message={error} />
    </div>
  );
}

const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
const title: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY };
const removeBtn: CSSProperties = { ...ghostBtn, color: '#b3261e', padding: '4px 8px' };
const primaryBtn: CSSProperties = { background: NAVY, color: 'white', border: '1px solid ' + NAVY, borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const choiceBtn: CSSProperties = { background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: NAVY };
const choiceBtnOn: CSSProperties = { background: NAVY, color: 'white', border: '1px solid ' + NAVY };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const statusLine: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: '#2c3e50', marginBottom: 8 };
const rows: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 };
const rowItem: CSSProperties = { borderTop: '1px solid #eef1f4', paddingTop: 10, fontSize: 13.5, color: '#2c3e50', overflowWrap: 'anywhere' };
const chip: CSSProperties = { marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: '#5c6b7a', background: '#f1f4f7', borderRadius: 10, padding: '2px 8px' };
const sub: CSSProperties = { color: '#5c6b7a', marginTop: 2 };
const contactLine: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2 };
const link: CSSProperties = { color: '#1d5fa8', textDecoration: 'none' };
const stamp: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 12 };
const editRow: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fbfcfd' };
const editRowHead: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#2c3e50', marginBottom: 4 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const select: CSSProperties = withSelectChevron(input);
const inputFor = (err?: string): CSSProperties => (err ? { ...input, ...FIELD_ERROR_STYLE } : input);
