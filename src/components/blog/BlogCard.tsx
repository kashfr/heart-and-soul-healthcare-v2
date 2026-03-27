import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import { CATEGORY_COLORS } from '@/lib/blog';
import styles from './BlogCard.module.css';

interface BlogCardProps {
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readingTime: string;
  slug: string;
  featuredImage?: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogCard({
  title,
  excerpt,
  date,
  category,
  readingTime,
  slug,
  featuredImage,
}: BlogCardProps) {
  const colorClass = CATEGORY_COLORS[category] || 'teal';

  return (
    <article className={styles.card}>
      <Link href={`/blog/${slug}`} className={styles.cardLink}>
        <div className={styles.imageContainer}>
          {featuredImage ? (
            <Image
              src={featuredImage}
              alt={title}
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className={`${styles.imageFallback} ${styles[colorClass]}`}>
              <span className={styles.fallbackText}>{category}</span>
            </div>
          )}
          <span className={`${styles.categoryBadge} ${styles[colorClass]}`}>
            {category}
          </span>
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.excerpt}>{excerpt}</p>

          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <Calendar size={14} />
              <time dateTime={date}>{formatDate(date)}</time>
            </div>
            <div className={styles.metaItem}>
              <Clock size={14} />
              <span>{readingTime}</span>
            </div>
          </div>

          <span className={styles.readMore}>
            Read More <ArrowRight size={16} />
          </span>
        </div>
      </Link>
    </article>
  );
}
