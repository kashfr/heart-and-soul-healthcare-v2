// Canonical public origin for referral share links. Hardcoded to production
// (mirrors `siteUrl` in layout.tsx / sitemap.ts) so a share link is NEVER built
// from localhost or a preview deploy. The share data lives in the production
// database regardless of where the request came from, so the production link
// always resolves — and an external agency can actually open it. Used on both
// the server (emailed links) and the client (copy-to-clipboard button).

export const SHARE_SITE_URL = 'https://www.heartandsoulhc.org';

/** Build the public share URL for a token, always on the production origin. */
export function buildShareUrl(token: string): string {
  return `${SHARE_SITE_URL}/shared/referral/${token}`;
}

/**
 * The hosted GAPP Appendix P (official list of Medicaid-approved GAPP
 * providers), served from public/docs/. Hosted-and-linked rather than emailed
 * as an attachment so a DCH revision means swapping one file — every link ever
 * sent then serves the current list. Public state information; no PHI.
 */
export const PROVIDER_LIST_URL = `${SHARE_SITE_URL}/docs/gapp-provider-list.pdf`;
