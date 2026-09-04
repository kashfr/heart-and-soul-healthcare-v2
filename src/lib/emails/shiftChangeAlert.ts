/**
 * Alerts the RN supervisor (and anyone else picked under Settings → Shift-change
 * alerts) when a nurse answers Yes to a "since your last shift" question:
 * hospital admission, urgent care / ER visit, or a medication started, changed,
 * or stopped. Copy comes from the pure helper in ../shiftChange so it is
 * unit-tested; this module only renders and sends. Best-effort via Resend,
 * same contract as the other notices in this folder. Email carries the client
 * name, date, answers, and the nurse's details text; the SMS counterpart is
 * PHI-free.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';
import { shiftChangeEmailCopy, excerptDetails, type ShiftChangeAlertContext } from '../shiftChange';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';

export interface ShiftChangeAlertParams extends ShiftChangeAlertContext {
  to: string;
  recipientName: string;
  noteUrl: string;
  /** Link to the client's MAR grid; empty when the note has no roster client. */
  marUrl: string;
}

export interface ShiftChangeAlertResult {
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

export async function sendShiftChangeAlert(params: ShiftChangeAlertParams): Promise<ShiftChangeAlertResult> {
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
  const copy = shiftChangeEmailCopy(params);
  const details = excerptDetails(params.report.details);

  const answersHtml = copy.answers
    .map((a) => {
      const yes = a.endsWith(': Yes');
      return `<li style="margin:0 0 4px;${yes ? 'font-weight:700;color:#7c2d12;' : 'color:#5c6b7a;'}">${escapeHtml(a)}</li>`;
    })
    .join('');
  const detailsHtml = details
    ? `<p style="margin:0 0 6px;font-size:13px;color:#5c6b7a;">Details from the nurse:</p><blockquote style="margin:0 0 16px;padding:10px 14px;border-left:4px solid #f0d9a8;background:#fff8ec;color:#2c3e50;white-space:pre-wrap;">${escapeHtml(details)}</blockquote>`
    : '';
  const marBtn = params.marUrl
    ? `<a href="${params.marUrl}" style="display:inline-block;background:#ffffff;color:#1a3a5c;border:1px solid #1a3a5c;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:15px;margin-left:10px;">Open the MAR</a>`
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
            <p style="margin:0 0 12px;background:#fff7ed;border:1px solid #f59e0b;padding:10px 12px;border-radius:6px;">
              <strong>${escapeHtml(params.clientName)}</strong> &middot; ${escapeHtml(params.dateOfService)}
            </p>
            <ul style="margin:0 0 16px;padding-left:20px;">${answersHtml}</ul>
            ${detailsHtml}
            <p style="margin:0 0 12px;">${escapeHtml(copy.body)}</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${params.noteUrl}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Open the note</a>${marBtn}
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

${copy.answers.map((a) => `- ${a}`).join('\n')}
${details ? `\nDetails from the nurse:\n"${details}"\n` : ''}
${copy.body}

Open the note: ${params.noteUrl}${params.marUrl ? `\nOpen the MAR: ${params.marUrl}` : ''}`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to: params.to, subject: copy.subject, html, text });
    if (error) {
      console.error('Resend shift-change alert error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend shift-change alert threw:', err);
    return { ok: false, error: message };
  }
}
