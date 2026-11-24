'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useViewAsGuard } from '@/components/ImpersonationProvider';
import { btn, btnPrimary } from '@/components/buttons';
import { House, Pencil } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getGroupHome, saveGroupHome } from '@/lib/groupHome';
import {
  GROUP_HOME_ERROR_ORDER,
  validateGroupHome,
  type GroupHome,
  type GroupHomeErrorKey,
} from '@/lib/groupHomeShared';
import { FieldError, FIELD_ERROR_STYLE, applyFieldErrors } from '@/lib/formEscort';
import { formatUSPhone, formatUSPhoneExt } from '@/lib/phone';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Staff edit; everyone else who can read the clinical record sees it read-only. */
  canEdit: boolean;
  actorName: string;
  onToast: (msg: string) => void;
}

const fieldId = (k: GroupHomeErrorKey) => `gh-field-${k}`;

/**
 * Client-dashboard card: the group home this client lives in, the residential
 * provider, and who to call there (usually the house manager, who schedules
 * nurse visits). Read by the care team; edited by staff.
 */
export default function GroupHomeSection({ patientId, canEdit, actorName, onToast }: Props) {
  const { blockWrite } = useViewAsGuard();
  const [record, setRecord] = useState<GroupHome | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<GroupHome>({});
  const [errors, setErrors] = useState<Partial<Record<GroupHomeErrorKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    setEditing(false);
    getGroupHome(patientId)
      .then((d) => { if (!cancelled) setRecord(d); })
      .catch((err) => { console.error('Group home load failed:', err); if (!cancelled) setLoadError('Could not load the group home.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const startEdit = () => {
    setDraft({ ...(record || {}) });
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const set = (k: keyof GroupHome, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as GroupHomeErrorKey] || (['phone', 'cell', 'email'].includes(k) && errors.contact)) {
      setErrors((e) => {
        const next = { ...e };
        delete next[k as GroupHomeErrorKey];
        if (['phone', 'cell', 'email'].includes(k)) delete next.contact;
        return next;
      });
    }
  };

  const save = async () => {
    if (blockWrite()) return;
    if (!applyFieldErrors(validateGroupHome(draft), GROUP_HOME_ERROR_ORDER, setErrors, fieldId)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveGroupHome(patientId, draft, actorName);
      setRecord(await getGroupHome(patientId));
      setEditing(false);
      onToast('Group home saved.');
    } catch (err) {
      console.error('Group home save failed:', err);
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
        <div style={title}><House size={16} /> Group Home</div>
        {canEdit && !editing && record !== undefined && !loadError && (
          <button type="button" onClick={startEdit} className={btn}>
            <Pencil size={13} /> {record ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && record === undefined && <div style={muted}>Loading...</div>}

      {!loadError && record !== undefined && !editing && (
        <>
          {!record || !record.livesIn ? (
            <div style={muted}>
              No group home information on file.{canEdit ? ' Add it so nurses know where this client lives and who to call to schedule visits.' : ''}
            </div>
          ) : record.livesIn === 'no' ? (
            <div style={muted}>Does not live in a group home.</div>
          ) : (
            <dl style={grid}>
              <Row label="Provider">
                <strong>{record.provider}</strong>
                {record.homeName ? <div style={{ color: '#5c6b7a' }}>{record.homeName}</div> : null}
              </Row>
              <Row label="Home address">{record.address}</Row>
              <Row label="Contact">
                {record.contactName}{record.contactTitle ? `, ${record.contactTitle}` : ''}
                <div style={contactLines}>
                  {record.phone && <span>Office <a href={`tel:${record.phone}`} style={link}>{record.phone}</a></span>}
                  {record.cell && <span>Cell <a href={`tel:${record.cell}`} style={link}>{record.cell}</a></span>}
                  {record.fax && <span>Fax {record.fax}</span>}
                  {record.email && <a href={`mailto:${record.email}`} style={link}>{record.email}</a>}
                </div>
              </Row>
              {record.staff && <Row label="Home staff">{record.staff}</Row>}
              {record.notes && <Row label="Notes"><span style={{ whiteSpace: 'pre-wrap' }}>{record.notes}</span></Row>}
            </dl>
          )}
          {record?.livesIn && (
            <div style={stamp}>
              Last updated{updatedAt ? ` ${formatDateUS(`${updatedAt.getFullYear()}-${String(updatedAt.getMonth() + 1).padStart(2, '0')}-${String(updatedAt.getDate()).padStart(2, '0')}`)}` : ''}
              {record.updatedByName ? ` by ${record.updatedByName}` : ''}
            </div>
          )}
        </>
      )}

      {editing && (
        <div>
          <div id={fieldId('livesIn')} style={{ marginBottom: 12 }}>
            <div style={label}>Does this client live in a group home? *</div>
            <div style={{ display: 'flex', gap: 8, ...(errors.livesIn ? { ...FIELD_ERROR_STYLE, borderRadius: 8, padding: 6 } : null) }}>
              {(['yes', 'no'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set('livesIn', v)}
                  style={{ ...choiceBtn, ...(draft.livesIn === v ? choiceBtnOn : null) }}
                >
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            <FieldError message={errors.livesIn} />
          </div>

          {draft.livesIn === 'yes' && (
            <div style={formGrid}>
              <Field id={fieldId('provider')} label="Residential provider *" error={errors.provider}>
                <input style={inputFor(errors.provider)} value={draft.provider || ''} onChange={(e) => set('provider', e.target.value)} placeholder="e.g. Maple Grove Residential, Inc." />
              </Field>
              <Field label="Home name">
                <input style={input} value={draft.homeName || ''} onChange={(e) => set('homeName', e.target.value)} placeholder="If the home has a name" />
              </Field>
              <Field id={fieldId('address')} label="Home address *" error={errors.address} wide hint="Where the client lives. The provider's office address is often different.">
                <input style={inputFor(errors.address)} value={draft.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="Street, city, state ZIP" />
              </Field>
              <Field id={fieldId('contactName')} label="Primary contact *" error={errors.contactName} hint="Usually the house manager.">
                <input style={inputFor(errors.contactName)} value={draft.contactName || ''} onChange={(e) => set('contactName', e.target.value)} />
              </Field>
              <Field label="Contact title">
                <input style={input} value={draft.contactTitle || ''} onChange={(e) => set('contactTitle', e.target.value)} />
              </Field>
              <Field id={fieldId('contact')} label="Office phone" error={errors.contact}>
                <input type="tel" style={inputFor(errors.contact)} value={draft.phone || ''} onChange={(e) => set('phone', formatUSPhoneExt(e.target.value))} />
              </Field>
              <Field label="Cell">
                <input type="tel" style={inputFor(errors.contact)} value={draft.cell || ''} onChange={(e) => set('cell', formatUSPhone(e.target.value))} />
              </Field>
              <Field id={fieldId('email')} label="Email" error={errors.email}>
                <input type="email" style={inputFor(errors.email || errors.contact)} value={draft.email || ''} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Fax">
                <input type="tel" style={input} value={draft.fax || ''} onChange={(e) => set('fax', formatUSPhone(e.target.value))} />
              </Field>
              <Field label="Home staff who support this client" wide hint="Names and roles. Used as the roster for HCP and proxy-caregiver training.">
                <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={draft.staff || ''} onChange={(e) => set('staff', e.target.value)} />
              </Field>
              <Field label="Notes" wide hint="How to schedule visits, best times, entry instructions, anything else.">
                <textarea style={{ ...input, minHeight: 56, resize: 'vertical' }} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          )}

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
const head: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const title: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: NAVY };
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
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#2c3e50', marginBottom: 4 };
const hintStyle: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 3 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const inputFor = (err?: string): CSSProperties => (err ? { ...input, ...FIELD_ERROR_STYLE } : input);
