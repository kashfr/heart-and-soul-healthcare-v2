'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUSPhone } from '@/lib/phone';
import { escortToField, FieldError, FIELD_ERROR_WRAP_STYLE, firstErrorKey } from '@/lib/formEscort';
import { YOUNG_PAID_CAREGIVER_AGE_YEARS } from '@/lib/diagnosisScreening';
import {
  BEHAVIOR_RISK_OPTIONS,
  CURRENT_SERVICE_OPTIONS,
  DIAGNOSIS_GROUPS,
  EQUIPMENT_OPTIONS,
  classifyFreeText,
  diagnosisPicture,
  inferService,
  type BehaviorRisk,
} from '@/lib/diagnosisCatalog';
import {
  FileText,
  User,
  Phone,
  Mail,
  Calendar,
  MapPin,
  ClipboardList,
  Send,
  CheckCircle,
  ArrowRight,
  Shield,
  Clock,
  AlertCircle,
  Info
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { processReferralSubmission } from '@/app/actions';
import { ScrollReveal } from '@/components/animations';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './page.module.css';

// The required fields, in display order across both steps, so a blocked
// "Next" or "Submit" escorts to the topmost problem.
type ReferralField =
  | 'programInterest' | 'clientCounty' | 'clientFirstName' | 'clientLastName' | 'clientDOB' | 'clientPhone' | 'clientSecondaryPhone' | 'clientEmail'
  | 'referralSource' | 'referrerName' | 'diagnoses' | 'equipment' | 'behaviorRisk' | 'seekingPaidCaregiver' | 'careNeeds';
type ReferralFieldErrors = Partial<Record<ReferralField, string>>;
const FIELD_ORDER: ReferralField[] = [
  'programInterest', 'clientCounty', 'clientFirstName', 'clientLastName', 'clientDOB', 'clientPhone', 'clientSecondaryPhone', 'clientEmail',
  'referralSource', 'referrerName', 'diagnoses', 'equipment', 'behaviorRisk', 'seekingPaidCaregiver', 'careNeeds',
];
// Banner labels (the careNeeds label depends on who is filling the form).
const FIELD_LABEL: Record<Exclude<ReferralField, 'careNeeds'>, string> = {
  programInterest: 'Program of Interest',
  clientCounty: 'County',
  clientFirstName: 'First Name',
  clientLastName: 'Last Name',
  clientDOB: 'Date of Birth',
  clientPhone: 'Phone Number',
  clientSecondaryPhone: 'Secondary Phone Number',
  clientEmail: 'Email Address',
  referralSource: 'Referral Source',
  referrerName: 'Referrer Name',
  diagnoses: "Your child's diagnosis",
  equipment: 'What your child needs at home',
  behaviorRisk: 'Behavior question',
  seekingPaidCaregiver: 'Paid caregiver question',
};
const fieldId = (k: ReferralField) => `ref-field-${k}`;

// County data organized by tier
const primaryCounties = [
  'Fulton', 'DeKalb', 'Cobb', 'Clayton', 'Henry',
  'Gwinnett', 'Fayette', 'Douglas', 'Forsyth', 'Rockdale',
];

const extendedCounties = [
  'Cherokee', 'Paulding', 'Bartow', 'Newton', 'Spalding',
  'Coweta', 'Carroll', 'Barrow', 'Gilmer', 'Pickens',
];

// Program-to-county mapping
// Currently all waiver programs serve the same counties.
// When per-program county lists differ, update these arrays.
const programCounties: Record<string, { primary: string[]; extended: string[] }> = {
  'gapp':        { primary: primaryCounties, extended: extendedCounties },
  'now-comp':    { primary: primaryCounties, extended: extendedCounties },
  'icwp':        { primary: primaryCounties, extended: extendedCounties },
  'edwp':        { primary: primaryCounties, extended: extendedCounties },
  'private-pay': { primary: primaryCounties, extended: extendedCounties },
  'other':       { primary: primaryCounties, extended: extendedCounties },
};

function getCountiesForProgram(programValue: string) {
  const mapping = programCounties[programValue];
  if (!mapping) return { primary: primaryCounties, extended: extendedCounties };
  return mapping;
}

const programs = [
  { value: 'gapp', label: 'GAPP - Georgia Pediatric Program', description: 'Provides home and community-based services for children (under 21) with significant developmental disabilities or complex medical needs as an alternative to institutional care.' },
  { value: 'now-comp', label: 'NOW/COMP Waiver', description: 'New Options Waiver (NOW) and Comprehensive Supports Waiver (COMP) serve individuals with intellectual and developmental disabilities, offering residential, employment, and community support services.' },
  { value: 'icwp', label: 'ICWP - Independent Care Waiver', description: 'Serves individuals aged 21–64 with physical disabilities who need nursing-facility-level care but prefer to receive services in their home or community.' },
  { value: 'edwp', label: 'EDWP (CCSP & SOURCE)', description: 'The Elderly and Disabled Waiver Program provides home and community-based services through CCSP (Community Care Services Program) and SOURCE (Service Options Using Resources in a Community Environment) for elderly or disabled individuals who would otherwise require nursing home care.' },
  { value: 'private-pay', label: 'Private Pay', description: 'For individuals who plan to pay out-of-pocket for home healthcare services without using Medicaid waiver programs.' },
  { value: 'other', label: 'Other / Not Sure', description: 'Not sure which program fits? No worries — select this option and our team will help determine the best program based on the individual\'s needs and eligibility.' },
];

const referralSources = [
  { value: 'hospital', label: 'Hospital / Medical Facility' },
  { value: 'physician', label: 'Physician / Healthcare Provider' },
  { value: 'case-manager', label: 'Case Manager / Support Coordinator' },
  { value: 'family', label: 'Family Member' },
  { value: 'self', label: 'Self-Referral' },
  { value: 'other', label: 'Other' },
];

const today = new Date().toISOString().split('T')[0];
const minDOBDate = new Date();
minDOBDate.setFullYear(minDOBDate.getFullYear() - 120);
const minDOB = minDOBDate.toISOString().split('T')[0];

// Compute a child's age from an ISO date string (YYYY-MM-DD). Returns null for a
// missing, unparseable, or future date.
function ageFromDob(dob: string): { years: number; months: number } | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  if (birth > now) return null;
  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}

// Human-readable age for the read-only display, e.g. "2 years" or "8 months".
function formatAge(dob: string): string {
  const age = ageFromDob(dob);
  if (!age) return '';
  if (age.years < 1) return `${age.months} month${age.months === 1 ? '' : 's'}`;
  return `${age.years} year${age.years === 1 ? '' : 's'}`;
}

