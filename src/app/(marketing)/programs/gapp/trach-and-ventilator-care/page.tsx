import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle, Phone, Stethoscope } from 'lucide-react';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/animations';
import { getPostBySlug } from '@/lib/blog';
import { CORE_COUNTIES, EXTENDED_COUNTIES } from '@/lib/serviceArea';
import t from '@/components/ProgramPageTemplate.module.css';
import s from './page.module.css';
import {
  FAQS,
  GUIDE_SLUGS,
  HOME_STEPS,
  META_DESCRIPTION,
  META_TITLE,
  NURSING_SERVICES,
  PAGE_URL,
  PHONE_DISPLAY,
  PHONE_TEL,
  TITLE,
  TRUST_POINTS,
} from './content';

export const metadata: Metadata = {
  title: { absolute: META_TITLE },
  description: META_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    url: PAGE_URL,
    type: 'website',
    images: [{ url: '/images/blog/gapp-nurse-medical-care.png', alt: 'Nurse caring for a child at home overnight with monitoring equipment' }],
  },
};

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: TITLE,
  serviceType: 'Pediatric in-home skilled nursing for tracheostomy and ventilator care',
  description: META_DESCRIPTION,
  url: PAGE_URL,
  provider: {
    '@type': ['MedicalBusiness', 'HomeHealthCareService'],
    name: 'Heart and Soul Healthcare',
    url: 'https://www.heartandsoulhc.org',
    telephone: PHONE_TEL,
  },
  areaServed: [
    { '@type': 'State', name: 'Georgia' },
    ...[...CORE_COUNTIES, ...EXTENDED_COUNTIES].map((c) => ({ '@type': 'AdministrativeArea', name: `${c} County, Georgia` })),
  ],
  audience: {
    '@type': 'PeopleAudience',
    audienceType: 'Children under 21 in Georgia with a tracheostomy or ventilator, enrolled in Georgia Medicaid',
  },
  isRelatedTo: { '@type': 'Service', name: 'Georgia Pediatric Program (GAPP)', url: 'https://www.heartandsoulhc.org/programs/gapp' },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  })),
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.heartandsoulhc.org' },
    { '@type': 'ListItem', position: 2, name: 'Georgia Pediatric Program (GAPP)', item: 'https://www.heartandsoulhc.org/programs/gapp' },
    { '@type': 'ListItem', position: 3, name: 'Trach and Ventilator Care', item: PAGE_URL },
  ],
};

const REFERRAL_HREF = '/referral?program=gapp';

const guides = GUIDE_SLUGS.map(getPostBySlug).filter(
  (post): post is NonNullable<typeof post> => post !== null && post.published,
);

