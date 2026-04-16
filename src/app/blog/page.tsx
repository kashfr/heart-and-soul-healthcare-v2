import { Metadata } from 'next';
import { Suspense } from 'react';
import { BookOpen, ArrowRight, Phone } from 'lucide-react';
import Link from 'next/link';
import { getAllPosts, getAllCategories } from '@/lib/blog';
import BlogCard from '@/components/blog/BlogCard';
import CategoryFilter from '@/components/blog/CategoryFilter';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/animations';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Resources & Blog',
  description: 'Healthcare resources, guides, and insights for caregivers and families navigating Georgia Medicaid waiver programs including GAPP, NOW/COMP, ICWP, and EDWP.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/blog' },
  openGraph: {
    title: 'Resources & Blog | Heart and Soul Healthcare',
    description: 'Healthcare resources and guides for caregivers navigating Georgia Medicaid waiver programs.',
    url: 'https://www.heartandsoulhc.org/blog',
  },
};

interface BlogPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const activeCategory = params.category || '';
  const allPosts = getAllPosts();
  const categories = getAllCategories();

  const filteredPosts = activeCategory
    ? allPosts.filter((p) => p.category === activeCategory)
    : allPosts;

  return (
    <div className={styles.blogPage}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroBackground}>
          <div className={styles.heroOverlay} />
        </div>
        <div className="container">
          <div className={styles.heroContent}>
            <div className={styles.heroIcon}>
              <BookOpen size={48} />
            </div>
            <span className={styles.heroLabel}>Resources & Insights</span>
            <h1>Blog</h1>
            <p className={styles.heroSubtitle}>
              Guides, tips, and insights to help caregivers and families navigate
              Georgia&apos;s home health programs and make informed care decisions.
            </p>
          </div>
        </div>
      </section>

      {/* Blog Listing */}
      <section className="section">
        <div className="container">
          <Suspense fallback={null}>
            <CategoryFilter categories={categories} />
          </Suspense>

          {filteredPosts.length > 0 ? (
            <StaggerContainer className={styles.postsGrid} staggerDelay={0.1}>
              {filteredPosts.map((post) => (
                <StaggerItem key={post.slug}>
                  <BlogCard
                    title={post.title}
                    excerpt={post.excerpt}
                    date={post.date}
                    category={post.category}
                    readingTime={post.readingTime}
                    slug={post.slug}
                    featuredImage={post.featuredImage}
                  />
                </StaggerItem>
              ))}
            </StaggerContainer>
          ) : (
            <div className={styles.emptyState}>
              <BookOpen size={48} />
              <h3>No posts found</h3>
              <p>
                {activeCategory
                  ? `No posts in the "${activeCategory}" category yet. Check back soon!`
                  : 'Blog posts are coming soon. Check back for resources and guides.'}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className={`section bg-gradient ${styles.ctaSection}`}>
        <div className="container">
          <ScrollReveal direction="up" className={styles.ctaContent}>
            <h2>Need Help Getting Started?</h2>
            <p>
              Our team is here to answer your questions about Georgia&apos;s home
              health programs and guide you through the referral process.
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
