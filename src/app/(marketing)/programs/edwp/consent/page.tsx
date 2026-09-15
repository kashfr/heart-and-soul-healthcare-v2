'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle,
  ClipboardList,
  FileSignature,
  Info,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import SignatureCanvas, { type SignatureCanvasHandle } from '@/components/SignatureCanvas';
import { formatUSPhone } from '@/lib/phone';
import {
  EDWP_CONSENT_STATEMENTS,
  EDWP_PROGRAM_OPTIONS,
  EDWP_SERVICE_OPTIONS,
  EMPTY_EDWP_CONSENT,
  validateEdwpConsent,
  type EdwpConsentInput,
  type EdwpService,
} from '@/lib/edwpConsent';
import styles from './page.module.css';

// Public, mobile-first version of the paper "EDWP Client Consent Form". One
// screen, four numbered sections like the printed form, signed on a canvas.
// Posts to /api/forms/edwp-consent, which stores it and emails the office.

type FieldErrors = Partial<Record<keyof EdwpConsentInput, string>>;

const today = new Date().toISOString().split('T')[0];

function ConsentForm() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite') ?? '';

  const [form, setForm] = useState<EdwpConsentInput>({ ...EMPTY_EDWP_CONSENT, inviteToken: inviteToken || undefined });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ copySent: boolean } | null>(null);
  const [prefilledFor, setPrefilledFor] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  // Staff-sent links carry an invite token; prefill the client's name from it
  // so the person signing sees who the form is for.
  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    fetch(`/api/forms/edwp-consent?invite=${encodeURIComponent(inviteToken)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { clientName?: string | null } | null) => {
        if (cancelled || !data?.clientName) return;
        setPrefilledFor(data.clientName);
        setForm((prev) => (prev.clientName ? prev : { ...prev, clientName: data.clientName! }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const set = <K extends keyof EdwpConsentInput>(key: K, value: EdwpConsentInput[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (showErrors) setErrors(validateEdwpConsent(next));
      return next;
    });
  };

  const onText = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const phoneFields = ['phone', 'emergencyContactPhone', 'careCoordinatorPhone'];
    set(name as keyof EdwpConsentInput, (phoneFields.includes(name) ? formatUSPhone(value) : value) as never);
  };

  const toggleService = (code: EdwpService) =>
    set('services', form.services.includes(code) ? form.services.filter((s) => s !== code) : [...form.services, code]);

  const err = (key: keyof EdwpConsentInput) => (showErrors ? errors[key] : undefined);
  const cls = (key: keyof EdwpConsentInput, base = 'form-input') => `${base}${err(key) ? ` ${styles.fieldError}` : ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateEdwpConsent(form);
    setErrors(nextErrors);
    setShowErrors(true);
    if (Object.keys(nextErrors).length > 0) {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/forms/edwp-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, website: honeypot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setSubmitted({ copySent: !!data.copySent });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e2) {
      setSubmitError(e2 instanceof Error ? e2.message : 'Something went wrong. Please try again.');
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.successIcon}>
              <CheckCircle size={64} />
            </div>
            <h1>Consent Form Received</h1>
            <p className={styles.heroSubtitle}>
              Thank you. Your signed consent form for <strong>{form.clientName}</strong> has been sent to our team.
              {submitted.copySent
                ? ' A copy has been emailed to you for your records.'
                : ' If you would like a copy, call us at (678) 644-0337 and we will send one.'}
            </p>
            <div className={styles.successActions}>
              <Link href="/programs/edwp" className="btn btn-primary btn-lg">
                About the EDWP Program
              </Link>
              <Link href="/" className="btn btn-secondary btn-lg">
                Return to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const errorCount = showErrors ? Object.keys(errors).length : 0;

  return (
    <>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.heroLabel}>Elderly &amp; Disabled Waiver Program</span>
            <h1>Client Consent Form</h1>
            <p className={styles.heroSubtitle}>
              Before Heart &amp; Soul Healthcare can begin CCSP or SOURCE services, we need your consent. This
              form takes about five minutes and can be signed right here on your phone, tablet, or computer.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.formSection}>
        <div className="container">
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div ref={formTopRef} style={{ scrollMarginTop: 120 }} />

            {prefilledFor && (
              <div className={styles.prefillNote}>
                <Info size={16} />
                <span>This form was sent to you for <strong>{prefilledFor}</strong>. You can correct the name below if needed.</span>
              </div>
            )}

            {(submitError || errorCount > 0) && (
              <div className={styles.banner} role="alert">
                <AlertCircle size={18} />
                <div>
                  {submitError ? (
                    submitError
                  ) : (
                    <>
                      <strong>Please complete the highlighted fields</strong> ({errorCount} to fix).
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Honeypot: hidden from people, filled by bots. */}
            <div className={styles.hp} aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            {/* 1. Client information */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><User size={22} /> 1. Client Information</h2>
              <div className={styles.grid2}>
                <div className="form-group">
                  <label className="form-label" htmlFor="clientName">Client Full Name *</label>
                  <input id="clientName" name="clientName" className={cls('clientName')} value={form.clientName} onChange={onText} autoComplete="name" />
                  {err('clientName') && <span className={styles.errorText}>{err('clientName')}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="dob">Date of Birth *</label>
                  <input id="dob" name="dob" type="date" max={today} className={cls('dob')} value={form.dob} onChange={onText} />
                  {err('dob') && <span className={styles.errorText}>{err('dob')}</span>}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="address">Home Address *</label>
                <input id="address" name="address" className={cls('address')} value={form.address} onChange={onText} placeholder="Street, city, state, ZIP" autoComplete="street-address" />
                {err('address') && <span className={styles.errorText}>{err('address')}</span>}
              </div>
              <div className={styles.grid3}>
                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Phone *</label>
                  <input id="phone" name="phone" type="tel" className={cls('phone')} value={form.phone} onChange={onText} placeholder="(555) 555-5555" autoComplete="tel" />
                  {err('phone') && <span className={styles.errorText}>{err('phone')}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="email">Email <span className={styles.optional}>(for your copy)</span></label>
                  <input id="email" name="email" type="email" className={cls('email')} value={form.email} onChange={onText} autoComplete="email" />
                  {err('email') && <span className={styles.errorText}>{err('email')}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="medicaidId">Medicaid ID <span className={styles.optional}>(if known)</span></label>
                  <input id="medicaidId" name="medicaidId" className="form-input" value={form.medicaidId} onChange={onText} inputMode="numeric" />
                </div>
              </div>
              <div className={styles.grid2}>
                <div className="form-group">
                  <label className="form-label" htmlFor="emergencyContactName">Emergency Contact / Representative <span className={styles.optional}>(optional)</span></label>
                  <input id="emergencyContactName" name="emergencyContactName" className="form-input" value={form.emergencyContactName} onChange={onText} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="emergencyContactPhone">Emergency Contact Phone <span className={styles.optional}>(optional)</span></label>
                  <input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" className="form-input" value={form.emergencyContactPhone} onChange={onText} placeholder="(555) 555-5555" />
                </div>
              </div>
            </div>

            {/* 2. Program & care coordination */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><ClipboardList size={22} /> 2. Program &amp; Care Coordination</h2>
              <fieldset className={styles.choiceGroup}>
                <legend className={styles.choiceLegend}>Which program are you enrolled in or applying for? *</legend>
                {EDWP_PROGRAM_OPTIONS.map((o) => (
                  <label key={o.value} className={styles.choiceRow}>
                    <input type="radio" name="program" value={o.value} checked={form.program === o.value} onChange={() => set('program', o.value)} />
                    <span>{o.label}</span>
                  </label>
                ))}
                {err('program') && <span className={styles.errorText}>{err('program')}</span>}
              </fieldset>

              <p className={styles.sectionHint}>
                If you have a care coordinator or case manager, tell us who they are so we can coordinate with them. Leave blank if you do not have one yet.
              </p>
              <div className={styles.grid3}>
                <div className="form-group">
                  <label className="form-label" htmlFor="careCoordinatorName">Care Coordinator</label>
                  <input id="careCoordinatorName" name="careCoordinatorName" className="form-input" value={form.careCoordinatorName} onChange={onText} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="careCoordinatorAgency">Agency</label>
                  <input id="careCoordinatorAgency" name="careCoordinatorAgency" className="form-input" value={form.careCoordinatorAgency} onChange={onText} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="careCoordinatorPhone">Their Phone</label>
                  <input id="careCoordinatorPhone" name="careCoordinatorPhone" type="tel" className="form-input" value={form.careCoordinatorPhone} onChange={onText} placeholder="(555) 555-5555" />
                </div>
              </div>

              <fieldset className={styles.choiceGroup}>
                <legend className={styles.choiceLegend}>Services requested <span className={styles.optional}>(check all that apply)</span></legend>
                <div className={styles.choiceInline}>
                  {EDWP_SERVICE_OPTIONS.map((o) => (
                    <label key={o.value} className={styles.choiceRow}>
                      <input type="checkbox" checked={form.services.includes(o.value)} onChange={() => toggleService(o.value)} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
                {form.services.includes('other') && (
                  <div className="form-group" style={{ marginTop: 8 }}>
                    <label className="form-label" htmlFor="servicesOther">Please describe *</label>
                    <input id="servicesOther" name="servicesOther" className={cls('servicesOther')} value={form.servicesOther} onChange={onText} />
                    {err('servicesOther') && <span className={styles.errorText}>{err('servicesOther')}</span>}
                  </div>
                )}
              </fieldset>
            </div>

            {/* 3. Consent */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><ShieldCheck size={22} /> 3. Consent</h2>
              <p className={styles.sectionHint}>By signing below, I (or my authorized representative) confirm the following:</p>
              <ol className={styles.statements}>
                {EDWP_CONSENT_STATEMENTS.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ol>
              <label className={`${styles.choiceRow} ${styles.agreeRow}`}>
                <input type="checkbox" checked={form.agreed} onChange={(e) => set('agreed', e.target.checked)} />
                <span>I have read and agree to all five statements above. This consent remains in effect for the duration of services unless withdrawn or revised.</span>
              </label>
              {err('agreed') && <span className={styles.errorText}>{err('agreed')}</span>}
            </div>

            {/* 4. Signature */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}><FileSignature size={22} /> 4. Signature</h2>
              <fieldset className={styles.choiceGroup}>
                <legend className={styles.choiceLegend}>Who is signing? *</legend>
                <div className={styles.choiceInline}>
                  <label className={styles.choiceRow}>
                    <input type="radio" name="signerType" checked={form.signerType === 'client'} onChange={() => set('signerType', 'client')} />
                    <span>I am the client</span>
                  </label>
                  <label className={styles.choiceRow}>
                    <input type="radio" name="signerType" checked={form.signerType === 'representative'} onChange={() => set('signerType', 'representative')} />
                    <span>I am signing on the client&apos;s behalf (family member, guardian, or representative)</span>
                  </label>
                </div>
              </fieldset>
              <div className={styles.grid2}>
                <div className="form-group">
                  <label className="form-label" htmlFor="signerName">Full Name of Person Signing *</label>
                  <input id="signerName" name="signerName" className={cls('signerName')} value={form.signerName} onChange={onText} autoComplete="off" />
                  {err('signerName') && <span className={styles.errorText}>{err('signerName')}</span>}
                </div>
                {form.signerType === 'representative' && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="signerRelationship">Relationship to Client *</label>
                    <input id="signerRelationship" name="signerRelationship" className={cls('signerRelationship')} value={form.signerRelationship} onChange={onText} placeholder="e.g. Daughter, Legal Guardian, Power of Attorney" />
                    {err('signerRelationship') && <span className={styles.errorText}>{err('signerRelationship')}</span>}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sign in the box below *</label>
                <div className={`${styles.signatureWrap}${err('signature') ? ` ${styles.signatureInvalid}` : ''}`}>
                  <SignatureCanvas
                    ref={sigRef}
                    className={styles.signatureCanvas}
                    onChange={(dataUrl) => set('signature', dataUrl)}
                    disabled={submitting}
                  />
                </div>
                <div className={styles.signatureBar}>
                  <span>Use your finger, stylus, or mouse.</span>
                  <button type="button" className={styles.linkButton} onClick={() => sigRef.current?.clear()}>
                    Clear signature
                  </button>
                </div>
                {err('signature') && <span className={styles.errorText}>{err('signature')}</span>}
              </div>
            </div>

            <div className={styles.submitRow}>
              <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                <Send size={18} /> {submitting ? 'Submitting…' : 'Submit Signed Consent'}
              </button>
              <p className={styles.privacy}>
                Your information is protected under HIPAA and sent securely to Heart &amp; Soul Healthcare. Signing electronically has the same effect as signing on paper.
              </p>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

export default function EdwpConsentPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={null}>
        <ConsentForm />
      </Suspense>
    </div>
  );
}
