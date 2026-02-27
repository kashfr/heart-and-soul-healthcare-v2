import { Metadata } from 'next';
import Link from 'next/link';
import { 
  HandHeart, 
  ArrowRight, 
  DollarSign, 
  Shield, 
  Building2, 
  Phone,
  Users,
  Star,
  CheckCircle
} from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Other Programs & Partnerships | Heart and Soul Healthcare',
  description: 'Explore additional services including private pay options, American Veterans Care Connection (AVCC), and Bobby Dodd Institute partnerships.',
};

const programs = [
  {
    id: 'private-pay',
    icon: DollarSign,
    title: 'Private Pay Services',
    description: 'Flexible home health care services for clients who prefer to pay out-of-pocket or whose needs are not covered by traditional waiver programs.',
    features: [
      'Personalized care plans tailored to individual needs',
      'Flexible scheduling options',
      'No insurance requirements or restrictions',
      'Same high-quality professional caregivers',
      'Comprehensive range of services available',
      'Quick start with minimal paperwork',
    ],
  },
  {
    id: 'avcc',
    icon: Shield,
    title: 'American Veterans Care Connection (AVCC)',
    description: 'Proud partnership providing specialized home care services to veterans who have served our country, ensuring they receive the care and respect they deserve.',
    features: [
      'Services specifically designed for veterans',
      'Understanding of veteran-specific health needs',
      'Coordination with VA benefits and services',
      'Compassionate caregivers trained in veteran care',
      'Support for service-connected disabilities',
      'Assistance navigating veteran resources',
    ],
  },
  {
    id: 'bobby-dodd',
    icon: Building2,
    title: 'Bobby Dodd Institute Partnership',
    description: 'Collaborative partnership with the Bobby Dodd Institute to provide comprehensive support services for individuals with disabilities, promoting independence and community integration.',
    features: [
      'Vocational and employment support services',
      'Independent living skills training',
      'Community integration programs',
      'Disability-focused care coordination',
      'Transition services and support',
      'Inclusive community activities',
    ],
  },
];

export default function OtherProgramsPage() {
  return (
    <div className={styles.otherPage}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderText}>PARTNERS</span>
          </div>
          <div className={styles.heroOverlay} />
        </div>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroIcon}>
              <HandHeart size={48} />
            </div>
            <span className={styles.heroLabel}>Additional Services</span>
            <h1>Other Programs & Partnerships</h1>
            <p className={styles.heroSubtitle}>
              Beyond our waiver programs, we offer additional services and partnerships 
              to ensure everyone has access to quality home health care.
            </p>
          </div>
        </div>
      </section>

      {/* Programs Grid */}
      <section className={`section ${styles.programsSection}`}>
        <div className="container">
          <div className={styles.programsGrid}>
            {programs.map((program) => (
              <div key={program.id} className={styles.programCard}>
                <div className={styles.programHeader}>
                  <div className={styles.programIcon}>
                    <program.icon size={32} />
                  </div>
                  <h2>{program.title}</h2>
                </div>
                <p className={styles.programDescription}>{program.description}</p>
                <ul className={styles.featuresList}>
                  {program.features.map((feature, index) => (
                    <li key={index}>
                      <CheckCircle size={18} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/contact" className="btn btn-primary">
                  Learn More <ArrowRight size={18} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Expansion Notice */}
      <section className={`section bg-light ${styles.expansionSection}`}>
        <div className="container">
          <div className={styles.expansionContent}>
            <div className={styles.expansionIcon}>
              <Star size={48} />
            </div>
            <h2>Growing to Serve You Better</h2>
            <p>
              Heart and Soul Healthcare is continuously expanding our partnerships and 
              service offerings to meet the evolving needs of our community. We are 
              actively seeking new collaborative opportunities with organizations that 
              share our commitment to providing exceptional home health care.
            </p>
            <p>
              If your organization is interested in partnering with us to extend care 
              to more individuals in need, we would love to hear from you.
            </p>
            <Link href="/contact" className="btn btn-secondary">
              <Users size={20} /> Partner With Us
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`section bg-gradient ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaContent}>
            <h2>Questions About Our Services?</h2>
            <p>
              Our team is ready to help you explore all available options and find 
              the right care solution for you or your loved one.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/referral" className="btn btn-gold btn-lg">
                Make a Referral <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                <Phone size={20} /> Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
