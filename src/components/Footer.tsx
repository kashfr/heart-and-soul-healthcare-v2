import Link from 'next/link';
import Image from 'next/image';
import { Phone, Mail, MapPin, Clock, Facebook, Linkedin } from 'lucide-react';
import styles from './Footer.module.css';

const programLinks = [
  { href: '/programs/gapp', label: 'GAPP - Georgia Pediatric' },
  { href: '/programs/now-comp', label: 'NOW/COMP Waiver' },
  { href: '/programs/icwp', label: 'ICWP - Independent Care' },
  { href: '/programs/edwp', label: 'EDWP/CCSP/SOURCE' },
  { href: '/programs/other', label: 'Other Programs' },
];

const quickLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/referral', label: 'Make a Referral' },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerMain}>
        <div className="container">
          <div className={styles.footerGrid}>
            {/* Company Info */}
            <div className={styles.footerSection}>
              <div className={styles.footerLogo}>
                <Image 
                  src="/images/logo.webp" 
                  alt="Heart & Soul Healthcare Logo" 
                  width={130} 
                  height={40} 
                  style={{ objectFit: 'contain' }} 
                  unoptimized 
                />
              </div>
              <p className={styles.companyDesc}>
                Providing compassionate, professional home health care services 
                throughout Georgia. We are committed to enhancing the quality of 
                life for individuals and families in their homes and communities.
              </p>
              <div className={styles.socialLinks}>
                {/* TODO: Replace "#" with actual Facebook URL */}
                <a href="#" aria-label="Facebook" className={styles.socialLink}>
                  <Facebook size={20} />
                </a>
                {/* TODO: Replace "#" with actual LinkedIn URL */}
                <a href="#" aria-label="LinkedIn" className={styles.socialLink}>
                  <Linkedin size={20} />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className={styles.footerSection}>
              <h4 className={styles.footerTitle}>Quick Links</h4>
              <ul className={styles.footerLinks}>
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Programs */}
            <div className={styles.footerSection}>
              <h4 className={styles.footerTitle}>Our Programs</h4>
              <ul className={styles.footerLinks}>
                {programLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact Info */}
            <div className={styles.footerSection}>
              <h4 className={styles.footerTitle}>Contact Us</h4>
              <ul className={styles.contactList}>
                <li>
                  <Phone size={18} />
                  <span>(678) 644-0337</span>
                </li>
                <li>
                  <Mail size={18} />
                  <span>info@heartandsoulhc.org</span>
                </li>
                <li>
                  <MapPin size={18} />
                  <span>
                    1372 Peachtree St NE<br />
                    Atlanta, GA 30309
                  </span>
                </li>
                <li>
                  <Clock size={18} />
                  <span>Mon - Fri: 10:00 AM - 3:00 PM</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <div className="container">
          <div className={styles.footerBottomContent}>
            <p>&copy; {new Date().getFullYear()} Heart and Soul Healthcare. All rights reserved.</p>
            <p>Committed to excellence in home health care services.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
