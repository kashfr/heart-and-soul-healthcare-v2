import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Heart, 
  Target, 
  Eye, 
  Award, 
  Users, 
  Shield, 
  Clock,
  Star,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'About Us | Heart and Soul Healthcare',
  description: 'Learn about Heart and Soul Healthcare - our mission, values, and commitment to providing exceptional home health care services throughout Georgia.',
};

const values = [
  {
    icon: Heart,
    title: 'Compassion',
    description: 'We approach every interaction with genuine empathy and understanding, treating each client as family.',
  },
  {
    icon: Shield,
    title: 'Integrity',
    description: 'We uphold the highest ethical standards in all our practices, ensuring transparency and trustworthiness.',
  },
  {
    icon: Star,
    title: 'Excellence',
    description: 'We strive for excellence in every aspect of care, continuously improving our services and practices.',
  },
  {
    icon: Users,
    title: 'Collaboration',
    description: 'We work closely with families, healthcare providers, and communities to deliver coordinated care.',
  },
];

const credentials = [
  'State of Georgia Licensed Home Health Agency',
  'Medicaid Certified Provider',
  'GAPP, NOW/COMP, ICWP, and EDWP Approved',
  'Experienced and Trained Healthcare Professionals',
  'Background-Checked and Certified Caregivers',
  'Continuous Quality Improvement Programs',
];

export default function AboutPage() {
  return (
    <div className={styles.aboutPage}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderText}>ABOUT</span>
          </div>
          <div className={styles.heroOverlay} />
        </div>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.heroLabel}>Our Story</span>
            <h1>About Heart & Soul Healthcare</h1>
            <p className={styles.heroSubtitle}>
              Dedicated to enhancing lives through compassionate, professional 
              home health care services throughout Georgia.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className={`section ${styles.missionSection}`}>
        <div className="container">
          <div className={styles.missionGrid}>
            <div className={styles.missionCard}>
              <div className={styles.missionIcon}>
                <Target size={32} />
              </div>
              <h3>Our Mission</h3>
              <p>
                To provide exceptional, compassionate home health care services that 
                empower individuals to live with dignity and independence in their 
                homes and communities. We are committed to enhancing quality of life 
                through personalized care, professional excellence, and genuine 
                partnerships with the families we serve.
              </p>
            </div>
            <div className={styles.missionCard}>
              <div className={styles.missionIcon}>
                <Eye size={32} />
              </div>
              <h3>Our Vision</h3>
              <p>
                To be Georgia&apos;s most trusted home health care provider, recognized 
                for our unwavering commitment to quality, compassion, and innovation 
                in care delivery. We envision a future where every individual has 
                access to the support they need to thrive in their preferred 
                environment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Company Story */}
      <section className={`section bg-light ${styles.storySection}`}>
        <div className="container">
          <div className={styles.storyGrid}>
            <div className={styles.storyImage}>
              <Image
                src="/images/company-story.png"
                alt="Compassionate caregiver holding hands with a client in their home"
                fill
                style={{ objectFit: 'cover' }}
                className={styles.storyImg}
              />
            </div>
            <div className={styles.storyContent}>
              <span className={styles.sectionLabel}>Our Journey</span>
              <h2>Built on Care, Driven by Purpose</h2>
              <p>
                Heart and Soul Healthcare was founded with a simple yet powerful 
                belief: that everyone deserves access to quality health care in the 
                comfort and familiarity of their own home. What began as a small 
                team of dedicated healthcare professionals has grown into a 
                comprehensive home health agency serving families across Georgia.
              </p>
              <p>
                Over the years, we have remained true to our founding principles, 
                never losing sight of the individuals and families at the heart of 
                everything we do. Our growth has been guided not by ambition alone, 
                but by the genuine need to extend our care to more people who can 
                benefit from our services.
              </p>
              <p>
                Today, we are proud to serve hundreds of clients through various 
                programs, with a team of skilled professionals who share our 
                commitment to excellence and compassion in care.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className={`section ${styles.valuesSection}`}>
        <div className="container">
          <div className="section-header">
            <span className={styles.sectionLabel}>What We Stand For</span>
            <h2>Our Core Values</h2>
            <p>
              These principles guide every decision we make and every interaction 
              we have with our clients, their families, and our community.
            </p>
          </div>
          <div className={styles.valuesGrid}>
            {values.map((value, index) => (
              <div key={index} className={styles.valueCard}>
                <div className={styles.valueIcon}>
                  <value.icon size={28} />
                </div>
                <h4>{value.title}</h4>
                <p>{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credentials */}
      <section className={`section bg-primary ${styles.credentialsSection}`}>
        <div className="container">
          <div className={styles.credentialsGrid}>
            <div className={styles.credentialsContent}>
              <span className={styles.sectionLabelLight}>Our Credentials</span>
              <h2>Committed to Quality & Compliance</h2>
              <p>
                Heart and Soul Healthcare maintains the highest standards of 
                professional credentialing and regulatory compliance to ensure 
                the safety and well-being of our clients.
              </p>
            </div>
            <div className={styles.credentialsList}>
              {credentials.map((credential, index) => (
                <div key={index} className={styles.credentialItem}>
                  <CheckCircle size={20} />
                  <span>{credential}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className={`section ${styles.teamSection}`}>
        <div className="container">
          <div className="section-header">
            <span className={styles.sectionLabel}>Our People</span>
            <h2>Meet Our Team</h2>
            <p>
              Our dedicated team of healthcare professionals brings expertise, 
              compassion, and commitment to every client interaction.
            </p>
          </div>
          <div className={styles.teamGrid}>
            {[1, 2, 3, 4].map((_, index) => (
              <div key={index} className={styles.teamCard}>
                <div className={styles.teamImagePlaceholder}>
                  <Users size={32} />
                </div>
                <h4>Team Member</h4>
                <span className={styles.teamRole}>Position Title</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`section bg-light ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaContent}>
            <div className={styles.ctaText}>
              <h2>Join Our Mission</h2>
              <p>
                Whether you&apos;re seeking care for yourself or a loved one, or 
                interested in joining our team, we would love to hear from you.
              </p>
            </div>
            <div className={styles.ctaActions}>
              <Link href="/referral" className="btn btn-primary btn-lg">
                Make a Referral <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
