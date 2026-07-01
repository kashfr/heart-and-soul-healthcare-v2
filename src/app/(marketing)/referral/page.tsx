'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUSPhone } from '@/lib/phone';
import { classifyDiagnosis } from '@/lib/diagnosisScreening';
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

  // Under GAPP's Family Caregiver Option a parent can be paid for personal care
  // only, never for behavioral aide. So "GAPP + wants pay + behavioral/autism"
  // is a dead end: block submission and redirect. Scoped to GAPP so it never
  // blocks NOW/COMP or other referrals.
  const seekingPaidGapp =
    formData.programInterest === 'gapp' &&
    formData.seekingPaidCaregiver === 'yes';
  // Cross-check the free-text needs/notes too — submitters dodge the radio by
  // picking "personal care" while describing autism. A behavioral/developmental
  // description with no physical condition is a paid-parent dead end, same as
  // selecting the behavioral option.
  const careNeedsDxClass = classifyDiagnosis(
    `${formData.serviceNeeds} ${formData.additionalNotes}`
  );
  const isPaidBehavioralBlock =
    seekingPaidGapp &&
    (formData.careNeeds === 'behavioral' || careNeedsDxClass === 'behavioral');
  // Blocked by the description, not the option they picked.
  const blockedByDiagnosis =
    isPaidBehavioralBlock && formData.careNeeds !== 'behavioral';
  // Behavioral description + a physical/medical condition: don't block; prompt.
  const isPaidMixedDx =
    seekingPaidGapp && !isPaidBehavioralBlock && careNeedsDxClass === 'mixed';

  // Returns list of missing required field labels for the current step
  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (step === 1) {
      if (!formData.programInterest) missing.push('Program of Interest');
      if (!formData.clientCounty) missing.push('County');
      if (!formData.clientFirstName) missing.push('First Name');
      if (!formData.clientLastName) missing.push('Last Name');
      if (!formData.clientDOB) missing.push('Date of Birth');
      if (!formData.clientPhone) missing.push('Phone Number');
      if (!formData.clientSecondaryPhone) missing.push('Secondary Phone Number');
      if (!formData.clientEmail) missing.push('Email Address');
    } else if (step === 2) {
      if (!formData.referralSource) missing.push('Referral Source');
      if (!isSelfReferral && formData.referralSource && !formData.referrerName) missing.push('Referrer Name');
      if (!formData.seekingPaidCaregiver) missing.push('Paid caregiver question');
      if (formData.seekingPaidCaregiver === 'yes' && !formData.careNeeds)
        missing.push('What your child needs help with');
    }
    return missing;
  };

  // Attempt to proceed — if invalid, show validation messages instead
  const handleAttemptNext = () => {
    if (isStepValid()) {
      setShowValidation(false);
      nextStep();
    } else {
      setShowValidation(true);
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
      setShowValidation(true);
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

    // Clear validation when user starts filling fields
    if (showValidation) setShowValidation(false);

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
          seekingPaidCaregiver: formData.seekingPaidCaregiver,
          careNeeds: formData.careNeeds,
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
  const isFieldInvalid = (fieldName: string): boolean => {
    if (!showValidation) return false;
    const value = formData[fieldName as keyof typeof formData];
    // Only flag required fields
    const requiredStep1 = ['programInterest', 'clientCounty', 'clientFirstName', 'clientLastName', 'clientDOB', 'clientPhone', 'clientSecondaryPhone', 'clientEmail'];
    const requiredStep2 = ['referralSource', 'seekingPaidCaregiver'];
    if (step === 1 && requiredStep1.includes(fieldName)) return !value;
    if (step === 2 && requiredStep2.includes(fieldName)) return !value;
    if (step === 2 && fieldName === 'referrerName' && !isSelfReferral && formData.referralSource) return !value;
    if (step === 2 && fieldName === 'careNeeds' && formData.seekingPaidCaregiver === 'yes') return !value;
    return false;
  };

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
                  <div className="form-group">
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
                  <div className="form-group">
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
                  <div className="form-group">
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
                  </div>
                  <div className="form-group">
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
                  </div>
                  <div className="form-group">
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
                    {showChildAge && (
                      <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
                        Child&apos;s age:{' '}
                        <strong>{formatAge(debouncedClientDOB)}</strong>
                      </p>
                    )}
                  </div>
                  <div className="form-group">
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
                  </div>
                  <div className="form-group">
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
                    <span className="form-helper">Alternate contact number (e.g., caregiver, family member)</span>
                  </div>
                  <div className="form-group">
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
                  <div className="form-group">
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
                      <div className="form-group">
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

                {/* Paid-caregiver screening */}
                <div className={styles.sectionDivider} />
                <h3 className={styles.subSectionTitle}>One more question</h3>

                <div className={styles.formGridSingle}>
                  <div className="form-group">
                    <label htmlFor="seekingPaidCaregiver" className="form-label">
                      Are you applying to be your child&apos;s paid caregiver? *
                    </label>
                    <p
                      style={{
                        margin: '0.25rem 0 0.5rem',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        color: '#4b5563',
                      }}
                    >
                      Your child&apos;s GAPP care (nursing or personal care) is the
                      same whether or not a parent is paid to provide it. Being a paid
                      family caregiver is a separate, limited option: it covers
                      personal care only, your child must medically qualify for GAPP,
                      and it is{' '}
                      <strong>
                        not available for autism, behavioral, or developmental needs
                      </strong>
                      . If you are unsure, choose No. It will not affect your
                      child&apos;s application.
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
                  </div>

                  {formData.seekingPaidCaregiver === 'yes' && (
                    <>
                      <div className="form-group">
                        <label htmlFor="careNeeds" className="form-label">
                          What does your child mainly need help with at home? *
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

                      {!isPaidBehavioralBlock &&
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

                      {formData.programInterest === 'gapp' &&
                        formData.careNeeds === 'personal' &&
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
                    </>
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
