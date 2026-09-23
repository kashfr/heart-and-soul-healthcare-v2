'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Building2, Pencil } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getDayProgram, saveDayProgram } from '@/lib/dayProgram';
import {
  DAY_PROGRAM_ERROR_ORDER,
  DAY_PROGRAM_SERVICE_TYPES,
  validateDayProgram,
  type DayProgram,
  type DayProgramErrorKey,
} from '@/lib/dayProgramShared';
import { FieldError, FIELD_ERROR_STYLE, applyFieldErrors } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Staff edit; everyone else who can read the clinical record sees it read-only. */
  canEdit: boolean;
  actorName: string;
  onToast: (msg: string) => void;
}

const fieldId = (k: DayProgramErrorKey) => `dp-field-${k}`;

/**
 * Client-dashboard card: the day program this client attends and who to
 * contact there. Read by the care team; edited by staff.
 */
export default function DayProgramSection({ patientId, canEdit, actorName, onToast }: Props) {
  const [record, setRecord] = useState<DayProgram | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DayProgram>({});
  const [errors, setErrors] = useState<Partial<Record<DayProgramErrorKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    setEditing(false);
    getDayProgram(patientId)
      .then((d) => { if (!cancelled) setRecord(d); })
      .catch((err) => { console.error('Day program load failed:', err); if (!cancelled) setLoadError('Could not load the day program.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const startEdit = () => {
    setDraft({ ...(record || {}) });
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const set = (k: keyof DayProgram, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as DayProgramErrorKey] || (['phone', 'cell', 'email'].includes(k) && errors.contact)) {
      setErrors((e) => {
        const next = { ...e };
        delete next[k as DayProgramErrorKey];
        if (['phone', 'cell', 'email'].includes(k)) delete next.contact;
        return next;
      });
    }
  };

  const save = async () => {
    if (!applyFieldErrors(validateDayProgram(draft), DAY_PROGRAM_ERROR_ORDER, setErrors, fieldId)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDayProgram(patientId, draft, actorName);
      setRecord(await getDayProgram(patientId));
      setEditing(false);
      onToast('Day program saved.');
    } catch (err) {
      console.error('Day program save failed:', err);
      setSaveError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const updatedAt = record?.updatedAt && typeof (record.updatedAt as { toDate?: () => Date }).toDate === 'function'
    ? (record.updatedAt as { toDate: () => Date }).toDate()
    : null;

  return (
    <section style={card}>
      <div style={head}>
        <div style={title}><Building2 size={16} /> Day program</div>
        {canEdit && !editing && record !== undefined && !loadError && (
          <button type="button" onClick={startEdit} style={ghostBtn}>
            <Pencil size={13} /> {record ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && record === undefined && <div style={muted}>Loading...</div>}

      {!loadError && record !== undefined && !editing && (
        <>
          {!record || !record.attends ? (
            <div style={muted}>
              No day program information on file.{canEdit ? ' Add it so nurses know where this client spends the day and who to contact there.' : ''}
            </div>
          ) : record.attends === 'no' ? (
            <div style={muted}>Does not attend a day program.</div>
          ) : (
            <dl style={grid}>
              <Row label="Program">
                <strong>{record.programName}</strong>
                {record.serviceType ? <span style={{ color: '#5c6b7a' }}> ({record.serviceType})</span> : null}
                {record.operator ? <div style={{ color: '#5c6b7a' }}>Operated by {record.operator}</div> : null}
              </Row>
              <Row label="Site address">{record.address}</Row>
              {(record.schedule || record.startedOn) && (
                <Row label="Attends">
                  {[record.schedule, record.startedOn ? `since ${formatDateUS(record.startedOn)}` : ''].filter(Boolean).join(', ')}
                </Row>
              )}
              <Row label="Contact">
                {record.contactName}{record.contactTitle ? `, ${record.contactTitle}` : ''}
                <div style={contactLines}>
                  {record.phone && <span>Office <a href={`tel:${record.phone}`} style={link}>{record.phone}</a></span>}
                  {record.cell && <span>Cell <a href={`tel:${record.cell}`} style={link}>{record.cell}</a></span>}
                  {record.fax && <span>Fax {record.fax}</span>}
                  {record.email && <a href={`mailto:${record.email}`} style={link}>{record.email}</a>}
                </div>
              </Row>
              {record.staff && <Row label="Program staff">{record.staff}</Row>}
              {record.notes && <Row label="Notes"><span style={{ whiteSpace: 'pre-wrap' }}>{record.notes}</span></Row>}
            </dl>
          )}
          {record?.attends && (
            <div style={stamp}>
              Last updated{updatedAt ? ` ${formatDateUS(`${updatedAt.getFullYear()}-${String(updatedAt.getMonth() + 1).padStart(2, '0')}-${String(updatedAt.getDate()).padStart(2, '0')}`)}` : ''}
              {record.updatedByName ? ` by ${record.updatedByName}` : ''}
            </div>
          )}
        </>
      )}

      {editing && (
        <div>
          <div id={fieldId('attends')} style={{ marginBottom: 12 }}>
            <div style={label}>Does this client attend a day program? *</div>
            <div style={{ display: 'flex', gap: 8, ...(errors.attends ? { ...FIELD_ERROR_STYLE, borderRadius: 8, padding: 6 } : null) }}>
              {(['yes', 'no'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('attends', v)}
                  style={{ ...choiceBtn, ...(draft.attends === v ? choiceBtnOn : null) }}
                >
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            <FieldError message={errors.attends} />
          </div>

          {draft.attends === 'yes' && (
            <div style={formGrid}>
              <Field id={fieldId('programName')} label="Program name *" error={errors.programName}>
                <input style={inputFor(errors.programName)} value={draft.programName || ''} onChange={(e) => set('programName', e.target.value)} placeholder="e.g. Treasure's Box" />
              </Field>
              <Field label="Operated by (provider)">
                <input style={input} value={draft.operator || ''} onChange={(e) => set('operator', e.target.value)} placeholder="e.g. Seabreeze Retreat, Inc." />
              </Field>
              <Field label="Service type">
                <select style={select} value={draft.serviceType || ''} onChange={(e) => set('serviceType', e.target.value)}>
                  <option value="">Select...</option>
                  {DAY_PROGRAM_SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field id={fieldId('startedOn')} label="Attending since" error={errors.startedOn}>
                <input type="date" style={inputFor(errors.startedOn)} value={draft.startedOn || ''} onChange={(e) => set('startedOn', e.target.value)} />
              </Field>
              <Field id={fieldId('address')} label="Program site address *" error={errors.address} wide hint="Where the client actually attends. A provider's office address is often different.">
                <input style={inputFor(errors.address)} value={draft.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="Street, city, state ZIP" />
              </Field>
              <Field label="Schedule" wide>
                <input style={input} value={draft.schedule || ''} onChange={(e) => set('schedule', e.target.value)} placeholder="e.g. Monday through Friday" />
              </Field>
              <Field id={fieldId('contactName')} label="Primary contact *" error={errors.contactName}>
                <input style={inputFor(errors.contactName)} value={draft.contactName || ''} onChange={(e) => set('contactName', e.target.value)} />
              </Field>
              <Field label="Contact title">
                <input style={input} value={draft.contactTitle || ''} onChange={(e) => set('contactTitle', e.target.value)} />
              </Field>
              <Field id={fieldId('contact')} label="Office phone" error={errors.contact}>
                <input type="tel" style={inputFor(errors.contact)} value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Cell">
                <input type="tel" style={inputFor(errors.contact)} value={draft.cell || ''} onChange={(e) => set('cell', e.target.value)} />
              </Field>
              <Field id={fieldId('email')} label="Email" error={errors.email}>
                <input type="email" style={inputFor(errors.email || errors.contact)} value={draft.email || ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Fax">
                <input type="tel" style={input} value={draft.fax || ''} onChange={(e) => set('fax', e.target.value)} />
              </Field>
              <Field label="Program staff who support this client" wide hint="Names and roles. Used as the roster for HCP and proxy-caregiver training.">
                <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={draft.staff || ''} onChange={(e) => set('staff', e.target.value)} />
              </Field>
              <Field label="Notes" wide hint="Best times to visit or train, site instructions, anything else.">
                <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}

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

function Row({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt style={dt}>{l}</dt>
      <dd style={dd}>{children}</dd>
    </>
  );
}

function Field({ id, label: l, error, hint, wide, children }: { id?: string; label: string; error?: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div id={id} style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={label}>{l}</div>
      {children}
      {hint && !error ? <div style={hintStyle}>{hint}</div> : null}
      <FieldError message={error} />
    </div>
  );
}

const card: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, marginBottom: 14 };
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
const title: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: NAVY };
const primaryBtn: CSSProperties = { background: NAVY, color: 'white', border: '1px solid ' + NAVY, borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const choiceBtn: CSSProperties = { background: 'white', border: '1px solid #d0d7de', borderRadius: 6, padding: '6px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: NAVY };
const choiceBtnOn: CSSProperties = { background: NAVY, color: 'white', border: '1px solid ' + NAVY };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) 1fr', columnGap: 14, rowGap: 8, margin: 0, fontSize: 13.5, color: '#2c3e50' };
const dt: CSSProperties = { fontSize: 11.5, color: '#5c6b7a', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 2 };
const dd: CSSProperties = { margin: 0, minWidth: 0, overflowWrap: 'anywhere' };
const contactLines: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2, color: '#5c6b7a' };
const link: CSSProperties = { color: '#1d5fa8', textDecoration: 'none' };
const stamp: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 12 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#2c3e50', marginBottom: 4 };
const hintStyle: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 3 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const select: CSSProperties = withSelectChevron(input);
const inputFor = (err?: string): CSSProperties => (err ? { ...input, ...FIELD_ERROR_STYLE } : input);
