'use client';

import { useMemo, useState } from 'react';
import { btn, btnPrimary } from '@/components/buttons';
import { Pencil, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { withSelectChevron } from '@/lib/selectChevron';
import { GA_COUNTIES } from '@/lib/georgia';
import { applyFieldErrors, escortToField, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import {
  LOCKED_ANSWERS, currentEditValues, editFieldsFor, formatEditValue, validateEdits,
  type EditableSource,
} from '@/lib/referralEditShared';
import {
  CARE_NEED_OPTIONS, SCREENED_LABELS, readScreened, refusalFor, screenedValidation, visibleScreenedQuestions, writeScreened,
  type ScreenedAnswers, type ScreenedKey,
} from '@/lib/screenedAnswers';
import { PAID_CARE_BASIS_OPTIONS, RELATIONSHIP_OPTIONS } from '@/lib/diagnosisCatalog';
import type { Referral } from './types';

type Answers = Parameters<typeof readScreened>[1];
const YES_NO = [{ code: 'yes', label: 'Yes' }, { code: 'no', label: 'No' }];
const SCREENED_CHOICES: Partial<Record<ScreenedKey, { code: string; label: string }[]>> = {
  seekingPaidCaregiver: YES_NO,
  wantsAgencyStaff: YES_NO,
  hasGuardianship: YES_NO,
  relationship: RELATIONSHIP_OPTIONS,
  paidCareBasis: PAID_CARE_BASIS_OPTIONS,
  careNeeds: CARE_NEED_OPTIONS,
};
const REFUSAL_ID = 'edit-referral-refusal';

/**
 * Edit Details for a referral from one of the websites: contact details,
 * Medicaid ID, address, physician, insurance, and notes. The answers the GAPP
 * screening reads stay locked, and the form says so, so a correction can never
 * turn the card into one the website would have refused.
 */
export default function EditReferralModal({
  referral,
  onClose,
  onSaved,
}: {
  referral: Referral & { source: EditableSource };
  onClose: () => void;
  onSaved: () => void;
}) {
  const specs = useMemo(() => editFieldsFor(referral.source), [referral.source]);
  const before = useMemo(() => currentEditValues({ ...referral, details: referral.details }, specs), [referral, specs]);
  const [values, setValues] = useState<Record<string, string>>(before);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Screened answers, when the referral kept them: edited here, re-screened
  // live with the website's own checks, and re-checked by the server on save.
  const answers = (referral.intakeAnswers ?? null) as Answers | null;
  const screenedBefore = useMemo(() => (answers ? readScreened(referral.source, answers) : null), [answers, referral.source]);
  const [screened, setScreened] = useState<ScreenedAnswers | null>(screenedBefore);
  const screenedChanged = !!(screened && screenedBefore && (Object.keys(screened) as ScreenedKey[]).some((k) => screened[k] !== screenedBefore[k]));
  const nextAnswers = answers && screened ? writeScreened(referral.source, answers, screened) : null;
  const visible = nextAnswers ? visibleScreenedQuestions(referral.source, nextAnswers) : [];
  const liveRefusal = screenedChanged && nextAnswers ? refusalFor(referral.source, nextAnswers) : null;
  const [serverRefusal, setServerRefusal] = useState<string | null>(null);
  const refusalText = liveRefusal?.reason ?? serverRefusal;

  const order = [...specs.map((s) => s.key), ...visible.map((k) => `screened:${k}`)];
  const idFor = (key: string) => `edit-referral-${order.indexOf(key)}`;
  const setScreenedValue = (k: ScreenedKey, v: string) => {
    setScreened((prev) => (prev ? { ...prev, [k]: v } : prev));
    setServerRefusal(null);
    const key = `screened:${k}`;
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const set = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const screenedErrors = screenedChanged && nextAnswers
      ? Object.fromEntries(Object.entries(screenedValidation(referral.source, nextAnswers)).map(([k, v]) => [`screened:${k}`, String(v)]))
      : {};
    if (!applyFieldErrors({ ...validateEdits(specs, values, before), ...screenedErrors }, order, setErrors, idFor)) return;
    if (liveRefusal) {
      // The website would refuse these answers; so does this form. Take them
      // to the explanation instead of saving.
      escortToField(REFUSAL_ID);
      return;
    }
    const changedScreened = screened && screenedBefore
      ? Object.fromEntries((Object.keys(screened) as ScreenedKey[]).filter((k) => screened[k] !== screenedBefore[k]).map((k) => [k, screened[k]]))
      : {};
    setBusy(true);
    try {
      const res = await authedFetch(`/api/admin/referrals/${referral.id}/details`, { method: 'PUT', body: JSON.stringify({ values, screened: changedScreened }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.refused) {
          setServerRefusal(String(data.error || ''));
          // The explanation renders on the next paint; take them to it then.
          window.setTimeout(() => escortToField(REFUSAL_ID), 0);
          return;
        }
        if (data.fieldErrors) applyFieldErrors(data.fieldErrors, order, setErrors, idFor);
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  };

  // Enter in a text box must not save (it still starts a new line in notes).
  const blockEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.tagName !== 'TEXTAREA' && t.tagName !== 'BUTTON') e.preventDefault();
  };

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-referral-title">
        <div style={header}>
          <strong id="edit-referral-title" style={{ fontSize: 16, color: '#1a3a5c', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Pencil size={16} /> Edit Referral Details
          </strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} onKeyDown={blockEnter} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 14, overflowY: 'auto' }}>
            <p style={lead}>
              Correct contact details or add what the family didn&apos;t have when they filled out the form, like a
              Medicaid ID. The activity history keeps the old and new values.
            </p>
            <p style={lockNote}>
              {answers
                ? 'Answers the GAPP screening reads are under Screened Answers below. A change there is checked against the website’s rules as you make it, and an answer the website would refuse can’t be saved. Diagnosis, equipment, behavior, and current services can’t be changed.'
                : `Their answers about ${LOCKED_ANSWERS} can’t be changed here: this referral came in before the website saved its answers, so the screening can’t be re-run. If they change, have the family submit the form again.`}
            </p>
            <div style={grid}>
              {specs.map((s) => {
                const id = idFor(s.key);
                const style = { ...inp, ...(errors[s.key] ? FIELD_ERROR_STYLE : {}) };
                const wide = s.kind === 'textarea' || s.row === 'Address';
                return (
                  <label key={s.key} id={id} style={{ ...field, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
                    <span style={label}>{s.label}{s.required ? ' *' : ''}</span>
                    {s.kind === 'textarea' ? (
                      <textarea value={values[s.key] ?? ''} rows={4} maxLength={5000} onChange={(e) => set(s.key, e.target.value)} style={{ ...style, resize: 'vertical' }} />
                    ) : s.kind === 'county' ? (
                      <select value={values[s.key] ?? ''} onChange={(e) => set(s.key, e.target.value)} style={withSelectChevron(style)}>
                        <option value="">Choose One</option>
                        {/* Keep a value the website stored even if it isn't in the list. */}
                        {values[s.key] && !GA_COUNTIES.includes(values[s.key]) && <option value={values[s.key]}>{values[s.key]}</option>}
                        {GA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input
                        type={s.kind === 'email' ? 'email' : s.kind === 'phone' || s.kind === 'phoneExt' ? 'tel' : 'text'}
                        value={values[s.key] ?? ''}
                        maxLength={s.kind === 'text' ? 500 : 320}
                        onChange={(e) => set(s.key, formatEditValue(s.kind, e.target.value))}
                        style={style}
                      />
                    )}
                    <FieldError message={errors[s.key]} />
                  </label>
                );
              })}
            </div>
            {screened && visible.length > 0 && (
              <section style={{ display: 'grid', gap: 12 }}>
                <div style={sectionTitle}>Screened Answers</div>
                <div style={grid}>
                  {visible.map((k) => {
                    const key = `screened:${k}`;
                    const style = { ...inp, ...(errors[key] ? FIELD_ERROR_STYLE : {}) };
                    const choices = SCREENED_CHOICES[k];
                    return (
                      <label key={k} id={idFor(key)} style={field}>
                        <span style={label}>{SCREENED_LABELS[k]}</span>
                        {choices ? (
                          <select value={screened[k]} onChange={(e) => setScreenedValue(k, e.target.value)} style={withSelectChevron(style)}>
                            <option value="">Choose One</option>
                            {choices.map((o) => <option key={o.code} value={o.code}>{titleCase(o.label)}</option>)}
                          </select>
                        ) : (
                          <input type="date" value={screened[k]} onChange={(e) => setScreenedValue(k, e.target.value)} style={style} />
                        )}
                        <FieldError message={errors[key]} />
                      </label>
                    );
                  })}
                </div>
                {refusalText && (
                  <div id={REFUSAL_ID} role="alert" tabIndex={-1} style={refusalBox}>
                    <strong style={{ display: 'block', marginBottom: 4 }}>The website would refuse these answers, so they can&apos;t be saved.</strong>
                    {refusalText}
                  </div>
                )}
              </section>
            )}
            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} className={btn} disabled={busy}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <Pencil size={14} /> {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Dropdown options are Title Case; the stored codes are unchanged. */
function titleCase(t: string): string {
  return t.replace(/\b([a-z])([a-z]*)/g, (m, a: string, rest: string) => (['the', 'and', 'or', 'of', 'a', 'to', 'for', 'by'].includes(m) ? m : a.toUpperCase() + rest));
}

const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5c6b7a', borderBottom: '1px solid #eef2f6', paddingBottom: 6 };
const refusalBox: React.CSSProperties = { fontSize: 13, color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 };
const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const lead: React.CSSProperties = { margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 };
const lockNote: React.CSSProperties = { margin: 0, fontSize: 12.5, color: '#7a5b00', background: '#fff8e1', border: '1px solid #f3e1a6', borderRadius: 8, padding: '8px 10px', lineHeight: 1.45 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const field: React.CSSProperties = { display: 'grid', gap: 5, alignContent: 'start' };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
