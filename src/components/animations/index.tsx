'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useInView,
  animate,
  type Variants,
} from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Reduced-motion helper                                              */
/* ------------------------------------------------------------------ */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ */
/*  ScrollReveal                                                       */
/* ------------------------------------------------------------------ */
interface ScrollRevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  scale?: number;
}

const directionOffset = {
  up: { y: 24, x: 0 },
  down: { y: -24, x: 0 },
  left: { x: -30, y: 0 },
  right: { x: 30, y: 0 },
};

export function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  duration = 0.6,
  className,
  style,
  scale,
}: ScrollRevealProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  const offset = directionOffset[direction];
  const initial: Record<string, number> = { opacity: 0, ...offset };
  if (scale !== undefined) initial.scale = scale;

  const animateTo: Record<string, number> = { opacity: 1, x: 0, y: 0 };
  if (scale !== undefined) animateTo.scale = 1;

  return (
    <motion.div
      initial={initial}
      whileInView={animateTo}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  StaggerContainer + StaggerItem                                     */
/* ------------------------------------------------------------------ */
interface StaggerContainerProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
  style?: React.CSSProperties;
}

const containerVariants = (stagger: number): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: stagger } },
});

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export function StaggerContainer({
  children,
  staggerDelay = 0.1,
  className,
  style,
}: StaggerContainerProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      variants={containerVariants(staggerDelay)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function StaggerItem({ children, className, style }: StaggerItemProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div variants={itemVariants} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  ParallaxSection                                                    */
/* ------------------------------------------------------------------ */
interface ParallaxSectionProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export function ParallaxSection({
  children,
  speed = 0.5,
  className,
}: ParallaxSectionProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-30 * speed, 30 * speed]);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} style={{ overflow: 'hidden' }}>
      <motion.div style={{ y }} className={className}>
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimatedCounter                                                    */
/* ------------------------------------------------------------------ */
interface AnimatedCounterProps {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  duration = 2,
  className,
}: AnimatedCounterProps) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(target.toLocaleString());
      return;
    }
    const controls = animate(motionVal, target, {
      duration,
      ease: [0.25, 0.1, 0.25, 1],
      onUpdate(v) {
        setDisplay(Math.round(v).toLocaleString());
      },
    });
    return () => controls.stop();
  }, [inView, target, duration, reduced, motionVal]);

  return (
    <span ref={ref} className={className}>
      {prefix}{display}{suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  TextReveal                                                         */
/* ------------------------------------------------------------------ */
interface TextRevealProps {
  children: React.ReactNode;
  delay?: number;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  className?: string;
}

export function TextReveal({
  children,
  delay = 0,
  as: Tag = 'h2',
  className,
}: TextRevealProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <Tag className={className}>{children}</Tag>;

  const MotionTag = motion.create(Tag);

  return (
    <div style={{ overflow: 'hidden' }}>
      <MotionTag
        initial={{ y: '100%', opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
        className={className}
      >
        {children}
      </MotionTag>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FloatingElement                                                    */
/* ------------------------------------------------------------------ */
interface FloatingElementProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function FloatingElement({ children, className, style }: FloatingElementProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  MotionCard — hover spring effect for cards                         */
/* ------------------------------------------------------------------ */
interface MotionCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function MotionCard({ children, className, style }: MotionCardProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
