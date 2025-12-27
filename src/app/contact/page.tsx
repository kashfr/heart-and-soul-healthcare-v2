'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Send,
  MessageSquare,
  ArrowRight,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { processContactSubmission } from '@/app/actions';
import ServiceAreaMap from '@/components/ServiceAreaMap';
import styles from './page.module.css';

const contactInfo = [
  {
    icon: Phone,
    title: 'Phone',
    primary: '(678) 644-0337',
    secondary: 'Mon - Fri: 9:00 AM - 5:00 PM',
  },
  {
    icon: Mail,
    title: 'Email',
    primary: 'info@heartandsoulhc.org',
    secondary: 'We respond within 24 hours',
  },
  {
    icon: MapPin,
    title: 'Address',
    primary: '1372 Peachtree St NE',
    secondary: 'Atlanta, GA 30309',
  },
  {
    icon: Clock,
    title: 'Office Hours',
    primary: 'Monday - Friday',
    secondary: '10:00 AM - 3:00 PM EST',
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // 1. Save to Firestore
      await addDoc(collection(db, 'contactSubmissions'), {
        ...formData,
        submittedAt: serverTimestamp(),
        status: 'new',
      });

      // 2. Send Email Notification & Add to CRM
      await processContactSubmission(formData);

      setIsSubmitted(true);
    } catch (err) {
      console.error('Error submitting form:', err);
      setError('There was an error submitting your message. Please try again or call us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.contactPage}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderText}>CONTACT</span>
          </div>
          <div className={styles.heroOverlay} />
        </div>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.heroLabel}>Get In Touch</span>
            <h1>Contact Us</h1>
            <p className={styles.heroSubtitle}>
              We&apos;re here to answer your questions and help you explore the 
              care options available for you or your loved one.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className={styles.infoSection}>
        <div className="container">
          <div className={styles.infoGrid}>
            {contactInfo.map((info, index) => (
              <div key={index} className={styles.infoCard}>
                <div className={styles.infoIcon}>
                  <info.icon size={24} />
                </div>
                <h4>{info.title}</h4>
                <p className={styles.infoPrimary}>{info.primary}</p>
                <p className={styles.infoSecondary}>{info.secondary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className={`section bg-light ${styles.formSection}`}>
        <div className="container">
          <div className={styles.formGrid}>
            <div className={styles.formInfo}>
              <span className={styles.sectionLabel}>Send Us a Message</span>
              <h2>We&apos;d Love to Hear From You</h2>
              <p>
                Whether you have questions about our services, need guidance on 
                available programs, or want to discuss care options, our team is 
                ready to assist you. Fill out the form and we&apos;ll get back to 
                you as soon as possible.
              </p>
              <div className={styles.formFeatures}>
                <div className={styles.formFeature}>
                  <MessageSquare size={20} />
                  <span>Quick response within 24 hours</span>
                </div>
                <div className={styles.formFeature}>
                  <CheckCircle size={20} />
                  <span>No obligation consultation</span>
                </div>
              </div>
              <div className={styles.referralCta}>
                <p>Looking to make a client referral?</p>
                <Link href="/referral" className="btn btn-primary">
                  Go to Referral Form <ArrowRight size={18} />
                </Link>
              </div>
            </div>

            <div className={styles.formCard}>
              {isSubmitted ? (
                <div className={styles.successMessage}>
                  <div className={styles.successIcon}>
                    <CheckCircle size={48} />
                  </div>
                  <h3>Message Sent!</h3>
                  <p>
                    Thank you for reaching out. We have received your message and 
                    will respond within 24 hours.
                  </p>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => {
                      setIsSubmitted(false);
                      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
                    }}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                  <div className={styles.formRow}>
                    <div className="form-group">
                      <label htmlFor="name" className="form-label">Full Name *</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="form-input"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="email" className="form-label">Email Address *</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        className="form-input"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.formRow}>
                    <div className="form-group">
                      <label htmlFor="phone" className="form-label">Phone Number</label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        className="form-input"
                        placeholder="(XXX) XXX-XXXX"
                        value={formData.phone}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="subject" className="form-label">Subject *</label>
                      <select
                        id="subject"
                        name="subject"
                        className="form-select"
                        value={formData.subject}
                        onChange={handleChange}
                        required
                      >
                        <option value="">Select a subject</option>
                        <option value="General Inquiry">General Inquiry</option>
                        <option value="Services Information">Services Information</option>
                        <option value="Program Questions">Program Questions</option>
                        <option value="Career Opportunities">Career Opportunities</option>
                        <option value="Partnership Inquiry">Partnership Inquiry</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="message" className="form-label">Message *</label>
                    <textarea
                      id="message"
                      name="message"
                      className="form-textarea"
                      placeholder="How can we help you?"
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  {error && (
                    <div className={styles.errorMessage}>
                      <AlertCircle size={20} />
                      <span>{error}</span>
                    </div>
                  )}
                  <button 
                    type="submit" 
                    className="btn btn-primary btn-lg"
                    disabled={isSubmitting}
                  >
                    <Send size={20} /> {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className={styles.mapSection}>
        <div className="container">
          <div className={styles.mapHeader}>
            <h2>Our Service Area</h2>
            <p>Heart and Soul Healthcare proudly serves 20 counties across the metro Atlanta region and beyond.</p>
          </div>
          <ServiceAreaMap apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''} />
        </div>
      </section>
    </div>
  );
}
