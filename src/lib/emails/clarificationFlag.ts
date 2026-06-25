/**
 * Notifies a nurse when a reviewer (RN / supervisor / admin) flags one of her
 * submitted notes for clarification or correction, or posts a follow-up
 * question on an already-open thread. Without this a nurse only sees the flag
 * the next time she signs in, which can be days out. Best-effort via Resend:
 * the flag itself is recorded regardless; a send failure is logged, not fatal.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';
const LOGIN_URL = 'https://www.heartandsoulhc.org/login';

export type ClarificationKind = 'clarification' | 'correction';

export interface ClarificationFlagNoticeParams {
  to: string;
  nurseName: string;
  clientName: string;
  dateOfService: string;
  kind: ClarificationKind;
  reviewerName: string;
  message: string;
  /** A follow-up message on an already-open thread vs the first flag. */
  isFollowUp?: boolean;
}

export interface ClarificationFlagNoticeResult {
  ok: boolean;
  error?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendClarificationFlagNotice({
  to,
  nurseName,
  clientName,
  dateOfService,
  kind,
  reviewerName,
  message,
  isFollowUp,
}: ClarificationFlagNoticeParams): Promise<ClarificationFlagNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!to) {
    return { ok: false, error: 'No recipient email on file for this nurse.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;

  const isCorrection = kind === 'correction';
  const noun = isCorrection ? 'correction' : 'clarification';
  const firstName = (nurseName || '').trim().split(/\s+/)[0] || 'there';

  const subject = isFollowUp
    ? `Follow-up on your note: ${clientName} (${dateOfService})`
    : isCorrection
      ? `Action needed: a note needs correction for ${clientName} (${dateOfService})`
      : `A note needs clarification: ${clientName} (${dateOfService})`;

  const lead = isFollowUp
    ? `${escapeHtml(reviewerName)} added a follow-up question on a note that is awaiting your reply:`
    : `${escapeHtml(reviewerName)} flagged one of your progress notes for ${noun}:`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;color:#1a3a5c;">${isCorrection ? 'A note needs correction' : 'A note needs clarification'}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
            <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 12px;">${lead}</p>
            <p style="margin:0 0 8px;background:#fff8ec;border:1px solid #f0d9a8;padding:10px 12px;border-radius:6px;">
              <strong>${escapeHtml(clientName)}</strong> &middot; ${escapeHtml(dateOfService)}
            </p>
            <p style="margin:0 0 4px;color:#5c6b7a;font-size:13px;">${escapeHtml(reviewerName)} wrote:</p>
            <p style="margin:0 0 16px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;white-space:pre-wrap;">${message ? escapeHtml(message) : '<em>(no message)</em>'}</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${LOGIN_URL}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Sign in to respond</a>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:13px;line-height:1.6;color:#5c6b7a;">
            <p style="margin:12px 0 0;">When you sign in, the portal will take you straight to it so you can reply${isCorrection ? ' or update the note' : ''}. Please respond as soon as you can.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#7f8c8d;">
            ${escapeHtml(orgName)} staff portal &middot; <a href="${LOGIN_URL}" style="color:#1a3a5c;">${LOGIN_URL}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${firstName},

${reviewerName} ${isFollowUp ? 'added a follow-up question on a note awaiting your reply' : `flagged one of your progress notes for ${noun}`}:

${clientName} · ${dateOfService}

${reviewerName} wrote:
${message || '(no message)'}

Sign in to respond: ${LOGIN_URL}

When you sign in, the portal will take you straight to it. Please respond as soon as you can.`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, html, text });
    if (error) {
      console.error('Resend clarification-flag notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend clarification-flag notice threw:', err);
    return { ok: false, error: message };
  }
}