export default function ReferralPage() {
  const [step, setStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [formData, setFormData] = useState({
    // Client Information
    programInterest: '',
    clientCounty: '',
    clientFirstName: '',
    clientLastName: '',
    clientDOB: '',
    clientPhone: '',
    clientSecondaryPhone: '',
    clientEmail: '',
    clientAddress: '',
    clientCity: '',
    clientState: 'GA',
    clientZip: '',

    // Referral & Insurance
    referralSource: '',
    referrerName: '',
    referrerPhone: '',
    referrerEmail: '',
    referrerOrganization: '',
    medicaidNumber: '',
    insuranceProvider: '',
    insuranceNumber: '',
    serviceNeeds: '',
    urgency: 'standard',
    additionalNotes: '',
    seekingPaidCaregiver: '',
    careNeeds: '',
    diagnoses: [] as string[],
    diagnosisOther: '',
    equipment: [] as string[],
    behaviorRisk: '' as BehaviorRisk,
    currentServices: [] as string[],
  });

  // Debounce the read-only age so it doesn't recompute on every keystroke as the
  // user types the date (the native date input fires a change per digit). Recompute
  // 800ms after the user pauses, and never show an implausible age.
  const [debouncedClientDOB, setDebouncedClientDOB] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedClientDOB(formData.clientDOB), 800);
    return () => clearTimeout(id);
  }, [formData.clientDOB]);
  const childAge = ageFromDob(debouncedClientDOB);
  const showChildAge = !!childAge && childAge.years <= 120;

  const isSelfReferral = formData.referralSource === 'self';

  // The GAPP clinical questions only apply to GAPP referrals; NOW/COMP, ICWP,
  // EDWP and private-pay inquiries never see them.
  const showGappClinical = formData.programInterest === 'gapp';

  // Under GAPP's Family Caregiver Option a parent can be paid for personal
  // care only, never for behavioral aide. So "GAPP + wants pay +
  // behavioral/autism" is a dead end: block submission and redirect. Scoped to
  // GAPP — and only to GAPP — so a "yes" left over from before a program
  // change never blocks NOW/COMP or other referrals, while no same-step
  // control (like the referral-source dropdown) can lift the block without
  // changing the answer that triggered it.
  const seekingPaidGapp =
    showGappClinical &&
    formData.seekingPaidCaregiver === 'yes';

  // Paid-caregiver screening wording. The question is asked on every referral
  // — visibility and validation never vary, so no dropdown change can dodge
  // the screening — but the copy adapts on two axes: who is filling the form
  // (referral source) and whether the program serves children (GAPP). Nobody
  // is ever asked to be their own paid caregiver.
  const sourceView: 'self' | 'family' | 'third' = isSelfReferral
    ? 'self'
    : formData.referralSource === 'family'
    ? 'family'
    : 'third';
  const paidCaregiverQuestion =
    sourceView === 'self'
      ? showGappClinical
        ? 'Is a family member applying to be your paid caregiver?'
        : 'Is a family member or loved one applying to be your paid caregiver?'
      : sourceView === 'family'
      ? showGappClinical
        ? "Are you applying to be your child's paid caregiver?"
        : "Are you applying to be your loved one's paid caregiver?"
      : showGappClinical
      ? "Is a parent or family member applying to be the child's paid caregiver?"
      : "Is a family member applying to be the client's paid caregiver?";
  // Who the care is for, from the reader's point of view — used by the
  // careNeeds follow-up and the validation banner.
  const careSubject = showGappClinical
    ? sourceView === 'family'
      ? 'your child'
      : 'the child'
    : sourceView === 'family'
    ? 'your loved one'
    : 'the client';
  const careNeedsLabel =
    sourceView === 'self'
      ? 'What do you mainly need help with at home?'
      : `What does ${careSubject} mainly need help with at home?`;
  const careNeedsMissingLabel =
    sourceView === 'self'
      ? 'What you need help with'
      : `What ${careSubject} needs help with`;
  // What the structured answers say, and which GAPP service line they point to.
  // Same catalog and inference the GAPP site's form and the portal intake use.
  const structuredPicture = diagnosisPicture(
    formData.diagnoses,
    formData.diagnosisOther
  );
  const inferred = inferService({
    diagnoses: formData.diagnoses,
    diagnosisOther: formData.diagnosisOther,
    equipment: formData.equipment,
    behaviorRisk: formData.behaviorRisk,
    currentServices: formData.currentServices,
    careNeeds: formData.careNeeds,
  });
  // Cross-check the free-text needs/notes too — submitters dodge the radio by
  // picking "personal care" while describing autism. Kept separate from the
  // structured answers rather than concatenated: this prose is a long
  // description, and feeding it in as "Other" would read as an unclassifiable
  // medical signal on every submission and quietly disable the check.
  const proseDxClass = classifyFreeText(
    `${formData.serviceNeeds} ${formData.additionalNotes}`
  );
  // Reported skilled equipment settles it — the child needs nursing, so nothing
  // in the prose should block them (same rule as the GAPP site's form).
  const reportsSkilledCare = inferred.source === 'equipment';
  const isPaidBehavioralBlock =
    seekingPaidGapp &&
    !reportsSkilledCare &&
    (inferred.service === 'behavioral' || proseDxClass === 'behavioral');
  // Blocked by what they described, not the option they picked.
  const blockedByDiagnosis =
    isPaidBehavioralBlock && formData.careNeeds !== 'behavioral';
  // Behavioral alongside a physical/medical condition: don't block; prompt.
  const isPaidMixedDx =
    seekingPaidGapp &&
    !isPaidBehavioralBlock &&
    (proseDxClass === 'mixed' || structuredPicture === 'mixed');
  // Young child + paid-caregiver: advisory only, never a block. There is no age
  // rule in the GAPP manual; the lever is medical necessity (paid family hours
  // cover only care beyond age-typical needs), so we set expectations without
  // turning away medically fragile toddlers who can legitimately qualify.
  const isPaidYoungChild =
    seekingPaidGapp &&
    !!childAge &&
    childAge.years < YOUNG_PAID_CAREGIVER_AGE_YEARS;

  // "None of these" is mutually exclusive with every real answer, both ways.
  const toggleMulti = (field: 'diagnoses' | 'equipment' | 'currentServices',
                       code: string, noneCode?: string) =>
    setFormData((prev) => {
      const current = prev[field];
      let next: string[];
      if (noneCode && code === noneCode) {
        next = current.includes(noneCode) ? [] : [noneCode];
      } else {
        const without = noneCode ? current.filter((c) => c !== noneCode) : current;
        next = without.includes(code)
          ? without.filter((c) => c !== code)
          : [...without, code];
      }
      return { ...prev, [field]: next };
    });

  const hasDiagnosis =
    formData.diagnoses.length > 0 || formData.diagnosisOther.trim().length > 0;

  // The missing required fields for the current step, keyed by field, each
  // with the message shown directly under it. Same rules as isStepValid.
  const getFieldErrors = (): ReferralFieldErrors => {
    const errs: ReferralFieldErrors = {};
    if (step === 1) {
      if (!formData.programInterest) errs.programInterest = 'Please select a program.';
      if (!formData.clientCounty) errs.clientCounty = 'Please select a county.';
      if (!formData.clientFirstName) errs.clientFirstName = 'Please enter the first name.';
      if (!formData.clientLastName) errs.clientLastName = 'Please enter the last name.';
      if (!formData.clientDOB) errs.clientDOB = 'Please enter the date of birth.';
      if (!formData.clientPhone) errs.clientPhone = 'Please enter a phone number.';
      if (!formData.clientSecondaryPhone) errs.clientSecondaryPhone = 'Please enter a secondary phone number.';
      if (!formData.clientEmail) errs.clientEmail = 'Please enter an email address.';
    } else if (step === 2) {
      if (!formData.referralSource) errs.referralSource = 'Please tell us who is making this referral.';
      if (!isSelfReferral && formData.referralSource && !formData.referrerName) errs.referrerName = 'Please enter your name.';
      if (showGappClinical && !hasDiagnosis) errs.diagnoses = 'Check at least one diagnosis, or describe it under Other.';
      if (showGappClinical && formData.equipment.length === 0) errs.equipment = 'Check everything that applies, or the option that says none.';
      if (showGappClinical && !formData.behaviorRisk) errs.behaviorRisk = 'Please choose an answer.';
      if (!formData.seekingPaidCaregiver) errs.seekingPaidCaregiver = 'Please answer Yes or No.';
      if (formData.seekingPaidCaregiver === 'yes' && !formData.careNeeds) errs.careNeeds = 'Please choose an answer.';
    }
    return errs;
  };
  const labelFor = (k: ReferralField): string => (k === 'careNeeds' ? careNeedsMissingLabel : FIELD_LABEL[k]);

  // Returns list of missing required field labels for the current step
  const getMissingFields = (): string[] => {
    const errs = getFieldErrors();
    return FIELD_ORDER.filter((k) => errs[k]).map(labelFor);
  };

  // Recomputed from the live form data, so a field's message clears as soon
  // as the user fixes it while the others stay put.
  const fieldErrors: ReferralFieldErrors = showValidation ? getFieldErrors() : {};
  const fieldMessage = (k: ReferralField) => fieldErrors[k];

  // Show every problem on the step and take the user to the first one.
  const surfaceProblems = () => {
    setShowValidation(true);
    const first = firstErrorKey(FIELD_ORDER, getFieldErrors());
    if (first) escortToField(fieldId(first));
  };

  // Attempt to proceed — if invalid, show validation messages instead
  const handleAttemptNext = () => {
    if (isStepValid()) {
      setShowValidation(false);
      nextStep();
    } else {
      surfaceProblems();
    }
  };

  const handleAttemptSubmit = (e: React.FormEvent) => {
    // A GAPP parent seeking pay for behavioral/autism care cannot be submitted;
    // the redirect panel explains why and points to the ASD Program.
    if (isPaidBehavioralBlock) {
      e.preventDefault();
      return;
    }
    if (!isStepValid()) {
      e.preventDefault();
      surfaceProblems();
      return;
    }
    setShowValidation(false);
    handleSubmit(e);
  };

  // As-you-type formatter: (XXX) XXX-XXXX, also strips a leading +1.
  // Canonical helper shared with the portal forms.
  const formatPhoneNumber = formatUSPhone;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Auto-format phone number fields
    if (name === 'clientPhone' || name === 'clientSecondaryPhone' || name === 'referrerPhone') {
      setFormData({ ...formData, [name]: formatPhoneNumber(value) });
      return;
    }

    // If selecting self-referral, auto-fill referrer info with client info
    if (name === 'referralSource' && value === 'self') {
      setFormData({
        ...formData,
        referralSource: value,
        referrerName: `${formData.clientFirstName} ${formData.clientLastName}`.trim(),
        referrerPhone: formData.clientPhone,
        referrerEmail: formData.clientEmail,
        referrerOrganization: '',
      });
    } else if (name === 'programInterest' && value !== formData.programInterest) {
      // Reset county when program changes
      setFormData({
        ...formData,
        programInterest: value,
        clientCounty: '',
      });
    } else if (name === 'seekingPaidCaregiver' && value === 'no') {
      // Switching to "No" clears the care-need follow-up.
      setFormData({
        ...formData,
        seekingPaidCaregiver: 'no',
        careNeeds: '',
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const submissionData = {
        client: {
          firstName: formData.clientFirstName,
          lastName: formData.clientLastName,
          dob: formData.clientDOB,
          phone: formData.clientPhone,
          secondaryPhone: formData.clientSecondaryPhone,
          email: formData.clientEmail,
          address: formData.clientAddress,
          city: formData.clientCity,
          state: formData.clientState,
          zip: formData.clientZip,
          county: formData.clientCounty,
        },
        program: {
          interest: formData.programInterest,
          medicaidNumber: formData.medicaidNumber,
          insuranceProvider: formData.insuranceProvider,
          insuranceNumber: formData.insuranceNumber,
        },
        referrer: {
          source: formData.referralSource,
          name: formData.referrerName,
          phone: formData.referrerPhone,
          email: formData.referrerEmail,
          organization: formData.referrerOrganization,
        },
        details: {
          serviceNeeds: formData.serviceNeeds,
          urgency: formData.urgency,
          additionalNotes: formData.additionalNotes,
          // The paid-caregiver pair is asked on every referral and always
          // submits as answered. The clinical answers below are GAPP-only
          // questions: form state is kept while editing (so toggling the
          // program back restores them), but they must not ride along on a
          // referral submitted for another program.
          seekingPaidCaregiver: formData.seekingPaidCaregiver,
          careNeeds: formData.careNeeds,
          diagnoses: showGappClinical ? formData.diagnoses : [],
          diagnosisOther: showGappClinical ? formData.diagnosisOther : '',
          equipment: showGappClinical ? formData.equipment : [],
          behaviorRisk: showGappClinical ? formData.behaviorRisk : '',
          currentServices: showGappClinical ? formData.currentServices : [],
        },
      };

      // 1. Save to Firestore
      await addDoc(collection(db, 'referralSubmissions'), {
        ...submissionData,
        submittedAt: serverTimestamp(),
        status: 'new',
      });

      // 2. Send Email Notification & Add to CRM
      await processReferralSubmission(submissionData);

      setIsSubmitted(true);
    } catch (err) {
      console.error('Error submitting referral:', err);
      setError('There was an error submitting your referral. Please try again or call us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.programInterest && formData.clientCounty && formData.clientFirstName && formData.clientLastName && formData.clientDOB && formData.clientPhone && formData.clientSecondaryPhone && formData.clientEmail;
      case 2:
        return (
          formData.referralSource &&
          (isSelfReferral || formData.referrerName) &&
          (!showGappClinical ||
            (hasDiagnosis &&
              formData.equipment.length > 0 &&
              formData.behaviorRisk !== '')) &&
          formData.seekingPaidCaregiver &&
          (formData.seekingPaidCaregiver === 'no' || formData.careNeeds)
        );
      default:
        return true;
    }
  };

  const nextStep = () => { setShowValidation(false); setStep(2); };
  const prevStep = () => { setShowValidation(false); setStep(1); };

  // Check if a specific field should show a validation error
  const isFieldInvalid = (fieldName: ReferralField): boolean => !!fieldErrors[fieldName];

  // Get counties for the selected program
  const counties = formData.programInterest ? getCountiesForProgram(formData.programInterest) : null;

  if (isSubmitted) {
    return (
      <div className={styles.referralPage}>
        <section className={styles.hero}>
          <div className="container">
            <div className={styles.heroContent}>
              <div className={styles.successIcon}>
                <CheckCircle size={64} />
              </div>
              <h1>Referral Submitted!</h1>
              <p className={styles.heroSubtitle}>
                Thank you for your referral. Our team will review the information and
                contact you within 1-2 business days.
              </p>
              <div className={styles.successActions}>
                <Link href="/" className="btn btn-primary btn-lg">
                  Return to Home
                </Link>
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => {
                    setIsSubmitted(false);
                    setStep(1);
                    setFormData({
                      programInterest: '', clientCounty: '', clientFirstName: '', clientLastName: '',
                      clientDOB: '', clientPhone: '', clientSecondaryPhone: '', clientEmail: '', clientAddress: '',
                      clientCity: '', clientState: 'GA', clientZip: '',
                      referralSource: '', referrerName: '', referrerPhone: '',
                      referrerEmail: '', referrerOrganization: '', medicaidNumber: '',
                      insuranceProvider: '', insuranceNumber: '', serviceNeeds: '',
                      urgency: 'standard', additionalNotes: '',
                      seekingPaidCaregiver: '', careNeeds: '',
                      diagnoses: [], diagnosisOther: '', equipment: [],
                      behaviorRisk: '' as BehaviorRisk, currentServices: [],
                    });
                  }}
                >
                  Submit Another Referral
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.referralPage}>
      {/* Page Header */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.heroLabel}>Start the Process</span>
            <h1>Client Referral Form</h1>
            <p className={styles.heroSubtitle}>
              Complete the form below to refer a client for our home health care services.
              Our team will review and respond within 1-2 business days.
            </p>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className={styles.trustSection}>
        <div className="container">
          <div className={styles.trustGrid}>
            <div className={styles.trustItem}>
              <Shield size={24} />
              <span>Secure & Confidential</span>
            </div>
            <div className={styles.trustItem}>
              <Clock size={24} />
              <span>1-2 Day Response Time</span>
            </div>
            <div className={styles.trustItem}>
              <CheckCircle size={24} />
              <span>No Obligation</span>
            </div>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className={`section ${styles.formSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
          {/* Progress Steps */}
          <div className={styles.progressContainer}>
            <div className={styles.progressSteps}>
              {[
                { num: 1, label: 'Client Info', icon: User },
                { num: 2, label: 'Referral & Insurance', icon: Send },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`${styles.progressStep} ${step >= s.num ? styles.active : ''} ${step > s.num ? styles.completed : ''}`}
                >
                  <div className={styles.stepCircle}>
                    {step > s.num ? <CheckCircle size={20} /> : <s.icon size={20} />}
                  </div>
                  <span className={styles.stepLabel}>{s.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${((step - 1) / 1) * 100}%` }} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Step 1: Client Information */}
            {step === 1 && (
              <div className={styles.formStep}>
                <h2><User size={28} /> Client Information</h2>
                <p className={styles.stepDescription}>
                  Select the program of interest and provide information about the individual who will be receiving care.
                </p>

                {/* Program Selection — first so county can filter */}
                <div className={styles.formGridSingle}>
                  <div className="form-group" id={fieldId('programInterest')}>
                    <label htmlFor="programInterest" className="form-label">Program of Interest *</label>
                    <select
                      id="programInterest"
                      name="programInterest"
                      className={`form-select ${isFieldInvalid('programInterest') ? styles.fieldError : ''}`}
                      value={formData.programInterest}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select a program</option>
                      {programs.map((prog) => (
                        <option key={prog.value} value={prog.value}>{prog.label}</option>
                      ))}
                    </select>
                    <FieldError message={fieldMessage('programInterest')} />
                  </div>
                  <div className={styles.programDescription}>
                    <AnimatePresence mode="wait">
                      {formData.programInterest ? (
                        <motion.div
                          key={formData.programInterest}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                        >
                          <div className={styles.programDescriptionHeader}>
                            <Info size={14} />
                            <span>About this program</span>
                          </div>
                          <p>{programs.find(p => p.value === formData.programInterest)?.description}</p>
                          {formData.programInterest !== 'private-pay' && formData.programInterest !== 'other' && (
                            <a
                              href={`/programs/${formData.programInterest}`}
                              className={styles.programLearnMore}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Learn more about this program <ArrowRight size={14} />
                            </a>
                          )}
                        </motion.div>
                      ) : (
                        <motion.p
                          key="placeholder"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className={styles.programDescriptionPlaceholder}
                        >
                          Select a program to see a brief description
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* County Selection — dynamic based on program */}
                <div className={styles.countySection}>
                  <div className="form-group" id={fieldId('clientCounty')}>
                    <label htmlFor="clientCounty" className="form-label">County *</label>
                    <select
                      id="clientCounty"
                      name="clientCounty"
                      className={`form-select ${isFieldInvalid('clientCounty') ? styles.fieldError : ''}`}
                      value={formData.clientCounty}
                      onChange={handleChange}
                      required
                      disabled={!formData.programInterest}
                    >
                      <option value="">
                        {formData.programInterest ? 'Select county' : 'Select a program first'}
                      </option>
                      {counties && (
                        <>
                          <optgroup label="Primary Service Area">
                            {counties.primary.sort().map((county) => (
                              <option key={county} value={county}>{county} County</option>
                            ))}
                          </optgroup>
                          <optgroup label="Extended Service Area">
                            {counties.extended.sort().map((county) => (
                              <option key={county} value={county}>{county} County</option>
                            ))}
                          </optgroup>
                          <optgroup label="Other">
                            <option value="other">Other — My county is not listed</option>
                          </optgroup>
                        </>
                      )}
                    </select>
                    {!formData.programInterest && (
                      <span className="form-helper">Please select a program above to see available counties</span>
                    )}
                    <FieldError message={fieldMessage('clientCounty')} />
                  </div>
                  {formData.clientCounty === 'other' && (
                    <div className={styles.countyNotice}>
                      <AlertCircle size={16} />
                      <p>Your county may be outside our current service area. No worries — submit your referral and our team will follow up to discuss options.</p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className={styles.sectionDivider} />

                {/* Client Details */}
                <div className={styles.formGrid}>
                  <div className="form-group" id={fieldId('clientFirstName')}>
                    <label htmlFor="clientFirstName" className="form-label">First Name *</label>
                    <input
                      type="text"
                      id="clientFirstName"
                      name="clientFirstName"
                      className={`form-input ${isFieldInvalid('clientFirstName') ? styles.fieldError : ''}`}
                      placeholder="First name"
                      value={formData.clientFirstName}
                      onChange={handleChange}
                      required
                    />
                    <FieldError message={fieldMessage('clientFirstName')} />
                  </div>
                  <div className="form-group" id={fieldId('clientLastName')}>
                    <label htmlFor="clientLastName" className="form-label">Last Name *</label>
                    <input
                      type="text"
                      id="clientLastName"
                      name="clientLastName"
                      className={`form-input ${isFieldInvalid('clientLastName') ? styles.fieldError : ''}`}
                      placeholder="Last name"
                      value={formData.clientLastName}
                      onChange={handleChange}
                      required
                    />
                    <FieldError message={fieldMessage('clientLastName')} />
                  </div>
                  <div className="form-group" id={fieldId('clientDOB')}>
                    <label htmlFor="clientDOB" className="form-label">Date of Birth *</label>
                    <input
                      type="date"
                      id="clientDOB"
                      name="clientDOB"
                      className={`form-input ${isFieldInvalid('clientDOB') ? styles.fieldError : ''}`}
                      value={formData.clientDOB}
                      onChange={handleChange}
                      max={today}
                      min={minDOB}
                      required
                    />
                    <FieldError message={fieldMessage('clientDOB')} />
                    {showChildAge && (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                        Child&apos;s age:{' '}
                        <strong>{formatAge(debouncedClientDOB)}</strong>
                      </p>
                    )}
                  </div>
                  <div className="form-group" id={fieldId('clientPhone')}>
                    <label htmlFor="clientPhone" className="form-label">Phone Number *</label>
                    <input
                      type="tel"
                      id="clientPhone"
                      name="clientPhone"
                      className={`form-input ${isFieldInvalid('clientPhone') ? styles.fieldError : ''}`}
                      placeholder="(XXX) XXX-XXXX"
                      value={formData.clientPhone}
                      onChange={handleChange}
                      required
                    />
                    <FieldError message={fieldMessage('clientPhone')} />
                  </div>
                  <div className="form-group" id={fieldId('clientSecondaryPhone')}>
                    <label htmlFor="clientSecondaryPhone" className="form-label">Secondary Phone Number *</label>
                    <input
                      type="tel"
                      id="clientSecondaryPhone"
                      name="clientSecondaryPhone"
                      className={`form-input ${isFieldInvalid('clientSecondaryPhone') ? styles.fieldError : ''}`}
                      placeholder="(XXX) XXX-XXXX"
                      value={formData.clientSecondaryPhone}
                      onChange={handleChange}
                      required
                    />
                    <FieldError message={fieldMessage('clientSecondaryPhone')} />
                    <span className="form-helper">Alternate contact number (e.g., caregiver, family member)</span>
                  </div>
                  <div className="form-group" id={fieldId('clientEmail')}>
                    <label htmlFor="clientEmail" className="form-label">Email Address *</label>
                    <input
                      type="email"
                      id="clientEmail"
                      name="clientEmail"
                      className={`form-input ${isFieldInvalid('clientEmail') ? styles.fieldError : ''}`}
                      placeholder="email@example.com"
                      value={formData.clientEmail}
                      onChange={handleChange}
                      required
                    />
                    <FieldError message={fieldMessage('clientEmail')} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientAddress" className="form-label">Street Address</label>
                    <input
                      type="text"
                      id="clientAddress"
                      name="clientAddress"
                      className="form-input"
                      placeholder="123 Main St"
                      value={formData.clientAddress}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientCity" className="form-label">City</label>
                    <input
                      type="text"
                      id="clientCity"
                      name="clientCity"
                      className="form-input"
                      placeholder="City"
                      value={formData.clientCity}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientState" className="form-label">State</label>
                    <select
                      id="clientState"
                      name="clientState"
                      className="form-select"
                      value={formData.clientState}
                      onChange={handleChange}
                    >
                      <option value="AL">AL</option><option value="AK">AK</option><option value="AZ">AZ</option><option value="AR">AR</option>
                      <option value="CA">CA</option><option value="CO">CO</option><option value="CT">CT</option><option value="DE">DE</option>
                      <option value="FL">FL</option><option value="GA">GA</option><option value="HI">HI</option><option value="ID">ID</option>
                      <option value="IL">IL</option><option value="IN">IN</option><option value="IA">IA</option><option value="KS">KS</option>
                      <option value="KY">KY</option><option value="LA">LA</option><option value="ME">ME</option><option value="MD">MD</option>
                      <option value="MA">MA</option><option value="MI">MI</option><option value="MN">MN</option><option value="MS">MS</option>
                      <option value="MO">MO</option><option value="MT">MT</option><option value="NE">NE</option><option value="NV">NV</option>
                      <option value="NH">NH</option><option value="NJ">NJ</option><option value="NM">NM</option><option value="NY">NY</option>
                      <option value="NC">NC</option><option value="ND">ND</option><option value="OH">OH</option><option value="OK">OK</option>
                      <option value="OR">OR</option><option value="PA">PA</option><option value="RI">RI</option><option value="SC">SC</option>
                      <option value="SD">SD</option><option value="TN">TN</option><option value="TX">TX</option><option value="UT">UT</option>
                      <option value="VT">VT</option><option value="VA">VA</option><option value="WA">WA</option><option value="WV">WV</option>
                      <option value="WI">WI</option><option value="WY">WY</option><option value="DC">DC</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientZip" className="form-label">ZIP Code</label>
                    <input
                      type="text"
                      id="clientZip"
                      name="clientZip"
                      className="form-input"
                      placeholder="XXXXX"
                      value={formData.clientZip}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Referral & Insurance */}
            {step === 2 && (
              <div className={styles.formStep}>
                <h2><Send size={28} /> Referral & Insurance</h2>
                <p className={styles.stepDescription}>
                  Tell us who is making this referral and provide any available insurance information.
                </p>

                <div className={styles.formGridSingle}>
                  {/* Referral Source */}
                  <div className="form-group" id={fieldId('referralSource')}>
                    <label htmlFor="referralSource" className="form-label">Who is making this referral? *</label>
                    <select
                      id="referralSource"
                      name="referralSource"
                      className={`form-select ${isFieldInvalid('referralSource') ? styles.fieldError : ''}`}
                      value={formData.referralSource}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select referral source</option>
                      {referralSources.map((source) => (
                        <option key={source.value} value={source.value}>{source.label}</option>
                      ))}
                    </select>
                    <FieldError message={fieldMessage('referralSource')} />
                  </div>

                  {/* Self-referral notice */}
                  {isSelfReferral && (
                    <div className={styles.selfReferralNotice}>
                      <CheckCircle size={16} />
                      <p>Since you are referring yourself, we&apos;ll use the contact information you provided on the previous step.</p>
                    </div>
                  )}

                  {/* Referrer fields — only show if NOT self-referral */}
                  {!isSelfReferral && formData.referralSource && (
                    <>
                      <div className="form-group" id={fieldId('referrerName')}>
                        <label htmlFor="referrerName" className="form-label">Your Name *</label>
                        <input
                          type="text"
                          id="referrerName"
                          name="referrerName"
                          className={`form-input ${isFieldInvalid('referrerName') ? styles.fieldError : ''}`}
                          placeholder="Full name"
                          value={formData.referrerName}
                          onChange={handleChange}
                          required
                        />
                        <FieldError message={fieldMessage('referrerName')} />
                      </div>
                      <div className="form-group">
                        <label htmlFor="referrerPhone" className="form-label">Your Phone</label>
                        <input
                          type="tel"
                          id="referrerPhone"
                          name="referrerPhone"
                          className="form-input"
                          placeholder="(XXX) XXX-XXXX"
                          value={formData.referrerPhone}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="referrerEmail" className="form-label">Your Email</label>
                        <input
                          type="email"
                          id="referrerEmail"
                          name="referrerEmail"
                          className="form-input"
                          placeholder="email@example.com"
                          value={formData.referrerEmail}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="referrerOrganization" className="form-label">Organization</label>
                        <input
                          type="text"
                          id="referrerOrganization"
                          name="referrerOrganization"
                          className="form-input"
                          placeholder="Company or facility name"
                          value={formData.referrerOrganization}
                          onChange={handleChange}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Insurance Section */}
                <div className={styles.sectionDivider} />
                <h3 className={styles.subSectionTitle}>Insurance Information</h3>
                <p className={styles.subSectionDescription}>Optional — provide if available</p>

                <div className={styles.formGrid}>
                  <div className="form-group">
                    <label htmlFor="medicaidNumber" className="form-label">Medicaid Number</label>
                    <input
                      type="text"
                      id="medicaidNumber"
                      name="medicaidNumber"
                      className="form-input"
                      placeholder="Medicaid ID number"
                      value={formData.medicaidNumber}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="insuranceProvider" className="form-label">Insurance Provider</label>
                    <input
                      type="text"
                      id="insuranceProvider"
                      name="insuranceProvider"
                      className="form-input"
                      placeholder="Insurance company name"
                      value={formData.insuranceProvider}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="insuranceNumber" className="form-label">Policy Number</label>
                    <input
                      type="text"
                      id="insuranceNumber"
                      name="insuranceNumber"
                      className="form-input"
                      placeholder="Policy number"
                      value={formData.insuranceNumber}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* Service Needs Section */}
                <div className={styles.sectionDivider} />
                <h3 className={styles.subSectionTitle}>Additional Details</h3>
                <p className={styles.subSectionDescription}>Optional — share anything that would help us serve this client better</p>

                <div className={styles.formGridFull}>
                  <div className="form-group">
                    <label htmlFor="serviceNeeds" className="form-label">Description of Service Needs</label>
                    <textarea
                      id="serviceNeeds"
                      name="serviceNeeds"
                      className="form-textarea"
                      placeholder="Care needs, diagnoses, current care situation, specific requirements..."
                      rows={4}
                      value={formData.serviceNeeds}
                      onChange={handleChange}
                    />
                  </div>
                  <div className={styles.formGridSingle}>
                    <div className="form-group">
                      <label htmlFor="urgency" className="form-label">Urgency Level</label>
                      <select
                        id="urgency"
                        name="urgency"
                        className="form-select"
                        value={formData.urgency}
                        onChange={handleChange}
                      >
                        <option value="standard">Standard (1-2 weeks)</option>
                        <option value="urgent">Urgent (within 1 week)</option>
                        <option value="immediate">Immediate (ASAP)</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="additionalNotes" className="form-label">Additional Notes</label>
                    <textarea
                      id="additionalNotes"
                      name="additionalNotes"
                      className="form-textarea"
                      placeholder="Any other information you would like to share..."
                      rows={3}
                      value={formData.additionalNotes}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* GAPP clinical questions. These shape which GAPP service line
                    fits (skilled nursing / PSS / behavioral support aide); none
                    of them decides eligibility, which Alliant determines from
                    medical necessity (GAPP manual §702.1.1). Same catalog the
                    GAPP site's form uses, so both funnels produce comparable
                    answers. */}
                {showGappClinical && (
                  <>
                    <div className={styles.sectionDivider} />
                    <h3 className={styles.subSectionTitle}>About your child&apos;s needs</h3>
                    <p className={styles.subSectionDescription}>
                      This helps us match your child with the right kind of care.
                    </p>

                    <div className={styles.formGridSingle}>
                      <div className="form-group" id={fieldId('diagnoses')}>
                        <label className="form-label">
                          What has your child been diagnosed with? *
                        </label>
                        <p className={styles.checkboxHint}>
                          Check everything that applies. If you are not sure of the
                          exact name, use &ldquo;Other&rdquo; below.
                        </p>
                        {DIAGNOSIS_GROUPS.map((group) => (
                          <fieldset key={group.key} className={styles.checkboxGroup}>
                            <legend className={styles.checkboxLegend}>{group.title}</legend>
                            {group.options.map((opt) => (
                              <label key={opt.code} className={styles.checkboxRow}>
                                <input
                                  type="checkbox"
                                  checked={formData.diagnoses.includes(opt.code)}
                                  onChange={() => toggleMulti('diagnoses', opt.code)}
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </fieldset>
                        ))}
                        <label htmlFor="diagnosisOther" className={styles.checkboxLegend}>
                          Other (please describe)
                        </label>
                        <input
                          id="diagnosisOther"
                          name="diagnosisOther"
                          type="text"
                          className={`form-input ${
                            isFieldInvalid('diagnoses') ? styles.fieldError : ''
                          }`}
                          placeholder="Anything not listed above"
                          value={formData.diagnosisOther}
                          onChange={handleChange}
                        />
                        <FieldError message={fieldMessage('diagnoses')} />
                      </div>

                      <div className="form-group" id={fieldId('equipment')}>
                        <label className="form-label">
                          Which of these does your child need at home? *
                        </label>
                        <p className={styles.checkboxHint}>
                          Check everything that applies.
                        </p>
                        <div className={styles.checkboxGroup} style={isFieldInvalid('equipment') ? FIELD_ERROR_WRAP_STYLE : undefined}>
                          {EQUIPMENT_OPTIONS.map((opt) => (
                            <label key={opt.code} className={styles.checkboxRow}>
                              <input
                                type="checkbox"
                                checked={formData.equipment.includes(opt.code)}
                                onChange={() =>
                                  toggleMulti('equipment', opt.code, 'equip_none')
                                }
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                        <FieldError message={fieldMessage('equipment')} />
                      </div>

                      <div className="form-group" id={fieldId('behaviorRisk')}>
                        <label htmlFor="behaviorRisk" className="form-label">
                          Does your child have behaviors that put them or others at
                          risk, or that stop daily activities? *
                        </label>
                        <p className={styles.checkboxHint}>
                          For example, aggression, self-injury, or running away.
                        </p>
                        <select
                          id="behaviorRisk"
                          name="behaviorRisk"
                          className={`form-select ${
                            isFieldInvalid('behaviorRisk') ? styles.fieldError : ''
                          }`}
                          value={formData.behaviorRisk}
                          onChange={handleChange}
                        >
                          <option value="">Please select</option>
                          {BEHAVIOR_RISK_OPTIONS.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <FieldError message={fieldMessage('behaviorRisk')} />
                      </div>

                      <div className="form-group">
                        <label className="form-label">
                          What services does your child already receive?
                        </label>
                        <p className={styles.checkboxHint}>
                          Optional, but it helps us understand what is already in place.
                        </p>
                        <div className={styles.checkboxGroup}>
                          {CURRENT_SERVICE_OPTIONS.map((opt) => (
                            <label key={opt.code} className={styles.checkboxRow}>
                              <input
                                type="checkbox"
                                checked={formData.currentServices.includes(opt.code)}
                                onChange={() =>
                                  toggleMulti('currentServices', opt.code, 'services_none')
                                }
                              />
                              <span>{opt.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Paid-caregiver screening — asked on EVERY referral, and
                    always required, so the GAPP behavioral hard-stop and the
                    server-side review flags can't be sidestepped by a program
                    or referral-source change. Only the wording varies (see
                    paidCaregiverQuestion): child-focused copy for GAPP,
                    loved-one/client copy elsewhere, and nobody is ever asked
                    to be their own paid caregiver. */}
                <div className={styles.sectionDivider} />
                <h3 className={styles.subSectionTitle}>One more question</h3>

                <div className={styles.formGridSingle}>
                  <div className="form-group" id={fieldId('seekingPaidCaregiver')}>
                    <label htmlFor="seekingPaidCaregiver" className="form-label">
                      {paidCaregiverQuestion} *
                    </label>
                    <p
                      style={{
                        margin: '0.25rem 0 0.5rem',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        color: '#4b5563',
                      }}
                    >
                      {!showGappClinical ? (
                        <>
                          Some Georgia programs can pay a family member or another
                          loved one who provides care. Who can be paid — and for
                          which services — differs by program, so your answer
                          simply helps us prepare the right conversation. If you
                          are unsure, choose No. It will not affect the
                          application.
                        </>
                      ) : sourceView === 'self' ? (
                        <>
                          Your GAPP care (nursing or personal care) is the same
                          whether or not a family member is paid to provide it.
                          Being a paid family caregiver is a separate, limited
                          option: it covers personal care only, you must medically
                          qualify for GAPP, and it is{' '}
                          <strong>
                            not available for autism, behavioral, or developmental
                            needs
                          </strong>
                          . If you are unsure, choose No. It will not affect your
                          application.
                        </>
                      ) : sourceView === 'family' ? (
                        <>
                          Your child&apos;s GAPP care (nursing or personal care) is
                          the same whether or not a parent is paid to provide it.
                          Being a paid family caregiver is a separate, limited
                          option: it covers personal care only, your child must
                          medically qualify for GAPP, and it is{' '}
                          <strong>
                            not available for autism, behavioral, or developmental
                            needs
                          </strong>
                          . If you are unsure, choose No. It will not affect your
                          child&apos;s application.
                        </>
                      ) : (
                        <>
                          The child&apos;s GAPP care (nursing or personal care) is
                          the same whether or not a parent is paid to provide it.
                          Being a paid family caregiver is a separate, limited
                          option: it covers personal care only, the child must
                          medically qualify for GAPP, and it is{' '}
                          <strong>
                            not available for autism, behavioral, or developmental
                            needs
                          </strong>
                          . If unsure, choose No. It will not affect the
                          application.
                        </>
                      )}
                    </p>
                    <select
                      id="seekingPaidCaregiver"
                      name="seekingPaidCaregiver"
                      className={`form-select ${isFieldInvalid('seekingPaidCaregiver') ? styles.fieldError : ''}`}
                      value={formData.seekingPaidCaregiver}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select an answer</option>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                    <FieldError message={fieldMessage('seekingPaidCaregiver')} />
                  </div>

                  {formData.seekingPaidCaregiver === 'yes' && (
                    <>
                      <div className="form-group" id={fieldId('careNeeds')}>
                        <label htmlFor="careNeeds" className="form-label">
                          {careNeedsLabel} *
                        </label>
                        <select
                          id="careNeeds"
                          name="careNeeds"
                          className={`form-select ${isFieldInvalid('careNeeds') ? styles.fieldError : ''}`}
                          value={formData.careNeeds}
                          onChange={handleChange}
                          required
                        >
                          <option value="">Please select</option>
                          <option value="personal">
                            Hands-on personal care (feeding, bathing, dressing, getting around)
                          </option>
                          <option value="nursing">
                            Skilled medical or nursing care (feeding tube, trach, ventilator, oxygen, seizures)
                          </option>
                          <option value="behavioral">
                            Behavioral support or autism-related needs
                          </option>
                          <option value="unsure">Not sure</option>
                        </select>
                        <FieldError message={fieldMessage('careNeeds')} />
                      </div>

                      {isPaidBehavioralBlock && (
                        <div className={styles.countyNotice}>
                          <AlertCircle size={16} />
                          <p>
                            {blockedByDiagnosis &&
                              "Based on what you described, your child's needs look developmental or behavioral. "}
                            A parent generally cannot be paid to provide behavioral
                            or autism care. Under GAPP&apos;s Family Caregiver Option,
                            a parent can be paid for personal care only (help with
                            feeding, bathing, dressing, and getting around), not for
                            skilled nursing or behavioral support. For autism, the
                            program is Georgia Medicaid&apos;s Autism Spectrum Disorder
                            (ASD) Program, which covers ABA therapy. To get started,
                            contact your child&apos;s Medicaid care management
                            organization (CMO) or visit{' '}
                            <a
                              href="https://medicaid.georgia.gov/programs/all-programs/autism-spectrum-disorder"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'inherit', fontWeight: 600 }}
                            >
                              medicaid.georgia.gov/autism-spectrum-disorder
                            </a>
                            , or call Georgia Medicaid (DCH) at{' '}
                            <a
                              href="tel:+14046564507"
                              style={{ color: 'inherit', fontWeight: 600 }}
                            >
                              (404) 656-4507
                            </a>
                            . For other developmental needs, look into the NOW and COMP
                            waivers. If your child also needs hands-on personal care
                            or nursing at home, please call us and we will help.
                          </p>
                        </div>
                      )}

                      {isPaidMixedDx && (
                        <div className={styles.countyNotice}>
                          <AlertCircle size={16} />
                          <p>
                            You described a physical or medical condition along with a
                            developmental or behavioral one. A parent can be paid only
                            for hands-on care related to the physical or medical
                            condition, not for autism or behavioral support. We will
                            confirm what your child qualifies for when we talk.
                          </p>
                        </div>
                      )}

                      {isPaidYoungChild && !isPaidBehavioralBlock && (
                        <div className={styles.countyNotice}>
                          <AlertCircle size={16} />
                          <p>
                            A note about being paid to care for a young child: Medicaid
                            approves paid family caregiver hours only for care that goes
                            beyond what a child of the same age would ordinarily need.
                            Everyday help for infants and young children, like feeding,
                            bathing, dressing, and diapering, is considered typical
                            parenting, so paid hours are rarely approved at this age.
                            Approval is more likely when a child has significant medical
                            needs, such as a feeding tube, trach, or ventilator. You are
                            welcome to apply either way. Your child may still qualify
                            for other GAPP services based on their medical needs.
                          </p>
                        </div>
                      )}

                      {/* ASD-program routing makes sense only for the programs
                          that serve children/I-DD; an EDWP or ICWP adult with
                          behavioral needs should not be pointed at ABA. */}
                      {!isPaidBehavioralBlock &&
                        (showGappClinical ||
                          formData.programInterest === 'now-comp') &&
                        formData.careNeeds === 'behavioral' && (
                          <div className={styles.countyNotice}>
                            <AlertCircle size={16} />
                            <p>
                              For autism, Georgia Medicaid&apos;s Autism Spectrum
                              Disorder (ASD) Program (ABA therapy) is usually the
                              right place to start. Contact your child&apos;s Medicaid
                              CMO or visit{' '}
                              <a
                                href="https://medicaid.georgia.gov/programs/all-programs/autism-spectrum-disorder"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: 'inherit', fontWeight: 600 }}
                              >
                                medicaid.georgia.gov/autism-spectrum-disorder
                              </a>
                              , or call DCH at{' '}
                              <a
                                href="tel:+14046564507"
                                style={{ color: 'inherit', fontWeight: 600 }}
                              >
                                (404) 656-4507
                              </a>
                              . You are welcome to continue and we will help you find
                              the right path.
                            </p>
                          </div>
                        )}

                      {/* Keyed on the inferred service line, not the care-need
                          dropdown, so this matches what the GAPP site's form
                          tells the same family. */}
                      {formData.programInterest === 'gapp' &&
                        inferred.service === 'pss' &&
                        !isPaidBehavioralBlock &&
                        !isPaidMixedDx && (
                          <div className={styles.countyNotice}>
                            <AlertCircle size={16} />
                            <p>
                              You may qualify for GAPP&apos;s Family Caregiver Option.
                              GAPP can pay a legally responsible adult family member
                              who lives with the child to provide personal care
                              support. The agency hires you as an employee, and the
                              paid hours are set by a nurse&apos;s assessment. We will
                              walk you through it.
                            </p>
                          </div>
                        )}

                      {/* Reported skilled care: the FCO covers personal support
                          only, never skilled nursing (§604.2, §604.3). */}
                      {formData.programInterest === 'gapp' &&
                        inferred.service === 'nursing' &&
                        !isPaidBehavioralBlock &&
                        !isPaidMixedDx && (
                          <div className={styles.countyNotice}>
                            <AlertCircle size={16} />
                            <p>
                              A parent can be paid for personal care support, but not
                              for skilled nursing. If your child also needs hands-on
                              personal care, you may qualify for the Family Caregiver
                              Option. We will go over what fits when we talk.
                            </p>
                          </div>
                        )}
                    </>
                  )}

                  {/* CMO disclosure. Per the January 2026 GAPP Provider
                      Teleconference: "if a member wants to apply for GAPP
                      services, that they will be removed from their CMO if they
                      are in one. They need to know that they may not receive
                      some of the services that they were provided in their CMO."
                      GAPP-only, and worded to make clear this form is a referral,
                      not the Medicaid filing. */}
                  {showGappClinical && (
                    <div className={styles.cmoNotice}>
                      <Info size={16} />
                      <div>
                        <strong>One thing to know before you apply.</strong>
                        <p>
                          If your child is currently enrolled in a Medicaid care
                          management organization (CMO), applying for GAPP will
                          remove them from it, and some services their CMO covers
                          may not be available through GAPP.
                        </p>
                        <p>
                          Sending this form does not apply for GAPP or change your
                          child&apos;s Medicaid coverage. It starts a conversation
                          with us. We will go over what your child would gain and
                          lose before anything is filed.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Validation Banner */}
            {showValidation && getMissingFields().length > 0 && (
              <div className={styles.validationBanner}>
                <AlertCircle size={18} />
                <div>
                  <strong>Please complete the following required fields:</strong>
                  <ul>
                    {getMissingFields().map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Form Navigation */}
            <div className={styles.formNav}>
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  Previous Step
                </button>
              )}
              <div className={styles.navSpacer} />
              {step < 2 ? (
                <button
                  type="button"
                  className={`btn btn-primary ${isStepValid() ? styles.btnReady : styles.btnFaded}`}
                  onClick={handleAttemptNext}
                >
                  Next Step <ArrowRight size={18} />
                </button>
              ) : (
                <div className={styles.submitSection}>
                  {error && (
                    <div className={styles.errorMessage}>
                      <AlertCircle size={20} />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`btn btn-gold btn-lg ${isStepValid() && !isPaidBehavioralBlock ? styles.btnReady : styles.btnFaded}`}
                    onClick={handleAttemptSubmit}
                    disabled={isSubmitting || isPaidBehavioralBlock}
                  >
                    <Send size={20} /> {isSubmitting ? 'Submitting...' : 'Submit Referral'}
                  </button>
                  {isPaidBehavioralBlock && (
                    <FieldError message="This referral cannot be submitted as answered: under GAPP a parent cannot be paid for behavioral or autism care. See the note above for the ASD Program, or change the paid caregiver answer if it was a mistake." />
                  )}
                </div>
              )}
            </div>
          </form>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
