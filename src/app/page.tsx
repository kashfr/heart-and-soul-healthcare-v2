import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Heart and Soul Healthcare | Home Health Care Services in Georgia',
  description: 'Georgia home health care serving Atlanta, Fulton, DeKalb, Cobb & Gwinnett counties. GAPP, NOW/COMP, ICWP & EDWP Medicaid waiver programs. Make a referral today.',
  alternates: { canonical: 'https://www.heartandsoulhc.org' },
  openGraph: {
    title: 'Heart and Soul Healthcare | Home Health Care Services in Georgia',
    description: 'Georgia home health care serving Atlanta and surrounding counties. GAPP, NOW/COMP, ICWP & EDWP Medicaid waiver programs.',
    url: 'https://www.heartandsoulhc.org',
  },
};
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
import {
  AnimatedTrustGrid,
  AnimatedIntroContent,
  AnimatedIntroImage,
  AnimatedBadge,
  AnimatedProgramsGrid,
  AnimatedProgramItem,
  AnimatedValuesContent,
  AnimatedValuesImage,
  AnimatedValuesList,
  AnimatedValueItem,
  AnimatedTestimonial,
  AnimatedCTA,
} from '@/components/animations/HomepageAnimations';
import { ScrollReveal, TextReveal, SectionDivider } from '@/components/animations';
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
    title: 'EDWP (CCSP & SOURCE)',
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

const faqs = [
  {
    question: 'What home health care services does Heart and Soul Healthcare provide in Georgia?',
    answer: 'We provide skilled nursing, personal support, community living supports, respite care, and behavioral support services through Georgia\'s Medicaid waiver programs — GAPP, NOW/COMP, ICWP, and EDWP. Our services help individuals stay safely in their homes rather than entering institutional care.',
  },
  {
    question: 'What counties in Georgia does Heart and Soul Healthcare serve?',
    answer: 'We serve families across metro Atlanta and surrounding areas, including Fulton, DeKalb, Cobb, Clayton, Henry, Gwinnett, Fayette, Douglas, Forsyth, Rockdale, Cherokee, Paulding, Bartow, Newton, Spalding, Coweta, Carroll, Barrow, Gilmer, and Pickens counties.',
  },
  {
    question: 'How do I apply for Medicaid waiver programs like GAPP or NOW/COMP in Georgia?',
    answer: 'Start by enrolling in Georgia Medicaid through the Georgia Gateway portal (gateway.ga.gov) or by calling 1-800-282-4536. Once enrolled, contact the appropriate agency — DBHDD for NOW/COMP and ICWP, or your local Area Agency on Aging for EDWP — to begin the waiver application process. Our team can guide you through every step.',
  },
  {
    question: 'Does Heart and Soul Healthcare accept Medicaid?',
    answer: 'Yes. We are a Georgia Medicaid-enrolled provider and deliver services through all four major waiver programs: GAPP (children), NOW/COMP (intellectual/developmental disabilities), ICWP (physical disabilities and TBI), and EDWP (elderly and disabled adults). We also offer private pay options.',
  },
  {
    question: 'How do I make a referral to Heart and Soul Healthcare?',
    answer: 'You can submit a referral online through our referral form, call us at (678) 644-0337, or ask your physician, case manager, or support coordinator to refer directly. We accept referrals from families, healthcare providers, hospitals, and self-referrals.',
  },
  {
    question: 'What is the difference between NOW and COMP waivers in Georgia?',
    answer: 'Both serve individuals with intellectual and developmental disabilities, but COMP is for those with higher support needs requiring more daily care hours, while NOW serves individuals who need moderate support and are working toward greater independence. Both are administered by DBHDD.',
  },
];

