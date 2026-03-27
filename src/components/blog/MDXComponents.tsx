import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Phone } from 'lucide-react';
import styles from './MDXComponents.module.css';

function ReferralCTA() {
  return (
    <div className={styles.referralCta}>
      <h3>Ready to Get Started?</h3>
      <p>
        Contact Heart and Soul Healthcare today to learn how our programs can
        support you or your loved one.
      </p>
      <div className={styles.ctaButtons}>
        <Link href="/referral" className="btn btn-gold btn-lg">
          Make a Referral <ArrowRight size={20} />
        </Link>
        <Link href="/contact" className="btn btn-secondary btn-lg">
          <Phone size={20} /> Contact Us
        </Link>
      </div>
    </div>
  );
}

function CalloutBox({ children }: { children: React.ReactNode }) {
  return <div className={styles.callout}>{children}</div>;
}

const mdxComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className={styles.h1} {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className={styles.h2} {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className={styles.h3} {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className={styles.p} {...props} />
  ),
  a: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    if (href?.startsWith('/')) {
      return <Link href={href} className={styles.link} {...props} />;
    }
    return (
      <a href={href} className={styles.link} target="_blank" rel="noopener noreferrer" {...props} />
    );
  },
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className={styles.ul} {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className={styles.ol} {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className={styles.li} {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className={styles.blockquote} {...props} />
  ),
  img: ({ src, alt }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <span className={styles.imageWrapper}>
      <Image
        src={typeof src === 'string' ? src : ''}
        alt={alt || ''}
        width={720}
        height={400}
        style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-xl)' }}
      />
    </span>
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className={styles.strong} {...props} />
  ),
  hr: () => <hr className={styles.hr} />,
  ReferralCTA,
  CalloutBox,
};

export default mdxComponents;
