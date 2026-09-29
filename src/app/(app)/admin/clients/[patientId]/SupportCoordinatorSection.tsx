'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Briefcase, Pencil } from 'lucide-react';
import { formatDateUS } from '@/lib/dateFormat';
import { getSupportCoordinator, saveSupportCoordinator } from '@/lib/supportCoordinator';
import {
  COORDINATOR_ERROR_ORDER,
  COORDINATOR_TITLES,
  validateCoordinator,
  type CoordinatorErrorKey,
  type SupportCoordinator,
} from '@/lib/supportCoordinatorShared';
import { FieldError, FIELD_ERROR_STYLE, applyFieldErrors } from '@/lib/formEscort';
import { withSelectChevron } from '@/lib/selectChevron';
import { useSettings } from '@/components/SettingsProvider';
import { formatUSPhone, formatUSPhoneExt } from '@/lib/phone';

const NAVY = '#1a3a5c';

interface Props {
  patientId: string;
  /** Staff edit; the rest of the care team reads. */
  canEdit: boolean;
  actorName: string;
  onToast: (msg: string) => void;
}

const fieldId = (k: CoordinatorErrorKey) => `sc-field-${k}`;

/**
 * Client-dashboard card: the support coordinator or case manager, the
 * person to call about the ISP, authorizations, and the annual meeting.
 */
