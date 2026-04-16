import Link from 'next/link';
import Image from 'next/image';
import { LucideIcon, ArrowRight, Phone, CheckCircle, ExternalLink } from 'lucide-react';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/animations';
import styles from './ProgramPageTemplate.module.css';

interface ServiceItem {
  title: string;
  description?: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface OfficialResource {
  label: string;
  url: string;
  description: string;
}

interface ProgramPageTemplateProps {
  icon: LucideIcon;
  programName: string;
  fullTitle: string;
  subtitle: string;
  targetPopulation: string;
  programGoal: string;
  services: ServiceItem[];
  faqs?: FaqItem[];
  officialResources?: OfficialResource[];
  accentColor?: 'teal' | 'gold' | 'sage' | 'primary';
  populationImage?: string;
  populationImageAlt?: string;
  goalImageAlt?: string;
  imageAspectRatio?: string;
  goalImage?: string;
}

export default function ProgramPageTemplate({
  icon: Icon,
  programName,
  fullTitle,
  subtitle,
  targetPopulation,
  programGoal,
  services,
  faqs,
  officialResources,
  accentColor = 'teal',
  populationImage,
  populationImageAlt,
  goalImageAlt,
  imageAspectRatio = '4/3',
  goalImage,
}: ProgramPageTemplateProps) {
  return (
    <div className={styles.programPage}>
      {/* Hero Section */}
      <section className={`${styles.hero} ${styles[accentColor]}`}>
        <div className={styles.heroBackground}>
          <div className={styles.placeholderImage}>
            <span className={styles.placeholderText}>{programName}</span>
          </div>
          <div className={styles.heroOverlay} />
        </div>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroIcon}>
              <Icon size={48} />
            </div>
            <span className={styles.heroLabel}>{programName}</span>
            <h1>{fullTitle}</h1>
            <p className={styles.heroSubtitle}>{subtitle}</p>
            <div className={styles.heroActions}>
              <Link href="/referral" className="btn btn-gold btn-lg">
                Make a Referral <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="btn btn-secondary-light btn-lg">
                <Phone size={20} /> Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Target Population */}
      <section className={`section ${styles.targetSection}`}>
        <div className="container">
          <div className={styles.contentGrid}>
            <ScrollReveal direction="left" className={styles.contentInfo}>
              <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Who We Serve</span>
              <h2>Target Population</h2>
              <p className={styles.contentText}>{targetPopulation}</p>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={styles.contentImage}>
              {populationImage ? (
                <div className={styles.imageWrapper} style={{ aspectRatio: imageAspectRatio }}>
                  <Image
                    src={populationImage}
                    alt={populationImageAlt || `${fullTitle} — who we serve`}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              ) : (
                <div className={styles.imagePlaceholder}>
                  <span>Population Image</span>
                </div>
              )}
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Program Goal */}
      <section className={`section bg-light ${styles.goalSection}`}>
        <div className="container">
          <div className={styles.contentGrid}>
            <ScrollReveal direction="left" className={styles.contentImage}>
              {goalImage ? (
                <div className={styles.imageWrapper} style={{ aspectRatio: imageAspectRatio }}>
                  <Image
                    src={goalImage}
                    alt={goalImageAlt || `${fullTitle} — program goal`}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              ) : (
                <div className={styles.imagePlaceholder}>
                  <span>Program Goal Image</span>
                </div>
              )}
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.15} className={styles.contentInfo}>
              <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Our Mission</span>
              <h2>Program Goal</h2>
              <p className={styles.contentText}>{programGoal}</p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className={`section ${styles.servicesSection}`}>
        <div className="container">
          <ScrollReveal direction="up">
            <div className="section-header">
              <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>What We Provide</span>
              <h2>Services Offered</h2>
              <p>Comprehensive care services tailored to meet individual needs</p>
            </div>
          </ScrollReveal>
          <StaggerContainer className={styles.servicesGrid} staggerDelay={0.08}>
            {services.map((service, index) => (
              <StaggerItem key={index} className={`${styles.serviceCard} ${styles[accentColor]}`}>
                <div className={styles.serviceIcon}>
                  <CheckCircle size={24} />
                </div>
                <div className={styles.serviceContent}>
                  <h3>{service.title}</h3>
                  {service.description && <p>{service.description}</p>}
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* FAQ Section */}
      {faqs && faqs.length > 0 && (
        <section className={`section bg-light ${styles.faqSection}`}>
          <div className="container">
            <ScrollReveal direction="up">
              <div className="section-header">
                <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Common Questions</span>
                <h2>Frequently Asked Questions</h2>
                <p>Answers to the most common questions about the {fullTitle}</p>
              </div>
            </ScrollReveal>
            <StaggerContainer className={styles.faqList} staggerDelay={0.08}>
              {faqs.map((faq, index) => (
                <StaggerItem key={index} className={styles.faqItem}>
                  <h3 className={styles.faqQuestion}>{faq.question}</h3>
                  <p className={styles.faqAnswer}>{faq.answer}</p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* Official Resources */}
      {officialResources && officialResources.length > 0 && (
        <section className={`section ${styles.resourcesSection}`}>
          <div className="container">
            <ScrollReveal direction="up">
              <div className="section-header">
                <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Official Resources</span>
                <h2>Helpful Links</h2>
                <p>Official Georgia and federal government resources for the {fullTitle}</p>
              </div>
            </ScrollReveal>
            <StaggerContainer className={styles.resourcesList} staggerDelay={0.08}>
              {officialResources.map((resource, index) => (
                <StaggerItem key={index}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.resourceCard}
                  >
                    <div className={styles.resourceInfo}>
                      <h3 className={styles.resourceLabel}>{resource.label}</h3>
                      <p className={styles.resourceDesc}>{resource.description}</p>
                    </div>
                    <ExternalLink size={18} className={styles.resourceIcon} />
                  </a>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className={`section bg-gradient ${styles.ctaSection}`}>
        <div className="container">
          <ScrollReveal direction="up" className={styles.ctaContent}>
            <h2>Ready to Learn More?</h2>
            <p>
              Contact us today to discuss how the {programName} program can benefit you
              or your loved one. Our team is here to answer your questions and guide you
              through the process.
            </p>
            <div className={styles.ctaActions}>
              <Link href="/referral" className="btn btn-gold btn-lg">
                Make a Referral <ArrowRight size={20} />
              </Link>
              <Link href="/contact" className="btn btn-secondary btn-lg">
                <Phone size={20} /> Contact Us
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
