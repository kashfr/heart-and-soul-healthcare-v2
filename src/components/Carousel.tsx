'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import styles from './Carousel.module.css';

interface CarouselSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  buttonText: string;
  image: string;
}

const slides: CarouselSlide[] = [
  {
    id: 'gapp',
    title: 'GAPP',
    subtitle: 'Georgia Pediatric Program',
    description: 'Providing skilled nursing and support services for medically fragile children, enabling them to thrive in their homes and communities.',
    href: '/programs/gapp',
    buttonText: 'Learn About GAPP',
    image: '/images/gapp-slide-v2.png',
  },
  {
    id: 'now-comp',
    title: 'NOW/COMP',
    subtitle: 'New Options & Comprehensive Supports Waiver',
    description: 'Person-centered support for individuals with intellectual and developmental disabilities to live meaningful lives in the community.',
    href: '/programs/now-comp',
    buttonText: 'Explore NOW/COMP',
    image: '/images/now-comp-slide.png',
  },
  {
    id: 'icwp',
    title: 'ICWP',
    subtitle: 'Independent Care Waiver Program',
    description: 'Empowering adults with physical impairments or traumatic brain injuries to achieve independent, dignified lives.',
    href: '/programs/icwp',
    buttonText: 'Discover ICWP',
    image: '/images/icwp-slide-v2.png',
  },
  {
    id: 'edwp',
    title: 'EDWP/CCSP/SOURCE',
    subtitle: 'Elderly and Disabled Waiver Programs',
    description: 'Comprehensive support services helping elderly and disabled individuals maintain independence and safety at home.',
    href: '/programs/edwp',
    buttonText: 'View EDWP Services',
    image: '/images/edwp-slide.png',
  },
];

const SLIDE_DURATION = 5000; // 5 seconds

export default function Carousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);
  
  const startTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | undefined>(undefined);
  const progressRef = useRef(0);

  useEffect(() => {
    setMounted(true);
    startTimeRef.current = Date.now();
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setProgress(0);
    progressRef.current = 0;
    startTimeRef.current = Date.now();
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setProgress(0);
    progressRef.current = 0;
    startTimeRef.current = Date.now();
  }, []);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setProgress(0);
    progressRef.current = 0;
    startTimeRef.current = Date.now();
  };

  useEffect(() => {
    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const newProgress = Math.min((elapsed / SLIDE_DURATION) * 100, 100);
      
      progressRef.current = newProgress;
      setProgress(newProgress);

      if (newProgress >= 100) {
        nextSlide();
      } else {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [nextSlide, currentSlide]);

  return (
    <div 
      className={styles.carousel}
    >
      <div className={styles.slidesContainer}>
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className={`${styles.slide} ${index === currentSlide ? styles.active : ''} ${index === currentSlide && mounted ? styles.zooming : ''}`}
          >
            <div className="container" style={{ height: '100%' }}>
              <div className={styles.splitLayout}>
                {/* Left Content Side */}
                <div className={styles.textContent}>
                  <div className={styles.contentWrapper}>
                    <span className={styles.slideLabel}>{slide.title}</span>
                    <h1 className={styles.slideTitle}>{slide.subtitle}</h1>
                    <p className={styles.slideDescription}>{slide.description}</p>
                    <Link href={slide.href} className={`btn btn-primary btn-lg ${styles.slideBtn}`}>
                      {slide.buttonText}
                      <ArrowRight size={20} />
                    </Link>
                  </div>
                </div>

                {/* Right Image Side with Dots Wrapper */}
                <div className={styles.imageSection}>
                  <div className={styles.imageWrapper}>
                    <Image
                      src={slide.image}
                      alt={slide.subtitle}
                      fill
                      priority={index === 0}
                      className={styles.slideImage}
                      quality={100}
                    />
                  </div>
                  {/* Mobile-only dots positioned below image */}
                  <div className={styles.mobileDots}>
                    {slides.map((_, dotIndex) => (
                      <button
                        key={dotIndex}
                        className={`${styles.dot} ${dotIndex === currentSlide ? styles.active : ''}`}
                        onClick={() => goToSlide(dotIndex)}
                        aria-label={`Go to slide ${dotIndex + 1}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      <button 
        className={`${styles.navBtn} ${styles.prevBtn}`}
        onClick={prevSlide}
        aria-label="Previous slide"
      >
        <ChevronLeft size={28} />
      </button>
      <button 
        className={`${styles.navBtn} ${styles.nextBtn}`}
        onClick={nextSlide}
        aria-label="Next slide"
      >
        <ChevronRight size={28} />
      </button>

      {/* Dots Navigation */}
      <div className={styles.dots}>
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            className={`${styles.dot} ${index === currentSlide ? styles.active : ''}`}
            onClick={() => goToSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Progress Bar */}
      <div className={styles.progressContainer}>
        <div 
          className={styles.progressBar}
          style={{ 
            width: `${progress}%`,
            /* No transition for smooth JS updates */
          }}
        />
      </div>
    </div>
  );
}
