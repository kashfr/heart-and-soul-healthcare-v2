/**
 * Notifies reviewers when the AUTHOR of a flagged progress note acts on it:
 * amends the note, or replies in the flag's thread. Recipients are whoever
 * raised the flag, the configured corrections reviewer, and active admins
 * (see notifyReviewersOfFlagActivity in clarificationServer.ts). Copy comes
 * from the pure helper in ../flagActivity so it is unit-tested; this module
 * only renders and sends. Best-effort via Resend, same contract as
 * clarificationFlag.ts. Replaces the former correctionAmended.ts, which only
 * covered the blocking-correction case.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';
import { flagActivityEmailCopy, type FlagActivityContext } from '../flagActivity';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';

export interface FlagActivityNoticeParams extends FlagActivityContext {
  to: string;
  recipientName: string;
  noteUrl: string;
}

export interface FlagActivityNoticeResult {
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

export async function sendFlagActivityNotice(params: FlagActivityNoticeParams): Promise<FlagActivityNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!params.to) {
    return { ok: false, error: 'No recipient email on file.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;

  const firstName = (params.recipientName || '').trim().split(/\s+/)[0] || 'there';
  const copy = flagActivityEmailCopy(params);
  const reply = params.event === 'replied' ? (params.replyText || '').trim() : '';

  const replyHtml = reply
    ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #c8def5;background:#f8fafc;color:#2c3e50;white-space:pre-wrap;">${escapeHtml(reply)}</blockquote>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;color:#1a3a5c;">${escapeHtml(copy.headline)}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
            <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 12px;">${escapeHtml(copy.intro)}</p>
            <p style="margin:0 0 16px;background:#ecfdf5;border:1px solid #a7f3d0;padding:10px 12px;border-radius:6px;">
              <strong>${escapeHtml(params.clientName)}</strong> &middot; ${escapeHtml(params.dateOfService)}
            </p>
            ${replyHtml}
            <p style="margin:0 0 12px;">${escapeHtml(copy.body)}</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${params.noteUrl}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">${escapeHtml(copy.cta)}</a>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#7f8c8d;">
            ${escapeHtml(orgName)} staff portal
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${firstName},

${copy.intro}

${params.clientName} · ${params.dateOfService}
${reply ? `\n"${reply}"\n` : ''}
${copy.body}

${copy.cta}: ${params.noteUrl}`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to: params.to, subject: copy.subject, html, text });
    if (error) {
      console.error('Resend flag-activity notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend flag-activity notice threw:', err);
    return { ok: false, error: message };
  }
}
