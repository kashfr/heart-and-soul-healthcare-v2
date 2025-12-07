'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, ChevronDown, Heart, Phone } from 'lucide-react';
import styles from './Header.module.css';

const programLinks = [
  { href: '/programs/gapp', label: 'GAPP - Georgia Pediatric Program' },
  { href: '/programs/now-comp', label: 'NOW/COMP Waiver' },
  { href: '/programs/icwp', label: 'ICWP - Independent Care' },
  { href: '/programs/edwp', label: 'EDWP/CCSP/SOURCE' },
  { href: '/programs/other', label: 'Other Programs' },
];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProgramsOpen, setIsProgramsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.topBar}>
        <div className="container">
          <div className={styles.topBarContent}>
            <div className={styles.topBarItem}>
              <Phone size={14} />
              <span>Call us: (678) 644-0337</span>
            </div>
            <div className={styles.topBarItem}>
              <span>Providing compassionate care across Georgia</span>
            </div>
          </div>
        </div>
      </div>
      
      <nav className={styles.nav}>
        <div className="container">
          <div className={styles.navContent}>
            <Link href="/" className={styles.logo}>
              <div className={styles.logoIcon}>
                <Heart size={28} fill="currentColor" />
              </div>
              <div className={styles.logoText}>
                <span className={styles.logoMain}>Heart & Soul</span>
                <span className={styles.logoSub}>Healthcare</span>
              </div>
            </Link>

            <ul className={styles.navLinks}>
              <li><Link href="/">Home</Link></li>
              <li><Link href="/about">About Us</Link></li>
              <li 
                className={styles.dropdown}
                onMouseEnter={() => setIsProgramsOpen(true)}
                onMouseLeave={() => setIsProgramsOpen(false)}
              >
                <button className={styles.dropdownTrigger}>
                  Programs <ChevronDown size={16} className={isProgramsOpen ? styles.rotated : ''} />
                </button>
                <ul className={`${styles.dropdownMenu} ${isProgramsOpen ? styles.open : ''}`}>
                  {programLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </li>
              <li><Link href="/contact">Contact</Link></li>
              <li>
                <Link href="/referral" className={`btn btn-primary ${styles.referralBtn}`}>
                  Make a Referral
                </Link>
              </li>
            </ul>

            <button 
              className={styles.mobileMenuBtn}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`${styles.mobileMenu} ${isMobileMenuOpen ? styles.open : ''}`}>
        <ul className={styles.mobileNavLinks}>
          <li><Link href="/" onClick={() => setIsMobileMenuOpen(false)}>Home</Link></li>
          <li><Link href="/about" onClick={() => setIsMobileMenuOpen(false)}>About Us</Link></li>
          <li className={styles.mobileDropdown}>
            <button 
              className={styles.mobileDropdownTrigger}
              onClick={() => setIsProgramsOpen(!isProgramsOpen)}
            >
              Programs <ChevronDown size={16} className={isProgramsOpen ? styles.rotated : ''} />
            </button>
            <ul className={`${styles.mobileDropdownMenu} ${isProgramsOpen ? styles.open : ''}`}>
              {programLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setIsMobileMenuOpen(false)}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
          <li><Link href="/contact" onClick={() => setIsMobileMenuOpen(false)}>Contact</Link></li>
          <li>
            <Link 
              href="/referral" 
              className="btn btn-primary"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Make a Referral
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
