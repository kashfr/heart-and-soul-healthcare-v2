'use client';

import React from 'react';
import {
  ScrollReveal,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
  FloatingElement,
} from '@/components/animations';

/* ------------------------------------------------------------------ */
/*  Trust section — AnimatedCounter for each stat                      */
/* ------------------------------------------------------------------ */
interface StatItem {
  number: string;
  label: string;
}

export function AnimatedTrustGrid({
  stats,
  className,
  itemClassName,
  numberClassName,
  labelClassName,
}: {
  stats: StatItem[];
  className?: string;
  itemClassName?: string;
  numberClassName?: string;
  labelClassName?: string;
}) {
  // Parse stat strings into counter props
  function parseStat(raw: string): {
    target: number;
    suffix: string;
    useCounter: boolean;
  } {
    if (raw === '24/7') return { target: 0, suffix: '', useCounter: false };
    const cleaned = raw.replace(/,/g, '');
    const match = cleaned.match(/^(\d+)(.*)$/);
    if (!match) return { target: 0, suffix: '', useCounter: false };
    return { target: parseInt(match[1], 10), suffix: match[2], useCounter: true };
  }

  return (
    <StaggerContainer className={className} staggerDelay={0.12}>
      {stats.map((stat, index) => {
        const parsed = parseStat(stat.number);
        return (
          <StaggerItem key={index} className={itemClassName}>
            {parsed.useCounter ? (
              <AnimatedCounter
                target={parsed.target}
                suffix={parsed.suffix}
                duration={2}
                className={numberClassName}
              />
            ) : (
              <span className={numberClassName}>{stat.number}</span>
            )}
            <span className={labelClassName}>{stat.label}</span>
          </StaggerItem>
        );
      })}
    </StaggerContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Intro section wrapper                                              */
/* ------------------------------------------------------------------ */
export function AnimatedIntroSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="up" className={className}>
      {children}
    </ScrollReveal>
  );
}

export function AnimatedIntroContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="left" delay={0.1} className={className}>
      {children}
    </ScrollReveal>
  );
}

export function AnimatedIntroImage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="right" delay={0.2} className={className}>
      {children}
    </ScrollReveal>
  );
}

export function AnimatedBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <FloatingElement className={className}>{children}</FloatingElement>;
}

/* ------------------------------------------------------------------ */
/*  Programs section                                                   */
/* ------------------------------------------------------------------ */
export function AnimatedProgramsGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StaggerContainer className={className} staggerDelay={0.1}>
      {children}
    </StaggerContainer>
  );
}

export function AnimatedProgramItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <StaggerItem className={className}>{children}</StaggerItem>;
}

/* ------------------------------------------------------------------ */
/*  Values section                                                     */
/* ------------------------------------------------------------------ */
export function AnimatedValuesContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="left" className={className}>
      {children}
    </ScrollReveal>
  );
}

export function AnimatedValuesImage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="right" delay={0.2} className={className}>
      {children}
    </ScrollReveal>
  );
}

export function AnimatedValuesList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StaggerContainer className={className} staggerDelay={0.1}>
      {children}
    </StaggerContainer>
  );
}

export function AnimatedValueItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <StaggerItem className={className}>{children}</StaggerItem>;
}

/* ------------------------------------------------------------------ */
/*  Testimonial section                                                */
/* ------------------------------------------------------------------ */
export function AnimatedTestimonial({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal scale={0.95} direction="up" duration={0.7} className={className}>
      {children}
    </ScrollReveal>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA section                                                        */
/* ------------------------------------------------------------------ */
export function AnimatedCTA({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollReveal direction="up" className={className}>
      {children}
    </ScrollReveal>
  );
}
