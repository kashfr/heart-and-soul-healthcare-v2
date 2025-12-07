import Link from 'next/link';
import Image from 'next/image';
import { LucideIcon, ArrowRight, Phone, CheckCircle } from 'lucide-react';
import styles from './ProgramPageTemplate.module.css';

interface ServiceItem {
  title: string;
  description?: string;
}

interface ProgramPageTemplateProps {
  icon: LucideIcon;
  programName: string;
  fullTitle: string;
  subtitle: string;
  targetPopulation: string;
  programGoal: string;
  services: ServiceItem[];
  accentColor?: 'teal' | 'gold' | 'sage' | 'primary';
  populationImage?: string;
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
  accentColor = 'teal',
  populationImage,
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
            <div className={styles.contentInfo}>
              <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Who We Serve</span>
              <h2>Target Population</h2>
              <p className={styles.contentText}>{targetPopulation}</p>
            </div>
            <div className={styles.contentImage}>
              {populationImage ? (
                <div className={styles.imageWrapper} style={{ aspectRatio: imageAspectRatio }}>
                  <Image
                    src={populationImage}
                    alt={`${programName} target population`}
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
            </div>
          </div>
        </div>
      </section>

      {/* Program Goal */}
      <section className={`section bg-light ${styles.goalSection}`}>
        <div className="container">
          <div className={styles.contentGrid}>
            <div className={styles.contentImage}>
              {goalImage ? (
                <div className={styles.imageWrapper} style={{ aspectRatio: imageAspectRatio }}>
                  <Image
                    src={goalImage}
                    alt={`${programName} goal`}
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
            </div>
            <div className={styles.contentInfo}>
              <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>Our Mission</span>
              <h2>Program Goal</h2>
              <p className={styles.contentText}>{programGoal}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className={`section ${styles.servicesSection}`}>
        <div className="container">
          <div className="section-header">
            <span className={`${styles.sectionLabel} ${styles[accentColor]}`}>What We Provide</span>
            <h2>Services Offered</h2>
            <p>Comprehensive care services tailored to meet individual needs</p>
          </div>
          <div className={styles.servicesGrid}>
            {services.map((service, index) => (
              <div key={index} className={`${styles.serviceCard} ${styles[accentColor]}`}>
                <div className={styles.serviceIcon}>
                  <CheckCircle size={24} />
                </div>
                <div className={styles.serviceContent}>
                  <h4>{service.title}</h4>
                  {service.description && <p>{service.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`section bg-gradient ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaContent}>
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
              <Link href="/contact" className="btn btn-secondary-light btn-lg">
                <Phone size={20} /> Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
