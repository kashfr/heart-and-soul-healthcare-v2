import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Phone, Stethoscope } from 'lucide-react';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/animations';
import t from '@/components/ProgramPageTemplate.module.css';
import s from '../page.module.css';
import { FAX_DISPLAY, PHONE_DISPLAY, PHONE_TEL } from '../content';
import {
  CHECKLIST,
  FAQS,
  HOSPITALS,
  INDEPENDENCE_LINE,
  INPATIENT_STEPS,
  META_DESCRIPTION,
  META_TITLE,
  PAGE_URL,
  TITLE,
} from './content';

const HERO_IMAGE = '/images/blog/bringing-your-child-home-with-a-trach-georgia-training.png';

export const metadata: Metadata = {
  title: { absolute: META_TITLE },
  description: META_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    url: PAGE_URL,
    type: 'website',
    images: [{ url: HERO_IMAGE, alt: 'Hospital nurse teaching parents tracheostomy care before discharge' }],
  },
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
    { '@type': 'ListItem', position: 3, name: 'Trach and Ventilator Care', item: 'https://www.heartandsoulhc.org/programs/gapp/trach-and-ventilator-care' },
    { '@type': 'ListItem', position: 4, name: "Coming Home From Children's Healthcare of Atlanta", item: PAGE_URL },
  ],
};

const REFERRAL_HREF = '/referral?program=gapp';

export default function ChoaDischargePage() {
  return (
    <div className={t.programPage}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Hero */}
      <section className={`${t.hero} ${t.teal}`}>
        <div className="container">
          <div className={t.heroContent}>
            <nav aria-label="Breadcrumb" className={s.breadcrumb}>
              <Link href="/programs/gapp">GAPP</Link>
              <span aria-hidden="true"> / </span>
              <Link href="/programs/gapp/trach-and-ventilator-care">Trach and Ventilator Care</Link>
              <span aria-hidden="true"> / </span>
              <span>Coming Home From Children&apos;s Healthcare of Atlanta</span>
            </nav>
            <div className={t.heroTop}>
              <div className={t.heroIcon}>
                <Stethoscope size={26} />
              </div>
              <span className={t.heroLabel}>Hospital to Home</span>
            </div>
            <h1>{TITLE}</h1>
            <p className={t.heroSubtitle}>
              If your child is at Arthur M. Blank Hospital, Scottish Rite, or Hughes Spalding and the
              care team is talking about going home with a trach or a ventilator, this page is for you.
              GAPP pays for in-home nursing at no cost to your family, and you choose the agency.
            </p>
            <p className={s.independence}>{INDEPENDENCE_LINE}</p>
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

      {/* You choose the agency */}
      <section className="section">
        <div className="container">
          <div className={t.contentGrid}>
            <ScrollReveal direction="left" className={t.contentInfo}>
              <span className={`${t.sectionLabel} ${t.teal}`}>Your Choice</span>
              <h2>You Choose Your Child&apos;s Home Nursing Agency</h2>
              <p className={t.contentText}>
                Before discharge, a case manager or social worker will talk with you about home
                nursing and may hand you a list of agencies. That list is a starting point, not a
                requirement. Under Medicaid, families generally have the right to choose any enrolled
                provider, and the agency you pick is the one that will be in your home every day.
              </p>
              <p className={t.contentText}>
                If you want Heart and Soul Healthcare, tell your case manager you are choosing us, or
                send us a referral yourself. We will contact the discharge team and take it from there.
              </p>
              <ul className={s.trustList}>
                <li><CheckCircle size={20} aria-hidden="true" /><span>Nurses trained in trach care, suctioning, trach changes, and ventilator management</span></li>
                <li><CheckCircle size={20} aria-hidden="true" /><span>A registered nurse oversees every child&apos;s care, with on-call support after hours</span></li>
                <li><CheckCircle size={20} aria-hidden="true" /><span>We have brought a child home from Children&apos;s Healthcare of Atlanta on a trach and a ventilator</span></li>
              </ul>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={t.contentImage}>
              <div className={t.imageWrapper} style={{ aspectRatio: '4/3' }}>
                <Image
                  src={HERO_IMAGE}
                  alt="Hospital nurse teaching parents tracheostomy care on a training mannequin before discharge"
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

      {/* While your child is still inpatient */}
      <section className="section bg-light">
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Before Discharge</span>
              <h2>What We Do While Your Child Is Still in the Hospital</h2>
              <p>The work that makes the first night home go smoothly happens before you leave.</p>
            </div>
          </ScrollReveal>
          <ol className={s.steps}>
            {INPATIENT_STEPS.map((step, i) => (
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

      {/* Hospitals + checklist */}
      <section className="section">
        <div className="container">
          <div className={t.contentGrid}>
            <ScrollReveal direction="left" className={t.contentInfo}>
              <span className={`${t.sectionLabel} ${t.teal}`}>The Hospitals</span>
              <h2>Coming Home From Any Children&apos;s Healthcare of Atlanta Campus</h2>
              <p className={t.contentText}>
                We take referrals for children leaving any of the three hospitals, and we serve
                families across metro Atlanta and the surrounding counties.
              </p>
              <ul className={s.hospitalList}>
                {HOSPITALS.map((h) => (
                  <li key={h.name}>
                    <h3>{h.name}</h3>
                    <p>{h.detail}</p>
                  </li>
                ))}
              </ul>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={t.contentInfo}>
              <span className={`${t.sectionLabel} ${t.teal}`}>Checklist</span>
              <h2>Before You Leave</h2>
              <p className={t.contentText}>
                Your hospital team will run its own discharge checklist. These are the pieces families
                tell us they are glad they started early.
              </p>
              <ul className={s.checklist}>
                {CHECKLIST.map((item) => (
                  <li key={item}><CheckCircle size={18} aria-hidden="true" /><span>{item}</span></li>
                ))}
              </ul>
              <p className={s.moreLink}>
                <Link href="/blog/bringing-your-child-home-with-a-trach-georgia">Read the full guide to bringing your child home with a trach</Link>
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={`section ${t.faqSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${t.sectionLabel} ${t.teal}`}>Common Questions</span>
              <h2>Questions Families Ask Before Discharge</h2>
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
          <p className={s.independenceLight}>{INDEPENDENCE_LINE}</p>
        </div>
      </section>

      {/* CTA */}
      <section className={`section bg-gradient ${t.ctaSection}`}>
        <div className="container">
          <ScrollReveal direction="up" className={t.ctaContent}>
            <h2>Tell Us Your Child Is Coming Home</h2>
            <p>
              Parents, case managers, social workers, and physicians can all start a referral by
              phone, by fax at {FAX_DISPLAY}, by email, or with the form. We respond the same business day.
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
