import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Calendar, Clock, User, ChevronRight } from 'lucide-react';
import { getAllPosts, getPostBySlug, getRelatedPosts, CATEGORY_COLORS } from '@/lib/blog';
import mdxComponents from '@/components/blog/MDXComponents';
import BlogCard from '@/components/blog/BlogCard';
import { ScrollReveal, StaggerContainer, StaggerItem } from '@/components/animations';
import styles from './page.module.css';

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `https://www.heartandsoulhc.org/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `https://www.heartandsoulhc.org/blog/${slug}`,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: post.featuredImage
        ? [{ url: `https://www.heartandsoulhc.org${post.featuredImage}`, width: 1792, height: 1024, alt: post.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.featuredImage
        ? [`https://www.heartandsoulhc.org${post.featuredImage}`]
        : undefined,
    },
  };
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = getRelatedPosts(slug, post.category);
  const colorClass = CATEGORY_COLORS[post.category] || 'teal';

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Organization',
      name: 'Heart and Soul Healthcare',
      url: 'https://www.heartandsoulhc.org',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Heart and Soul Healthcare',
      logo: { '@type': 'ImageObject', url: 'https://www.heartandsoulhc.org/images/logo.webp' },
    },
    image: post.featuredImage
      ? `https://www.heartandsoulhc.org${post.featuredImage}`
      : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://www.heartandsoulhc.org/blog/${slug}`,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.heartandsoulhc.org' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://www.heartandsoulhc.org/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `https://www.heartandsoulhc.org/blog/${slug}` },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <article className={styles.postPage}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <div className="container">
            <nav aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <ChevronRight size={14} />
              <Link href="/blog">Blog</Link>
              <ChevronRight size={14} />
              <span>{post.title}</span>
            </nav>
          </div>
        </div>

        {/* Header */}
        <header className={styles.postHeader}>
          <div className="container">
            <div className={styles.headerContent}>
              <span className={`${styles.categoryBadge} ${styles[colorClass]}`}>
                {post.category}
              </span>
              <h1>{post.title}</h1>
              <div className={styles.postMeta}>
                <div className={styles.metaItem}>
                  <User size={16} />
                  <span>{post.author}</span>
                </div>
                <div className={styles.metaItem}>
                  <Calendar size={16} />
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                </div>
                <div className={styles.metaItem}>
                  <Clock size={16} />
                  <span>{post.readingTime}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Featured Image */}
        {post.featuredImage && (
          <div className={styles.featuredImage}>
            <div className="container">
              <div className={styles.imageWrapper}>
                <Image
                  src={post.featuredImage}
                  alt={`Featured image for ${post.title}`}
                  width={1792}
                  height={1024}
                  style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-lg)' }}
                  priority
                />
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={styles.postBody}>
          <div className="container">
            <ScrollReveal direction="up" delay={0.1}>
              <div className={styles.prose}>
                <MDXRemote source={post.content} components={mdxComponents} />
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className={styles.tagsSection}>
            <div className="container">
              <div className={styles.tags}>
                {post.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className={`section bg-light ${styles.relatedSection}`}>
            <div className="container">
              <div className="section-header">
                <h2>Related Articles</h2>
                <p>Continue reading about {post.category}</p>
              </div>
              <StaggerContainer className={styles.relatedGrid} staggerDelay={0.1}>
                {relatedPosts.map((related) => (
                  <StaggerItem key={related.slug}>
                    <BlogCard
                      title={related.title}
                      excerpt={related.excerpt}
                      date={related.date}
                      category={related.category}
                      readingTime={related.readingTime}
                      slug={related.slug}
                      featuredImage={related.featuredImage}
                    />
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </section>
        )}
      </article>
    </>
  );
}
