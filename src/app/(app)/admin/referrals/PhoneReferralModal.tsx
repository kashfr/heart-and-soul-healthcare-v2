'use client';

import { useState } from 'react';
import { btn, btnPrimary } from '@/components/buttons';
import { PhoneCall, X } from 'lucide-react';
import { authedFetch } from '@/lib/authedFetch';
import { withSelectChevron } from '@/lib/selectChevron';
import { PROGRAMS } from '@/lib/programs';
import { GA_COUNTIES } from '@/lib/georgia';
import { applyFieldErrors, FieldError, FIELD_ERROR_STYLE } from '@/lib/formEscort';
import {
  CALLER_RELATIONSHIPS, HOSPITAL_STATUSES, PHONE_REFERRAL_FIELD_ORDER, SERVICE_NEED_OPTIONS,
  emptyPhoneReferral, validatePhoneReferral,
  type PhoneReferralField, type PhoneReferralInput,
} from '@/lib/phoneReferralShared';
import type { StaffOption } from './types';

const fieldId = (k: PhoneReferralField) => `phone-referral-${k}`;

function agencyToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * "Log Phone Referral": a quick capture for a referral that comes in by phone,
 * so the notepad version never has to be retyped into a website form. Only
 * the caller's name, a callback number, and the client's name are required;
 * the rest is whatever came up on the call. Saving puts a "Phone Call" card in
 * New, optionally assigned (with a bell) to whoever will follow up.
 */
