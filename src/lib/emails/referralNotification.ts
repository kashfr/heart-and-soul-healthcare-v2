import 'server-only';
import { Resend } from 'resend';
import type { ReferralInput } from '@/lib/referrals';

// Notification for a referral that arrived via the API intake (e.g. the GAPP
// website). The portal's own /referral form already sends its own richer email
// from actions.ts, so this is used only by the intake endpoint.

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const NOTIFICATION_EMAIL = 'info@heartandsoulhc.org';

const SOURCE_LABEL: Record<string, string> = {
  'gapp-website': 'Georgia Pediatric Program website',
  'hs-website': 'Heart & Soul website',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value?: string): boolean => !!value && EMAIL_RE.test(value);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReferralNotificationResult {
  ok: boolean;
  error?: string;
}

export async function sendReferralNotification(
  referral: ReferralInput
): Promise<ReferralNotificationResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sourceLabel = SOURCE_LABEL[referral.source] || referral.source;

  const coreRows: Array<[string, string]> = [
    ['Name', referral.clientName],
    ['Phone', referral.clientPhone],
    ['Email', referral.clientEmail],
    ['County', referral.county || ''],
    ['Program', referral.program || ''],
  ];
  if (referral.referrerName) coreRows.push(['Referred by', referral.referrerName]);

  const rowsHtml = [...coreRows, ...referral.details.map(
    (d) => [d.label, d.value] as [string, string]
  )]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(
            label
          )}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;">${
            value ? escapeHtml(value) : '<span style="color:#9ca3af;">—</span>'
          }</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">
      <h2 style="margin:0 0 4px;">New referral</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">via ${escapeHtml(
        sourceLabel
      )}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml}</table>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
        View and manage this referral in the staff portal under Referrals.
      </p>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: NOTIFICATION_EMAIL,
      replyTo: isValidEmail(referral.clientEmail) ? referral.clientEmail : undefined,
      subject: `New referral: ${referral.clientName || 'Unknown'}`,
      html,
    });
    if (error) {
      console.error('Resend referral-notification error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error('Resend referral-notification threw:', err);
    return { ok: false, error: message };
  }
}
