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
  AlertCircle
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { processReferralSubmission } from '@/app/actions';
import styles from './page.module.css';

const programs = [
  { value: 'gapp', label: 'GAPP - Georgia Pediatric Program' },
  { value: 'now-comp', label: 'NOW/COMP Waiver' },
  { value: 'icwp', label: 'ICWP - Independent Care Waiver' },
  { value: 'edwp', label: 'EDWP/CCSP/SOURCE' },
  { value: 'private-pay', label: 'Private Pay' },
  { value: 'other', label: 'Other / Not Sure' },
];

const referralSources = [
  { value: 'hospital', label: 'Hospital / Medical Facility' },
  { value: 'physician', label: 'Physician / Healthcare Provider' },
  { value: 'case-manager', label: 'Case Manager / Support Coordinator' },
  { value: 'family', label: 'Family Member' },
  { value: 'self', label: 'Self-Referral' },
  { value: 'other', label: 'Other' },
];

export default function ReferralPage() {
  const [step, setStep] = useState(1);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    // Client Information
    clientFirstName: '',
    clientLastName: '',
    clientDOB: '',
    clientPhone: '',
    clientEmail: '',
    clientAddress: '',
    clientCity: '',
    clientState: 'GA',
    clientZip: '',
    
    // Program & Insurance
    programInterest: '',
    medicaidNumber: '',
    insuranceProvider: '',
    insuranceNumber: '',
    
    // Referral Source
    referralSource: '',
    referrerName: '',
    referrerPhone: '',
    referrerEmail: '',
    referrerOrganization: '',
    
    // Service Needs
    serviceNeeds: '',
    urgency: 'standard',
    additionalNotes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
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
          email: formData.clientEmail,
          address: formData.clientAddress,
          city: formData.clientCity,
          state: formData.clientState,
          zip: formData.clientZip,
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

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.clientFirstName && formData.clientLastName && formData.clientDOB && formData.clientPhone;
      case 2:
        return formData.programInterest;
      case 3:
        return formData.referralSource && formData.referrerName;
      case 4:
        return formData.serviceNeeds;
      default:
        return true;
    }
  };

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
                      clientFirstName: '', clientLastName: '', clientDOB: '', clientPhone: '',
                      clientEmail: '', clientAddress: '', clientCity: '', clientState: 'GA',
                      clientZip: '', programInterest: '', medicaidNumber: '', insuranceProvider: '',
                      insuranceNumber: '', referralSource: '', referrerName: '', referrerPhone: '',
                      referrerEmail: '', referrerOrganization: '', serviceNeeds: '', urgency: 'standard',
                      additionalNotes: '',
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
                { num: 2, label: 'Program', icon: ClipboardList },
                { num: 3, label: 'Referrer', icon: FileText },
                { num: 4, label: 'Details', icon: Send },
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
              <div className={styles.progressFill} style={{ width: `${((step - 1) / 3) * 100}%` }} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Step 1: Client Information */}
            {step === 1 && (
              <div className={styles.formStep}>
                <h2><User size={28} /> Client Information</h2>
                <p className={styles.stepDescription}>
                  Please provide the basic information about the individual who will be receiving care.
                </p>
                
                <div className={styles.formGrid}>
                  <div className="form-group">
                    <label htmlFor="clientFirstName" className="form-label">First Name *</label>
                    <input
                      type="text"
                      id="clientFirstName"
                      name="clientFirstName"
                      className="form-input"
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
                      className="form-input"
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
                      className="form-input"
                      value={formData.clientDOB}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientPhone" className="form-label">Phone Number *</label>
                    <input
                      type="tel"
                      id="clientPhone"
                      name="clientPhone"
                      className="form-input"
                      placeholder="(XXX) XXX-XXXX"
                      value={formData.clientPhone}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="clientEmail" className="form-label">Email Address</label>
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
                    <input
                      type="text"
                      id="clientState"
                      name="clientState"
                      className="form-input"
                      value={formData.clientState}
                      onChange={handleChange}
                      readOnly
                    />
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

            {/* Step 2: Program & Insurance */}
            {step === 2 && (
              <div className={styles.formStep}>
                <h2><ClipboardList size={28} /> Program & Insurance</h2>
                <p className={styles.stepDescription}>
                  Select the program of interest and provide insurance information if available.
                </p>
                
                <div className={styles.formGridSingle}>
                  <div className="form-group">
                    <label htmlFor="programInterest" className="form-label">Program of Interest *</label>
                    <select
                      id="programInterest"
                      name="programInterest"
                      className="form-select"
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
                  <div className="form-group">
                    <label htmlFor="medicaidNumber" className="form-label">Medicaid Number (if applicable)</label>
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
                    <label htmlFor="insuranceNumber" className="form-label">Insurance Policy Number</label>
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
              </div>
            )}

            {/* Step 3: Referral Source */}
            {step === 3 && (
              <div className={styles.formStep}>
                <h2><FileText size={28} /> Referral Source Information</h2>
                <p className={styles.stepDescription}>
                  Please provide information about who is making this referral.
                </p>
                
                <div className={styles.formGridSingle}>
                  <div className="form-group">
                    <label htmlFor="referralSource" className="form-label">Referral Source *</label>
                    <select
                      id="referralSource"
                      name="referralSource"
                      className="form-select"
                      value={formData.referralSource}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select source type</option>
                      {referralSources.map((source) => (
                        <option key={source.value} value={source.value}>{source.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="referrerName" className="form-label">Your Name *</label>
                    <input
                      type="text"
                      id="referrerName"
                      name="referrerName"
                      className="form-input"
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
                    <label htmlFor="referrerOrganization" className="form-label">Organization Name</label>
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
                </div>
              </div>
            )}

            {/* Step 4: Service Needs */}
            {step === 4 && (
              <div className={styles.formStep}>
                <h2><Send size={28} /> Service Needs & Details</h2>
                <p className={styles.stepDescription}>
                  Describe the care needs and any additional information that will help us serve the client.
                </p>
                
                <div className={styles.formGridSingle}>
                  <div className="form-group">
                    <label htmlFor="serviceNeeds" className="form-label">Description of Service Needs *</label>
                    <textarea
                      id="serviceNeeds"
                      name="serviceNeeds"
                      className="form-textarea"
                      placeholder="Please describe the care needs, diagnoses, current care situation, and any specific requirements..."
                      rows={5}
                      value={formData.serviceNeeds}
                      onChange={handleChange}
                      required
                    />
                  </div>
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

            {/* Form Navigation */}
            <div className={styles.formNav}>
              {step > 1 && (
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  Previous Step
                </button>
              )}
              <div className={styles.navSpacer} />
              {step < 4 ? (
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={nextStep}
                  disabled={!isStepValid()}
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
                    type="submit" 
                    className="btn btn-gold btn-lg"
                    disabled={!isStepValid() || isSubmitting}
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
