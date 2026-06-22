import 'server-only';
import { Resend } from 'resend';

// Sent to a partner agency when staff share a referral with them. Contains the
// secure, expiring link to the read-only referral view. No PHI in the email
// body itself beyond the client's name (kept minimal); the details live behind
// the authenticated-by-token link.

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const REPLY_TO = 'info@heartandsoulhc.org';
const PHONE = '(678) 644-0337';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReferralShareEmailInput {
  to: string;
  partnerAgency: string;
  link: string;
  sharedByName?: string;
  clientName?: string;
  expiresAt?: string | null; // ISO
}

export interface ReferralShareEmailResult {
  ok: boolean;
  error?: string;
}

export async function sendReferralShareEmail(
  input: ReferralShareEmailInput
): Promise<ReferralShareEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const agency = escapeHtml(input.partnerAgency || 'your agency');
  const sharedBy = input.sharedByName ? escapeHtml(input.sharedByName) : 'The Heart & Soul Healthcare team';
  const client = input.clientName ? escapeHtml(input.clientName) : 'a client';
  const expires = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      <p style="margin:0 0 12px;">Hello ${agency},</p>
      <p style="margin:0 0 12px;">${sharedBy} has shared a client referral with you for review and follow-up.</p>
      <p style="margin:0 0 18px;">Use the secure link below to view the referral details${
        input.clientName ? ` for ${client}` : ''
      }. The link is private to your agency, so please do not forward it.</p>
      <p style="margin:0 0 18px;">
        <a href="${escapeHtml(input.link)}"
           style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:700;font-size:15px;">
          View referral
        </a>
      </p>
      ${expires ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">This link expires on ${expires}.</p>` : ''}
      <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this URL into your browser:</p>
      <p style="margin:0 0 16px;word-break:break-all;font-size:12px;color:#6b7280;">${escapeHtml(input.link)}</p>
      <p style="margin:18px 0 0;">Questions? Reply to this email or call us at ${PHONE}.</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare</p>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: REPLY_TO,
      subject: `A client referral has been shared with ${input.partnerAgency || 'your agency'}`,
      html,
    });
    if (error) {
      console.error('Resend referral-share error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error('Resend referral-share threw:', err);
    return { ok: false, error: message };
  }
}

export interface ReferralShareBatchEmailInput {
  to: string;
  partnerAgency: string;
  sharedByName?: string;
  items: { clientName: string; link: string }[];
  expiresAt?: string | null; // ISO
}

/**
 * One email listing several shared referrals, each with its own secure link.
 * Used by bulk sharing so the partner gets a single message instead of many.
 */
export async function sendReferralShareBatchEmail(
  input: ReferralShareBatchEmailInput
): Promise<ReferralShareEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (input.items.length === 0) {
    return { ok: false, error: 'No referrals to share.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const agency = escapeHtml(input.partnerAgency || 'your agency');
  const sharedBy = input.sharedByName
    ? escapeHtml(input.sharedByName)
    : 'The Heart & Soul Healthcare team';
  const count = input.items.length;
  const expires = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const rows = input.items
    .map(
      (it) => `
      <li style="margin-bottom:10px;">
        <strong>${escapeHtml(it.clientName || 'Referral')}</strong><br/>
        <a href="${escapeHtml(it.link)}" style="color:#1a3a5c;">View referral &rarr;</a>
      </li>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      <p style="margin:0 0 12px;">Hello ${agency},</p>
      <p style="margin:0 0 12px;">${sharedBy} has shared ${count} client referral${count === 1 ? '' : 's'} with you for review and follow-up.</p>
      <p style="margin:0 0 12px;">Each link below is private to your agency, so please do not forward this email.</p>
      <ul style="margin:0 0 16px;padding-left:18px;">${rows}</ul>
      ${expires ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">These links expire on ${expires}.</p>` : ''}
      <p style="margin:18px 0 0;">Questions? Reply to this email or call us at ${PHONE}.</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare</p>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: REPLY_TO,
      subject: `${count} client referral${count === 1 ? '' : 's'} shared with ${input.partnerAgency || 'your agency'}`,
      html,
    });
    if (error) {
      console.error('Resend referral-share-batch error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error('Resend referral-share-batch threw:', err);
    return { ok: false, error: message };
  }
}
