import Link from 'next/link';
import { ArrowRight, LucideIcon } from 'lucide-react';
import styles from './ProgramCard.module.css';

interface ProgramCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  accentColor?: 'teal' | 'gold' | 'sage' | 'primary';
}

export default function ProgramCard({
  icon: Icon,
  title,
  subtitle,
  description,
  href,
  accentColor = 'teal',
}: ProgramCardProps) {
  return (
    <div className={`${styles.card} ${styles[accentColor]}`}>
      <div className={styles.iconWrapper}>
        <Icon size={32} />
      </div>
      <div className={styles.content}>
        <span className={styles.subtitle}>{subtitle}</span>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
        <Link href={href} className={styles.link}>
          Learn More <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
