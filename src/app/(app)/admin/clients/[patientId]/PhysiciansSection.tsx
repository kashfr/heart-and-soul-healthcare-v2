'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { btn, btnDanger, btnPrimary, btnSm } from '@/components/buttons';
import { Stethoscope, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getPhysicians, savePhysicians } from '@/lib/physicians';
import {
  PHYSICIAN_SPECIALTIES,
  validatePhysicians,
  type Physician,
  type PhysicianErrorKey,
  type PhysicianErrors,
  type PhysicianList,
} from '@/lib/physiciansShared';
import { FieldError, FIELD_ERROR_STYLE, escortToField } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';
import { formatUSPhone, formatUSPhoneExt } from '@/lib/phone';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Staff edit; the rest of the care team reads. */
  canEdit: boolean;
  actorName: string;
  onToast: (msg: string) => void;
}

const fieldId = (rowId: string, k: PhysicianErrorKey) => `ph-${rowId}-${k}`;
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Client-dashboard card: every doctor who treats this client, with the
 * practice's phone and fax. Reference directory; the attending physician
 * used for verbal orders and PPOT stays on the clinical profile.
 */
export default function PhysiciansSection({ patientId, canEdit, actorName, onToast }: Props) {
  const [record, setRecord] = useState<PhysicianList | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Physician[]>([]);
  const [errors, setErrors] = useState<PhysicianErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    setEditing(false);
    getPhysicians(patientId)
      .then((d) => { if (!cancelled) setRecord(d); })
      .catch((err) => { console.error('Physicians load failed:', err); if (!cancelled) setLoadError('Could not load the physician list.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const list = record?.list || [];

  const startEdit = () => {
    setDraft(list.length ? list.map((p) => ({ ...p })) : [{ id: newId(), name: '', specialty: '' }]);
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const setField = (rowId: string, k: keyof Physician, v: string) => {
    setDraft((d) => d.map((p) => (p.id === rowId ? { ...p, [k]: v } : p)));
    if (errors[rowId]?.[k as PhysicianErrorKey]) {
      setErrors((e) => {
        const row = { ...(e[rowId] || {}) };
        delete row[k as PhysicianErrorKey];
        return { ...e, [rowId]: row };
      });
    }
  };

  const save = async () => {
    const errs = validatePhysicians(draft);
    setErrors(errs);
    for (const p of draft) {
      const e = errs[p.id];
      if (!e) continue;
      const first = (['name', 'specialty', 'fax'] as const).find((k) => e[k]);
      if (first) { escortToField(fieldId(p.id, first)); return; }
    }
    setSaving(true);
    setSaveError(null);
    try {
      await savePhysicians(patientId, draft, actorName);
      setRecord(await getPhysicians(patientId));
      setEditing(false);
      onToast('Physicians saved.');
    } catch (err) {
      console.error('Physicians save failed:', err);
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
        <div style={title}><Stethoscope size={16} /> Physicians</div>
        {canEdit && !editing && record !== undefined && !loadError && (
          <button type="button" onClick={startEdit} className={btn}>
            <Pencil size={13} /> {list.length ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && record === undefined && <div style={muted}>Loading...</div>}

      {!loadError && record !== undefined && !editing && (
        <>
          {list.length === 0 ? (
            <div style={muted}>No physicians on file.{canEdit ? ' Add each doctor with their phone and fax so nobody has to dig through the ISP for them.' : ''}</div>
          ) : (
            <ul style={rows}>
              {list.map((p) => (
                <li key={p.id} style={rowItem}>
                  <div>
                    <strong style={{ color: NAVY }}>{p.name}</strong>
                    <span style={chip}>{p.specialty}</span>
                  </div>
                  {p.practice && <div style={sub}>{p.practice}</div>}
                  {p.address && <div style={sub}>{p.address}</div>}
                  {(p.phone || p.fax) && (
                    <div style={contactLine}>
                      {p.phone && <span>Phone <a href={`tel:${p.phone}`} style={link}>{p.phone}</a></span>}
                      {p.fax && <span>Fax {p.fax}</span>}
                    </div>
                  )}
                  {p.notes && <div style={{ ...sub, whiteSpace: 'pre-wrap' }}>{p.notes}</div>}
                </li>
              ))}
            </ul>
          )}
          {list.length > 0 && (
            <div style={stamp}>
              Last updated{updatedISO ? ` ${formatDateUS(updatedISO)}` : ''}{record?.updatedByName ? ` by ${record.updatedByName}` : ''}
            </div>
          )}
        </>
      )}

      {editing && (
        <div>
          {draft.map((p, i) => {
            const e = errors[p.id] || {};
            return (
              <div key={p.id} style={editRow}>
                <div style={editRowHead}>
                  <span style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>Physician {i + 1}</span>
                  <button type="button" onClick={() => setDraft((d) => d.filter((x) => x.id !== p.id))} className={`${btnDanger} ${btnSm}`} aria-label={`Remove physician ${i + 1}`}>
                    <Trash2 size={13} /> Remove
                  </button>
                </div>
                <div style={formGrid}>
                  <Field id={fieldId(p.id, 'name')} label="Name *" error={e.name}>
                    <input style={inputFor(e.name)} value={p.name} onChange={(ev) => setField(p.id, 'name', ev.target.value)} placeholder="e.g. Dr. Jennifer Gilligan" />
                  </Field>
                  <Field id={fieldId(p.id, 'specialty')} label="Specialty *" error={e.specialty}>
                    <select style={e.specialty ? { ...select, ...FIELD_ERROR_STYLE } : select} value={p.specialty} onChange={(ev) => setField(p.id, 'specialty', ev.target.value)}>
                      <option value="">Select...</option>
                      {PHYSICIAN_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Practice">
                    <input style={input} value={p.practice || ''} onChange={(ev) => setField(p.id, 'practice', ev.target.value)} />
                  </Field>
                  <Field label="Address" wide>
                    <input style={input} value={p.address || ''} onChange={(ev) => setField(p.id, 'address', ev.target.value)} placeholder="Street, suite, city, state ZIP" />
                  </Field>
                  <Field label="Phone">
                    <input type="tel" style={input} value={p.phone || ''} onChange={(ev) => setField(p.id, 'phone', formatUSPhoneExt(ev.target.value))} />
                  </Field>
                  <Field id={fieldId(p.id, 'fax')} label="Fax" error={e.fax}>
                    <input type="tel" style={inputFor(e.fax)} value={p.fax || ''} onChange={(ev) => setField(p.id, 'fax', formatUSPhone(ev.target.value))} />
                  </Field>
                  <Field label="Notes" wide>
                    <input style={input} value={p.notes || ''} onChange={(ev) => setField(p.id, 'notes', ev.target.value)} placeholder="Where this came from, last visit, etc." />
                  </Field>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setDraft((d) => [...d, { id: newId(), name: '', specialty: '' }])} className={btn}>
            <Plus size={13} /> Add Physician
          </button>
          {saveError && <div style={{ ...errBox, marginTop: 10 }}>{saveError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(false)} className={btn} disabled={saving}>Cancel</button>
            <button type="button" onClick={save} className={btnPrimary} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
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
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const rows: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 };
const rowItem: CSSProperties = { borderTop: '1px solid #eef1f4', paddingTop: 10, fontSize: 13.5, color: '#2c3e50', overflowWrap: 'anywhere' };
const chip: CSSProperties = { marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: '#5c6b7a', background: '#f1f4f7', borderRadius: 10, padding: '2px 8px' };
const sub: CSSProperties = { color: '#5c6b7a', marginTop: 2 };
const contactLine: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2, color: '#5c6b7a' };
const link: CSSProperties = { color: '#1d5fa8', textDecoration: 'none' };
const stamp: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 12 };
const editRow: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fbfcfd' };
const editRowHead: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#2c3e50', marginBottom: 4 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const select: CSSProperties = withSelectChevron(input);
const inputFor = (err?: string): CSSProperties => (err ? { ...input, ...FIELD_ERROR_STYLE } : input);