export default function TrachVentCarePage() {
  return (
    <div className={t.programPage}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Hero */}
      <section className={`${t.hero} ${t.teal}`}>
        <div className="container">
          <div className={t.heroContent}>
            <nav aria-label="Breadcrumb" className={s.breadcrumb}>
              <Link href="/programs/gapp">Georgia Pediatric Program (GAPP)</Link>
              <span aria-hidden="true"> / </span>
              <span>Trach and Ventilator Care</span>
            </nav>
            <div className={t.heroTop}>
              <div className={t.heroIcon}>
                <Stethoscope size={26} />
              </div>
              <span className={t.heroLabel}>GAPP Skilled Nursing</span>
            </div>
            <h1>{TITLE}</h1>
            <p className={t.heroSubtitle}>
              Trained nurses who care for your child&apos;s trach, ventilator, and everything that comes with
              them, so your child can live at home and you can rest. Paid through the Georgia Pediatric
              Program (GAPP) at no cost to your family.
            </p>
            <div className={s.heroActions}>
              <Link href={REFERRAL_HREF} className="btn btn-gold btn-lg">
                Start a Referral <ArrowRight size={20} />
              </Link>
              <a href={`tel:${PHONE_TEL}`} className="btn btn-secondary btn-lg">
                <Phone size={20} /> Call {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bringing your child home */}
      <section className="section">
        <div className="container">
          <div className={t.contentGrid}>
            <ScrollReveal direction="left" className={t.contentInfo}>
              <span className={`${t.sectionLabel} ${t.teal}`}>For Families</span>
              <h2>Bringing Your Child Home With a Trach or Ventilator</h2>
              <p className={t.contentText}>
                Going home with a tracheostomy or a ventilator is a big step. Someone needs to be ready
                around the clock to suction, respond to an alarm, or handle an airway emergency, and no
                parent can do that alone every night. In-home skilled nursing through GAPP puts a trained
                nurse at your child&apos;s side for the hours your child is approved for, so your child
                can grow up at home and your family can sleep, work, and be a family again.
              </p>
              <ul className={s.trustList}>
                {TRUST_POINTS.map((p) => (
                  <li key={p}>
                    <CheckCircle size={20} aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={t.contentImage}>
              <div className={t.imageWrapper} style={{ aspectRatio: '4/3' }}>
                <Image
                  src="/images/blog/gapp-nurse-medical-care.png"
                  alt="Pediatric nurse checking a monitor at a sleeping child's bedside during an overnight home nursing shift"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* What our nurses do */}
      <section className="section bg-light">
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Skilled Nursing at Home</span>
              <h2>What Our Nurses Do in Your Home</h2>
              <p>Hands-on care for the trach, the ventilator, and the rest of your child&apos;s medical needs, every shift.</p>
            </div>
          </ScrollReveal>
          <StaggerContainer className={t.servicesGrid} staggerDelay={0.06}>
            {NURSING_SERVICES.map((svc) => (
              <StaggerItem key={svc.title} className={`${t.serviceCard} ${t.teal}`}>
                <div className={t.serviceIcon}>
                  <CheckCircle size={24} />
                </div>
                <div className={t.serviceContent}>
                  <h3>{svc.title}</h3>
                  <p>{svc.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Hospital to home */}
      <section className="section">
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Hospital to Home</span>
              <h2>How We Get Your Child Home From the NICU or PICU</h2>
              <p>Four steps, and we walk you through each one.</p>
            </div>
          </ScrollReveal>
          <ol className={s.steps}>
            {HOME_STEPS.map((step, i) => (
              <li key={step.title} className={s.step}>
                <span className={s.stepNumber} aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* How GAPP pays */}
      <section className="section bg-light">
        <div className="container">
          <div className={t.contentGrid}>
            <ScrollReveal direction="left" className={t.contentImage}>
              <div className={t.imageWrapper} style={{ aspectRatio: '1/1' }}>
                <Image
                  src="/images/gapp-population.png"
                  alt="Home nurse caring for a medically fragile child with monitoring equipment in the child's bedroom"
                  fill
                  style={{ objectFit: 'cover' }}
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={t.contentInfo}>
              <span className={`${t.sectionLabel} ${t.teal}`}>Paying for Care</span>
              <h2>How GAPP Pays for Trach and Vent Nursing</h2>
              <ul className={s.factList}>
                <li><strong>No cost to your family.</strong> GAPP is a Georgia Medicaid program, and approved nursing is paid in full.</li>
                <li><strong>Your child must be on Georgia Medicaid</strong> and under 21 years old.</li>
                <li><strong>Hours are based on medical need.</strong> State reviewers decide how many nursing hours your child is approved for, using your child&apos;s physician orders and records.</li>
                <li><strong>Every child in GAPP has skilled nursing.</strong> A parent can be paid only for personal care, such as bathing and dressing, never for trach or ventilator care.</li>
              </ul>
              <p className={s.moreLink}>
                <Link href="/programs/gapp">Learn more about GAPP eligibility</Link>
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* For discharge planners */}
      <section className="section">
        <div className="container">
          <ScrollReveal direction="up" className={s.proBox}>
            <span className={`${t.sectionLabel} ${t.teal}`}>For Hospitals and Case Managers</span>
            <h2>Referring a Trach or Vent Patient?</h2>
            <p>
              We accept referrals directly from NICU and PICU discharge planners, case managers, and
              physicians. Send us the family&apos;s contact information and what you know about the
              child&apos;s needs, and we will take it from there: physician orders, the GAPP request, and
              staffing trach and vent trained nurses for discharge.
            </p>
            <div className={s.heroActions}>
              <Link href={REFERRAL_HREF} className="btn btn-primary">
                Send a Referral <ArrowRight size={18} />
              </Link>
              <a href={`tel:${PHONE_TEL}`} className="btn btn-secondary">
                <Phone size={18} /> {PHONE_DISPLAY}
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Service area */}
      <section className="section bg-light">
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Service Area</span>
              <h2>Where We Provide Trach and Vent Nursing</h2>
              <p>
                Metro Atlanta and surrounding counties today, with referrals welcome from across Georgia
                as we grow.
              </p>
            </div>
          </ScrollReveal>
          <div className={s.countyGroups}>
            <div>
              <h3>Core Counties</h3>
              <ul className={s.countyList}>
                {CORE_COUNTIES.map((c) => <li key={c}>{c} County</li>)}
              </ul>
            </div>
            <div>
              <h3>Also Serving</h3>
              <ul className={s.countyList}>
                {EXTENDED_COUNTIES.map((c) => <li key={c}>{c} County</li>)}
              </ul>
            </div>
          </div>
          <p className={s.statewide}>
            Live somewhere else in Georgia? Call us anyway. We are expanding, and we will tell you honestly
            whether we can staff your child&apos;s care.
          </p>
        </div>
      </section>

      {/* Guides for families */}
      {guides.length > 0 && (
        <section className="section">
          <div className="container">
            <ScrollReveal direction="up">
              <div className="section-header">
                <span className={`${t.sectionLabel} ${t.teal}`}>Guides for Families</span>
                <h2>Learn More Before Your Child Comes Home</h2>
                <p>Plain-language guides from our team on the questions trach and vent families ask us most.</p>
              </div>
            </ScrollReveal>
            <StaggerContainer className={s.guideGrid} staggerDelay={0.06}>
              {guides.map((g) => (
                <StaggerItem key={g.slug}>
                  <Link href={`/blog/${g.slug}`} className={s.guideCard}>
                    {g.featuredImage && (
                      <div className={s.guideImage}>
                        <Image src={g.featuredImage} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
                      </div>
                    )}
                    <div className={s.guideBody}>
                      <h3>{g.title}</h3>
                      <p>{g.excerpt}</p>
                      <span className={s.guideMore}>
                        <BookOpen size={16} aria-hidden="true" /> Read the Guide
                      </span>
                    </div>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className={`section ${t.faqSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Common Questions</span>
              <h2>Trach and Ventilator Care Questions</h2>
            </div>
          </ScrollReveal>
          <StaggerContainer className={t.faqList} staggerDelay={0.06}>
            {FAQS.map((faq) => (
              <StaggerItem key={faq.question} className={t.faqItem}>
                <h3 className={t.faqQuestion}>{faq.question}</h3>
                <p className={t.faqAnswer}>{faq.answer}</p>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* CTA */}
      <section className={`section bg-gradient ${t.ctaSection}`}>
        <div className="container">
          <ScrollReveal direction="up" className={t.ctaContent}>
            <h2>Let&apos;s Get Your Child Home</h2>
            <p>
              Tell us about your child and we will take it from there. The earlier we hear from you before
              discharge, the more time we have to have nurses ready.
            </p>
            <div className={t.ctaActions}>
              <Link href={REFERRAL_HREF} className="btn btn-gold btn-lg">
                Start a Referral <ArrowRight size={20} />
              </Link>
              <a href={`tel:${PHONE_TEL}`} className="btn btn-secondary btn-lg">
                <Phone size={20} /> Call {PHONE_DISPLAY}
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