export default function SupportCoordinatorSection({ patientId, canEdit, actorName, onToast }: Props) {
  const [record, setRecord] = useState<SupportCoordinator | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SupportCoordinator>({});
  const [errors, setErrors] = useState<Partial<Record<CoordinatorErrorKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Agencies come from Settings → Support Coordination Agencies. 'other' is a
  // free-typed agency not on that list yet.
  const { settings } = useSettings();
  const agencies = settings.supportCoordination?.agencies || [];
  const [agencyChoice, setAgencyChoice] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setRecord(undefined);
    setEditing(false);
    getSupportCoordinator(patientId)
      .then((d) => { if (!cancelled) setRecord(d); })
      .catch((err) => { console.error('Support coordinator load failed:', err); if (!cancelled) setLoadError('Could not load the support coordinator.'); });
    return () => { cancelled = true; };
  }, [patientId]);

  const hasRecord = !!record?.name;

  const startEdit = () => {
    setDraft({ ...(record || {}) });
    const current = (record?.agency || '').trim().toLowerCase();
    const onList = agencies.find((a) => a.name.toLowerCase() === current);
    setAgencyChoice(onList ? onList.id : current ? 'other' : '');
    setErrors({});
    setSaveError(null);
    setEditing(true);
  };

  const set = (k: keyof SupportCoordinator, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    const reach = k === 'phone' || k === 'cell' || k === 'email';
    if (errors[k as CoordinatorErrorKey] || (reach && errors.contact)) {
      setErrors((e) => {
        const next = { ...e };
        delete next[k as CoordinatorErrorKey];
        if (reach) delete next.contact;
        return next;
      });
    }
  };

  const chooseAgency = (id: string) => {
    setAgencyChoice(id);
    if (id === 'other' || id === '') {
      setDraft((d) => ({ ...d, agency: '' }));
      return;
    }
    const a = agencies.find((x) => x.id === id);
    if (!a) return;
    // The agency's office address replaces whatever was there; fax and the
    // after-hours line only fill blanks so a coordinator's own numbers stay.
    setDraft((d) => ({
      ...d,
      agency: a.name,
      address: a.address || d.address,
      fax: d.fax || a.fax,
      notes: d.notes || (a.afterHours ? `After-hours line: ${a.afterHours}.` : ''),
    }));
    setErrors((e) => {
      const next = { ...e };
      delete next.agency;
      return next;
    });
  };

  const save = async () => {
    if (!applyFieldErrors(validateCoordinator(draft), COORDINATOR_ERROR_ORDER, setErrors, fieldId)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSupportCoordinator(patientId, draft, actorName);
      setRecord(await getSupportCoordinator(patientId));
      setEditing(false);
      onToast('Support coordinator saved.');
    } catch (err) {
      console.error('Support coordinator save failed:', err);
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
        <div style={title}><Briefcase size={16} /> Support Coordinator</div>
        {canEdit && !editing && record !== undefined && !loadError && (
          <button type="button" onClick={startEdit} style={ghostBtn}>
            <Pencil size={13} /> {hasRecord ? 'Edit' : 'Add'}
          </button>
        )}
      </div>

      {loadError && <div style={errBox}>{loadError}</div>}
      {!loadError && record === undefined && <div style={muted}>Loading...</div>}

      {!loadError && record !== undefined && !editing && (
        !hasRecord ? (
          <div style={muted}>No support coordinator on file.{canEdit ? ' Add who writes the ISP and handles authorizations for this client.' : ''}</div>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: '#2c3e50' }}>
              <strong style={{ color: NAVY }}>{record!.name}</strong>
              {record!.title && <span style={chip}>{record!.title}</span>}
              {record!.agency && <div style={sub}>{record!.agency}</div>}
              <div style={contactLine}>
                {record!.phone && <span>Office <a href={`tel:${record!.phone}`} style={link}>{record!.phone}</a></span>}
                {record!.cell && <span>Cell <a href={`tel:${record!.cell}`} style={link}>{record!.cell}</a></span>}
                {record!.fax && <span>Fax {record!.fax}</span>}
                {record!.email && <a href={`mailto:${record!.email}`} style={link}>{record!.email}</a>}
              </div>
              {record!.address && <div style={sub}>{record!.address}</div>}
              {record!.supervisor && <div style={sub}>Supervisor: {record!.supervisor}</div>}
              {record!.notes && <div style={{ ...sub, whiteSpace: 'pre-wrap' }}>{record!.notes}</div>}
            </div>
            <div style={stamp}>
              Last updated{updatedISO ? ` ${formatDateUS(updatedISO)}` : ''}{record?.updatedByName ? ` by ${record.updatedByName}` : ''}
            </div>
          </>
        )
      )}

      {editing && (
        <div>
          <div style={formGrid}>
            <Field id={fieldId('name')} label="Name *" error={errors.name}>
              <input style={inputFor(errors.name)} value={draft.name || ''} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Title">
              <select style={select} value={draft.title || ''} onChange={(e) => set('title', e.target.value)}>
                <option value="">Select...</option>
                {COORDINATOR_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field id={fieldId('agency')} label="Agency *" error={errors.agency} wide>
              {agencies.length > 0 && (
                <select
                  style={errors.agency && agencyChoice !== 'other' ? { ...select, ...FIELD_ERROR_STYLE } : select}
                  value={agencyChoice}
                  onChange={(e) => chooseAgency(e.target.value)}
                >
                  <option value="">Select...</option>
                  {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value="other">Other (type it in)</option>
                </select>
              )}
              {(agencies.length === 0 || agencyChoice === 'other') && (
                <input
                  style={{ ...inputFor(errors.agency), ...(agencies.length > 0 ? { marginTop: 6 } : null) }}
                  value={draft.agency || ''}
                  onChange={(e) => set('agency', e.target.value)}
                  placeholder="e.g. Benchmark Human Services"
                />
              )}
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
            <Field label="Office address" wide>
              <input style={input} value={draft.address || ''} onChange={(e) => set('address', e.target.value)} />
            </Field>
            <Field label="Supervisor" wide>
              <input style={input} value={draft.supervisor || ''} onChange={(e) => set('supervisor', e.target.value)} placeholder="Name and how to reach them" />
            </Field>
            <Field label="Notes" wide>
              <input style={input} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Where this came from, best way to reach them, etc." />
            </Field>
          </div>
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
const primaryBtn: CSSProperties = { background: NAVY, color: 'white', border: '1px solid ' + NAVY, borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const errBox: CSSProperties = { background: '#fdeaea', color: '#b3261e', borderRadius: 6, padding: '8px 11px', fontSize: 13 };
const muted: CSSProperties = { fontSize: 13, color: '#5c6b7a' };
const chip: CSSProperties = { marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: '#5c6b7a', background: '#f1f4f7', borderRadius: 10, padding: '2px 8px' };
const sub: CSSProperties = { color: '#5c6b7a', marginTop: 2, overflowWrap: 'anywhere' };
const contactLine: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2, color: '#5c6b7a' };
const link: CSSProperties = { color: '#1d5fa8', textDecoration: 'none' };
const stamp: CSSProperties = { fontSize: 11.5, color: '#7f8c8d', marginTop: 12 };
const formGrid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: '#2c3e50', marginBottom: 4 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d7de', borderRadius: 6, padding: '7px 9px', fontSize: 13.5, fontFamily: 'inherit', color: '#2c3e50', background: 'white' };
const select: CSSProperties = withSelectChevron(input);
const inputFor = (err?: string): CSSProperties => (err ? { ...input, ...FIELD_ERROR_STYLE } : input);
