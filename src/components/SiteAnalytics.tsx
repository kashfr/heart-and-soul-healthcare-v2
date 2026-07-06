'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const GA_MEASUREMENT_ID = 'G-26HBSM36Q3';

/**
 * Public marketing paths where Google Analytics is allowed. This is an
 * ALLOWLIST on purpose: Google Analytics is NOT a HIPAA-covered service, so any
 * page that could carry patient information in its URL or title must never load
 * or fire it. Allowlisting (default off) means a newly added route is untracked
 * until someone deliberately opts it in — the safe direction to fail.
 *
 * Deliberately EXCLUDED (PHI or PHI-adjacent):
 *   /admin/**        the authenticated app (URLs contain patient ids)
 *   /progress-note   the nurse charting form (patient data)
 *   /referral        intake form (collects a prospective client's health info)
 *   /shared/**       secure share links (may render a client's record)
 *   /login, /reset-password  auth surfaces
 */
const PUBLIC_PREFIXES = ['/about', '/blog', '/contact', '/programs', '/sms-terms'];

function isPublicMarketing(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Google Analytics, scoped so it can never touch a PHI page. Two guards:
 *  1. The gtag script only mounts on allowlisted public pages, so entering the
 *     app directly on a PHI URL (bookmark / refresh) never loads GA at all.
 *  2. `window['ga-disable-<id>']` is set from the current path on every render,
 *     which gtag checks before EVERY hit — including GA4 Enhanced Measurement's
 *     history-based pageviews — so a gtag already in memory from an earlier
 *     public page still sends nothing once the user is on a PHI route.
 */
export default function SiteAnalytics() {
  const pathname = usePathname();
  const allowed = isPublicMarketing(pathname);

  // Runs on every path change (the hook is above the early return, so it still
  // fires on PHI pages, where it disables any gtag already loaded from an
  // earlier public page).
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = !allowed;
  }, [allowed]);

  if (!allowed) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window['ga-disable-${GA_MEASUREMENT_ID}'] = false;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
