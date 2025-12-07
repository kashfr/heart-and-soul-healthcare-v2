import Link from 'next/link';
import Image from 'next/image';
import { 
  Heart, 
  Shield, 
  Users, 
  Clock, 
  Award, 
  ArrowRight,
  Baby,
  Brain,
  Accessibility,
  UserCheck,
  Star,
  Phone
} from 'lucide-react';
import Carousel from '@/components/Carousel';
import ProgramCard from '@/components/ProgramCard';
import styles from './page.module.css';

const programs = [
  {
    icon: Baby,
    title: 'Georgia Pediatric Program',
    subtitle: 'GAPP',
    description: 'Skilled nursing and support services for medically fragile children under 21 years, providing care in their homes as an alternative to facility placement.',
    href: '/programs/gapp',
    accentColor: 'teal' as const,
  },
  {
    icon: Brain,
    title: 'NOW/COMP Waiver',
    subtitle: 'DEVELOPMENTAL DISABILITIES',
    description: 'Person-centered support for individuals with intellectual and developmental disabilities, promoting meaningful community integration.',
    href: '/programs/now-comp',
    accentColor: 'gold' as const,
  },
  {
    icon: Accessibility,
    title: 'Independent Care Waiver',
    subtitle: 'ICWP',
    description: 'Comprehensive services for adults with physical impairments or traumatic brain injuries to achieve dignified, independent lives.',
    href: '/programs/icwp',
    accentColor: 'sage' as const,
  },
  {
    icon: UserCheck,
    title: 'EDWP/CCSP/SOURCE',
    subtitle: 'ELDERLY & DISABLED',
    description: 'Supporting elderly and disabled individuals in maintaining independence, safety, and quality of life in their own homes.',
    href: '/programs/edwp',
    accentColor: 'primary' as const,
  },
];

const values = [
  {
    icon: Heart,
    title: 'Compassionate Care',
    description: 'We treat every client with dignity, respect, and genuine compassion, understanding the unique needs of each individual.',
  },
  {
    icon: Shield,
    title: 'Professional Excellence',
    description: 'Our team of qualified professionals delivers the highest standard of care with expertise and dedication.',
  },
  {
    icon: Users,
    title: 'Family-Centered',
    description: 'We partner with families to create personalized care plans that support the entire household.',
  },
  {
    icon: Clock,
    title: '24/7 Support',
    description: 'Around-the-clock availability ensures peace of mind for clients and their families.',
  },
];

const stats = [
  { number: '15+', label: 'Years of Service' },
  { number: '1,000+', label: 'Families Served' },
  { number: '100%', label: 'Commitment' },
  { number: '24/7', label: 'Care Available' },
];

export default function Home() {
  return (
    <>
      {/* Hero Carousel */}
      <Carousel />

      {/* Trust Indicators */}
      <section className={styles.trustSection}>
        <div className="container">
          <div className={styles.trustGrid}>
            {stats.map((stat, index) => (
              <div key={index} className={styles.trustItem}>
                <span className={styles.trustNumber}>{stat.number}</span>
                <span className={styles.trustLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section className={`section ${styles.introSection}`}>
        <div className="container">
          <div className={styles.introGrid}>
            <div className={styles.introContent}>
              <span className={styles.sectionLabel}>Welcome to Heart & Soul Healthcare</span>
              <h2>Dedicated to Enhancing Lives Through Professional Home Care</h2>
              <p>
                At Heart and Soul Healthcare, we believe that everyone deserves access to quality 
                healthcare in the comfort and familiarity of their own home. Our dedicated team of 
                professionals is committed to providing exceptional care services that promote 
                independence, dignity, and an enhanced quality of life.
              </p>
              <p>
                We specialize in serving individuals across Georgia through various waiver programs, 
                ensuring that our clients receive the personalized support they need to thrive in 
                their communities.
              </p>
              <div className={styles.introActions}>
                <Link href="/about" className="btn btn-primary">
                  Learn About Us <ArrowRight size={18} />
                </Link>
                <Link href="/referral" className="btn btn-secondary">
                  Make a Referral
                </Link>
              </div>
            </div>
            <div className={styles.introImage}>
              <div className={styles.imageWrapper}>
                <Image
                  src="/images/caring-professional.png"
                  alt="Caring professional providing compassionate home care"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <div className={styles.experienceBadge}>
                <Award size={32} />
                <div>
                  <span className={styles.badgeNumber}>15+</span>
                  <span className={styles.badgeText}>Years Experience</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section className={`section bg-light ${styles.programsSection}`}>
        <div className="container">
          <div className="section-header">
            <span className={styles.sectionLabel}>What We Offer</span>
            <h2>Our Care Programs</h2>
            <p>
              We provide comprehensive home health services through Georgia&apos;s waiver 
              programs, designed to meet the unique needs of each individual we serve.
            </p>
          </div>
          <div className={styles.programsGrid}>
            {programs.map((program, index) => (
              <ProgramCard key={index} {...program} />
            ))}
          </div>
          <div className={styles.programsCta}>
            <Link href="/programs/other" className="btn btn-secondary">
              View Other Programs <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className={`section ${styles.valuesSection}`}>
        <div className="container">
          <div className={styles.valuesGrid}>
            <div className={styles.valuesContent}>
              <span className={styles.sectionLabel}>Why Choose Us</span>
              <h2>Committed to Excellence in Care</h2>
              <p>
                At Heart and Soul Healthcare, our commitment goes beyond providing services. 
                We build lasting relationships with our clients and their families, ensuring 
                peace of mind and improved quality of life.
              </p>
              <div className={styles.valuesList}>
                {values.map((value, index) => (
                  <div key={index} className={styles.valueItem}>
                    <div className={styles.valueIcon}>
                      <value.icon size={24} />
                    </div>
                    <div>
                      <h4>{value.title}</h4>
                      <p>{value.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.valuesImage}>
              <div className={styles.imageWrapper}>
                <Image
                  src="/images/care-team-v2.png"
                  alt="Dedicated heart and soul healthcare team"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section */}
      <section className={`section bg-gradient ${styles.testimonialSection}`}>
        <div className="container">
          <div className={styles.testimonialContent}>
            <div className={styles.stars}>
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={24} fill="currentColor" />
              ))}
            </div>
            <blockquote className={styles.quote}>
              &ldquo;Heart and Soul Healthcare has been a blessing for our family. The caregivers 
              are not only professional but genuinely caring. They treat my mother with such 
              dignity and respect. We couldn&apos;t be more grateful for their exceptional service.&rdquo;
            </blockquote>
            <div className={styles.testimonialAuthor}>
              <div className={styles.authorAvatar}>
                <span>JD</span>
              </div>
              <div>
                <span className={styles.authorName}>Family Member</span>
                <span className={styles.authorRole}>Client&apos;s Daughter</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`section ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaContent}>
            <div className={styles.ctaText}>
              <h2>Ready to Get Started?</h2>
              <p>
                We&apos;re here to help you or your loved ones receive the quality care they deserve. 
                Contact us today for a consultation or to make a referral.
              </p>
            </div>
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
    </>
  );
}