const serviceCounties = {
  primary: ['Fulton', 'DeKalb', 'Cobb', 'Clayton', 'Henry', 'Gwinnett', 'Fayette', 'Douglas', 'Forsyth', 'Rockdale'],
  extended: ['Cherokee', 'Paulding', 'Bartow', 'Newton', 'Spalding', 'Coweta', 'Carroll', 'Barrow', 'Gilmer', 'Pickens'],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'HomeHealthCareService',
  name: 'Heart and Soul Healthcare',
  url: 'https://www.heartandsoulhc.org',
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Georgia Home Health Care Programs',
    itemListElement: [
      { '@type': 'OfferCatalog', name: 'GAPP — Georgia Pediatric Program', description: 'Skilled nursing for medically fragile children under 21' },
      { '@type': 'OfferCatalog', name: 'NOW/COMP Waiver', description: 'Support for individuals with intellectual and developmental disabilities' },
      { '@type': 'OfferCatalog', name: 'ICWP — Independent Care Waiver Program', description: 'Services for adults 21-64 with physical disabilities or TBI' },
      { '@type': 'OfferCatalog', name: 'EDWP — Elderly & Disabled Waiver Program', description: 'Home-based care for elderly and disabled adults through CCSP and SOURCE' },
    ],
  },
};

export default function Home() {
  return (
    <>
      {/* SEO structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />

      {/* SEO h1 — visually integrated with carousel */}
      <h1 className="sr-only">Home Health Care Services in Georgia — Heart and Soul Healthcare</h1>

      {/* Hero Carousel */}
      <Carousel />

      {/* Trust Indicators */}
      <section className={styles.trustSection}>
        <div className="container">
          <AnimatedTrustGrid
            stats={stats}
            className={styles.trustGrid}
            itemClassName={styles.trustItem}
            numberClassName={styles.trustNumber}
            labelClassName={styles.trustLabel}
          />
        </div>
      </section>

      <SectionDivider from="var(--color-primary)" to="#ffffff" height={60} />

      {/* Intro Section */}
      <section className={`section ${styles.introSection}`}>
        <div className="container">
          <div className={styles.introGrid}>
            <AnimatedIntroContent className={styles.introContent}>
              <span className={styles.sectionLabel}>Welcome to Heart & Soul Healthcare</span>
              <TextReveal as="h2">Dedicated to Enhancing Lives Through Professional Home Care</TextReveal>
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
            </AnimatedIntroContent>
            <AnimatedIntroImage className={styles.introImage}>
              <div className={styles.imageWrapper}>
                <Image
                  src="/images/caring-professional.png"
                  alt="Caring professional providing compassionate home care"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <AnimatedBadge className={styles.experienceBadge}>
                <Award size={32} />
                <div>
                  <span className={styles.badgeNumber}>15+</span>
                  <span className={styles.badgeText}>Years Experience</span>
                </div>
              </AnimatedBadge>
            </AnimatedIntroImage>
          </div>
        </div>
      </section>

      <SectionDivider from="#ffffff" to="var(--color-gray-50)" height={60} />

      {/* Programs Section */}
      <section className={`section bg-light ${styles.programsSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={styles.sectionLabel}>What We Offer</span>
              <TextReveal as="h2">Our Care Programs</TextReveal>
              <p>
                We provide comprehensive home health services through Georgia&apos;s waiver
                programs, designed to meet the unique needs of each individual we serve.
              </p>
            </div>
          </ScrollReveal>
          <AnimatedProgramsGrid className={styles.programsGrid}>
            {programs.map((program, index) => (
              <AnimatedProgramItem key={index}>
                <ProgramCard {...program} />
              </AnimatedProgramItem>
            ))}
          </AnimatedProgramsGrid>
          <ScrollReveal direction="up" delay={0.4}>
            <div className={styles.programsCta}>
              <Link href="/programs/other" className="btn btn-secondary">
                View Other Programs <ArrowRight size={18} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <SectionDivider from="var(--color-gray-50)" to="#ffffff" height={60} />

      {/* Why Choose Us */}
      <section className={`section ${styles.valuesSection}`}>
        <div className="container">
          <div className={styles.valuesGrid}>
            <AnimatedValuesContent className={styles.valuesContent}>
              <span className={styles.sectionLabel}>Why Choose Us</span>
              <TextReveal as="h2">Committed to Excellence in Care</TextReveal>
              <p>
                At Heart and Soul Healthcare, our commitment goes beyond providing services.
                We build lasting relationships with our clients and their families, ensuring
                peace of mind and improved quality of life.
              </p>
              <AnimatedValuesList className={styles.valuesList}>
                {values.map((value, index) => (
                  <AnimatedValueItem key={index} className={styles.valueItem}>
                    <div className={styles.valueIcon}>
                      <value.icon size={24} />
                    </div>
                    <div>
                      <h4>{value.title}</h4>
                      <p>{value.description}</p>
                    </div>
                  </AnimatedValueItem>
                ))}
              </AnimatedValuesList>
            </AnimatedValuesContent>
            <AnimatedValuesImage className={styles.valuesImage}>
              <div className={styles.imageWrapper}>
                <Image
                  src="/images/care-team-v2.png"
                  alt="Dedicated heart and soul healthcare team"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </AnimatedValuesImage>
          </div>
        </div>
      </section>

      <SectionDivider from="#ffffff" to="var(--color-primary)" height={60} />

      {/* Testimonial Section */}
      <section className={`section bg-gradient ${styles.testimonialSection}`}>
        <div className="container">
          <AnimatedTestimonial className={styles.testimonialContent}>
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
          </AnimatedTestimonial>
        </div>
      </section>

      <SectionDivider from="var(--color-primary)" to="#ffffff" height={60} />

      {/* FAQ Section */}
      <section className={`section ${styles.faqSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={styles.sectionLabel}>Common Questions</span>
              <TextReveal as="h2">Frequently Asked Questions</TextReveal>
              <p>Answers to the most common questions about home health care and Medicaid waiver programs in Georgia.</p>
            </div>
          </ScrollReveal>
          <div className={styles.faqGrid}>
            {faqs.map((faq, index) => (
              <ScrollReveal key={index} direction="up" delay={index * 0.08}>
                <details className={styles.faqItem}>
                  <summary className={styles.faqQuestion}>{faq.question}</summary>
                  <p className={styles.faqAnswer}>{faq.answer}</p>
                </details>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider from="#ffffff" to="var(--color-gray-50)" height={60} />

      {/* Service Areas Section */}
      <section className={`section ${styles.serviceAreasSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={styles.sectionLabel}>Where We Serve</span>
              <TextReveal as="h2">Home Health Care Across Metro Atlanta &amp; Georgia</TextReveal>
              <p>We provide in-home care services across 20 counties in Georgia, centered around the greater Atlanta metropolitan area.</p>
            </div>
          </ScrollReveal>
          <div className={styles.countyGroups}>
            <ScrollReveal direction="left" delay={0.1}>
              <div className={styles.countyGroup}>
                <h3>Primary Service Area</h3>
                <div className={styles.countyTags}>
                  {serviceCounties.primary.map((county) => (
                    <span key={county} className={styles.countyTag}>{county} County</span>
                  ))}
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <div className={styles.countyGroup}>
                <h3>Extended Service Area</h3>
                <div className={styles.countyTags}>
                  {serviceCounties.extended.map((county) => (
                    <span key={county} className={`${styles.countyTag} ${styles.countyTagExtended}`}>{county} County</span>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <SectionDivider from="var(--color-gray-50)" to="var(--color-gray-50)" height={60} />

      {/* CTA Section */}
      <section className={`section ${styles.ctaSection}`}>
        <div className="container">
          <AnimatedCTA className={styles.ctaContent}>
            <div className={styles.ctaText}>
              <TextReveal as="h2">Ready to Get Started?</TextReveal>
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
          </AnimatedCTA>
        </div>
      </section>
    </>
  );
}