export default function PhoneReferralModal({
  staff,
  onClose,
  onCreated,
}: {
  /** Everyone on staff; only admins and VAs (who work the board) are offered. */
  staff: StaffOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [f, setF] = useState<PhoneReferralInput>(emptyPhoneReferral);
  const [errors, setErrors] = useState<Partial<Record<PhoneReferralField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const assignable = staff.filter((s) => s.role === 'admin' || s.role === 'va');

  const set = <K extends keyof PhoneReferralInput>(k: K, v: PhoneReferralInput[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    if (errors[k as PhoneReferralField]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };
  const errStyle = (k: PhoneReferralField) => (errors[k] ? FIELD_ERROR_STYLE : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    if (!applyFieldErrors(validatePhoneReferral(f, agencyToday()), PHONE_REFERRAL_FIELD_ORDER, setErrors, fieldId)) return;
    setBusy(true);
    try {
      const res = await authedFetch('/api/admin/referrals', { method: 'POST', body: JSON.stringify(f) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) applyFieldErrors(data.fieldErrors, PHONE_REFERRAL_FIELD_ORDER, setErrors, fieldId);
        throw new Error(data.error || `Request failed (${res.status}).`);
      }
      onCreated(String(data.id));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not save the referral.');
    } finally {
      setBusy(false);
    }
  };

  // Enter in a text box must not save a half-finished call (it does in the
  // notes box, where it starts a new line, and on the buttons themselves).
  const blockEnter = (e: React.KeyboardEvent<HTMLFormElement>) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.tagName !== 'TEXTAREA' && t.tagName !== 'BUTTON') e.preventDefault();
  };

  const inHospital = f.hospitalStatus === 'In the hospital now';

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="phone-referral-title">
        <div style={header}>
          <strong id="phone-referral-title" style={{ fontSize: 16, color: '#1a3a5c', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <PhoneCall size={17} /> Log Phone Referral
          </strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close" disabled={busy}><X size={18} /></button>
        </div>
        <form onSubmit={submit} onKeyDown={blockEnter} noValidate style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 20, display: 'grid', gap: 18, overflowY: 'auto' }}>
            <p style={lead}>
              Enter what you took down on the call. Only the caller&apos;s name, a callback number, and the client&apos;s
              name are required. The referral goes in New as a Phone Call card.
            </p>

            <section style={section}>
              <div style={sectionTitle}>Caller</div>
              <div style={twoCol}>
                <label style={field} id={fieldId('callerName')}>
                  <span style={label}>Caller&apos;s name *</span>
                  <input value={f.callerName} maxLength={200} onChange={(e) => set('callerName', e.target.value)} style={{ ...inp, ...errStyle('callerName') }} />
                  <FieldError message={errors.callerName} />
                </label>
                <label style={field}>
                  <span style={label}>Relationship to the client</span>
                  <select value={f.callerRelationship} onChange={(e) => set('callerRelationship', e.target.value)} style={withSelectChevron(inp)}>
                    <option value="">Choose One</option>
                    {CALLER_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label style={field} id={fieldId('callerPhone')}>
                  <span style={label}>Callback number *</span>
                  <input type="tel" value={f.callerPhone} maxLength={40} onChange={(e) => set('callerPhone', e.target.value)} style={{ ...inp, ...errStyle('callerPhone') }} placeholder="(404) 555-1212" />
                  <FieldError message={errors.callerPhone} />
                </label>
                <label style={field} id={fieldId('callerEmail')}>
                  <span style={label}>Email</span>
                  <input type="email" value={f.callerEmail} maxLength={320} onChange={(e) => set('callerEmail', e.target.value)} style={{ ...inp, ...errStyle('callerEmail') }} />
                  <FieldError message={errors.callerEmail} />
                </label>
              </div>
            </section>

            <section style={section}>
              <div style={sectionTitle}>Client</div>
              <div style={twoCol}>
                <label style={field} id={fieldId('clientName')}>
                  <span style={label}>Client&apos;s name *</span>
                  <input value={f.clientName} maxLength={200} onChange={(e) => set('clientName', e.target.value)} style={{ ...inp, ...errStyle('clientName') }} />
                  <FieldError message={errors.clientName} />
                </label>
                <label style={field} id={fieldId('dob')}>
                  <span style={label}>Date of birth</span>
                  <input type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} style={{ ...inp, ...errStyle('dob') }} />
                  <FieldError message={errors.dob} />
                </label>
                <label style={field}>
                  <span style={label}>Program</span>
                  <select value={f.program} onChange={(e) => set('program', e.target.value)} style={withSelectChevron(inp)}>
                    <option value="">Not Sure Yet</option>
                    {PROGRAMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
                <label style={field}>
                  <span style={label}>Service needed</span>
                  <select value={f.service} onChange={(e) => set('service', e.target.value as PhoneReferralInput['service'])} style={withSelectChevron(inp)}>
                    {SERVICE_NEED_OPTIONS.map((o) => <option key={o.label} value={o.value}>{titleCase(o.label)}</option>)}
                  </select>
                </label>
                <label style={{ ...field, gridColumn: '1 / -1' }}>
                  <span style={label}>Diagnosis</span>
                  <input value={f.diagnosis} maxLength={500} onChange={(e) => set('diagnosis', e.target.value)} style={inp} placeholder="As the caller described it" />
                </label>
                <label style={field}>
                  <span style={label}>Medicaid ID</span>
                  <input value={f.medicaidId} maxLength={40} onChange={(e) => set('medicaidId', e.target.value)} style={inp} placeholder="Leave blank if they'll send it later" />
                </label>
                <label style={field} id={fieldId('county')}>
                  <span style={label}>County</span>
                  <select value={f.county} onChange={(e) => set('county', e.target.value)} style={withSelectChevron({ ...inp, ...errStyle('county') })}>
                    <option value="">Choose One</option>
                    {GA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <FieldError message={errors.county} />
                </label>
                <label style={{ ...field, gridColumn: '1 / -1' }}>
                  <span style={label}>Street address</span>
                  <input value={f.street} maxLength={200} onChange={(e) => set('street', e.target.value)} style={inp} />
                </label>
                <label style={field}>
                  <span style={label}>City</span>
                  <input value={f.city} maxLength={100} onChange={(e) => set('city', e.target.value)} style={inp} />
                </label>
                <label style={field} id={fieldId('zip')}>
                  <span style={label}>ZIP code</span>
                  <input value={f.zip} inputMode="numeric" maxLength={5} onChange={(e) => set('zip', e.target.value.replace(/\D/g, ''))} style={{ ...inp, ...errStyle('zip') }} />
                  <FieldError message={errors.zip} />
                </label>
              </div>
            </section>

            <section style={section}>
              <div style={sectionTitle}>Hospital and Physician</div>
              <div style={twoCol}>
                <label style={field}>
                  <span style={label}>Where is the client now?</span>
                  <select value={f.hospitalStatus} onChange={(e) => set('hospitalStatus', e.target.value)} style={withSelectChevron(inp)}>
                    <option value="">Choose One</option>
                    {HOSPITAL_STATUSES.map((h) => <option key={h} value={h}>{titleCase(h)}</option>)}
                  </select>
                </label>
                {inHospital ? (
                  <label style={field}>
                    <span style={label}>Hospital</span>
                    <input value={f.hospitalName} maxLength={200} onChange={(e) => set('hospitalName', e.target.value)} style={inp} placeholder="e.g. CHOA Egleston" />
                  </label>
                ) : null}
                {inHospital && (
                  <label style={field} id={fieldId('expectedDischarge')}>
                    <span style={label}>Expected discharge</span>
                    <input type="date" value={f.expectedDischarge} onChange={(e) => set('expectedDischarge', e.target.value)} style={{ ...inp, ...errStyle('expectedDischarge') }} />
                    <FieldError message={errors.expectedDischarge} />
                  </label>
                )}
                <label style={field}>
                  <span style={label}>Child&apos;s physician</span>
                  <input value={f.physicianName} maxLength={200} onChange={(e) => set('physicianName', e.target.value)} style={inp} />
                </label>
                <label style={field}>
                  <span style={label}>Physician phone</span>
                  <input type="tel" value={f.physicianPhone} maxLength={40} onChange={(e) => set('physicianPhone', e.target.value)} style={inp} />
                </label>
              </div>
            </section>

            <section style={section}>
              <div style={sectionTitle}>Notes and Follow-Up</div>
              <label style={field}>
                <span style={label}>Call notes</span>
                <textarea value={f.callNotes} maxLength={5000} rows={5} onChange={(e) => set('callNotes', e.target.value)} style={{ ...inp, resize: 'vertical' }} placeholder="Anything else from the call: equipment, current services, best time to call back, what you told them…" />
              </label>
              <label style={field}>
                <span style={label}>Assign to</span>
                <select value={f.assigneeUid} onChange={(e) => set('assigneeUid', e.target.value)} style={withSelectChevron({ ...inp, maxWidth: 320 })}>
                  <option value="">Leave Unassigned</option>
                  {assignable.map((s) => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                </select>
                <span style={hint}>They get a notification with a link to the card.</span>
              </label>
            </section>

            {err && <div role="alert" style={{ color: '#b3261e', fontSize: 13, fontWeight: 600 }}>{err}</div>}
          </div>
          <div style={footer}>
            <button type="button" onClick={onClose} className={btn} disabled={busy}>Cancel</button>
            <button type="submit" className={btnPrimary} disabled={busy}>
              <PhoneCall size={14} /> {busy ? 'Saving…' : 'Save Referral'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Dropdown options are Title Case; the stored values keep their own casing. */
function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z]*)/g, (m, a: string, rest: string) => (['the', 'and', 'or', 'of', 'a'].includes(m) ? m : a.toUpperCase() + rest));
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const modal: React.CSSProperties = { background: 'white', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const footer: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e5e7eb' };
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'inline-flex' };
const lead: React.CSSProperties = { margin: 0, fontSize: 13, color: '#5c6b7a', lineHeight: 1.5 };
const section: React.CSSProperties = { display: 'grid', gap: 12 };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#5c6b7a', borderBottom: '1px solid #eef2f6', paddingBottom: 6 };
const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const field: React.CSSProperties = { display: 'grid', gap: 5, alignContent: 'start' };
const label: React.CSSProperties = { fontSize: 12, color: '#5c6b7a', fontWeight: 600 };
const hint: React.CSSProperties = { fontSize: 12, color: '#7f8c8d', lineHeight: 1.45, margin: 0 };
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit', color: '#111827' };
