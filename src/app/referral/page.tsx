'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  });

  const isSelfReferral = formData.referralSource === 'self';

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
    } else if (step === 2) {
      if (!formData.referralSource) missing.push('Referral Source');
      if (!isSelfReferral && formData.referralSource && !formData.referrerName) missing.push('Referrer Name');
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
    if (!isStepValid()) {
      e.preventDefault();
      setShowValidation(true);
      return;
    }
    setShowValidation(false);
    handleSubmit(e);
  };

  // Format phone number as user types: (XXX) XXX-XXXX
  const formatPhoneNumber = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length < 3) return `(${digits}`;
    if (digits.length === 3) return `(${digits}) `;
    if (digits.length < 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length === 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}-`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

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
        return formData.referralSource && (isSelfReferral || formData.referrerName);
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
    const requiredStep2 = ['referralSource'];
    if (step === 1 && requiredStep1.includes(fieldName)) return !value;
    if (step === 2 && requiredStep2.includes(fieldName)) return !value;
    if (step === 2 && fieldName === 'referrerName' && !isSelfReferral && formData.referralSource) return !value;
    return false;
  };

  // Get counties for the selected program
  const counties = formData.programInterest ? getCountiesForProgram(formData.programInterest) : null;

  if (isSubmitted) {
    return (
      <div className={styles.referralPage}>
        <section className={styles.hero}>
          <div className={styles.heroBackground}>
            <div className={styles.placeholderImage}>
              <span className={styles.placeholderText}>REFERRAL</span>
            </div>
            <div className={styles.heroOverlay} />
          </div>
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
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderText}>REFERRAL</span>
          </div>
          <div className={styles.heroOverlay} />
        </div>
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
                    {formData.programInterest ? (
                      <>
                        <div className={styles.programDescriptionHeader}>
                          <Info size={16} />
                          <span>About this program</span>
                        </div>
                        <p>{programs.find(p => p.value === formData.programInterest)?.description}</p>
                      </>
                    ) : (
                      <p className={styles.programDescriptionPlaceholder}>
                        Select a program to see a brief description
                      </p>
                    )}
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
                      className="form-input"
                      placeholder="email@example.com"
                      value={formData.clientEmail}
                      onChange={handleChange}
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
                    className={`btn btn-gold btn-lg ${isStepValid() ? styles.btnReady : styles.btnFaded}`}
                    onClick={handleAttemptSubmit}
                    disabled={isSubmitting}
                  >
                    <Send size={20} /> {isSubmitting ? 'Submitting...' : 'Submit Referral'}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
