import { SHARE_SITE_URL } from '@/lib/shareLink';

/**
 * Deep link from a new-referral email straight to that card on the staff
 * board. /admin/referrals opens the drawer for `?open=<id>`; if the reader
 * is signed out, AuthGuard sends them through /login with the full path
 * (query included) as the redirect, so they land on the card after sign-in.
 */
export function referralPortalUrl(referralId: string): string {
  return `${SHARE_SITE_URL}/admin/referrals?open=${encodeURIComponent(referralId)}`;
}

/** A bulletproof (table-based) button for the email body. Inline styles only:
 *  most mail clients strip <style> blocks and ignore classes. */
export function referralPortalButtonHtml(referralId: string): string {
  const url = referralPortalUrl(referralId);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr>
        <td style="border-radius:8px;background:#4f46e5;">
          <a href="${url}" target="_blank" rel="noopener"
             style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
            Open this referral in the portal
          </a>
        </td>
      </tr>
    </table>`;
}
