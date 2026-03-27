'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import styles from './CategoryFilter.module.css';

interface CategoryFilterProps {
  categories: string[];
}

export default function CategoryFilter({ categories }: CategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get('category') || '';

  function handleFilter(category: string) {
    if (category === '') {
      router.push('/blog', { scroll: false });
    } else {
      router.push(`/blog?category=${encodeURIComponent(category)}`, { scroll: false });
    }
  }

  return (
    <div className={styles.filterContainer}>
      <button
        className={`${styles.filterPill} ${activeCategory === '' ? styles.active : ''}`}
        onClick={() => handleFilter('')}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          className={`${styles.filterPill} ${activeCategory === cat ? styles.active : ''}`}
          onClick={() => handleFilter(cat)}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
