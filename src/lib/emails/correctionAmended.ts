/**
 * Notifies the corrections reviewer (and admins) when a nurse AMENDS a note
 * that is blocking her from new documentation. The block does NOT lift on its
 * own — the reviewer must verify the amendment actually fixes what was
 * flagged, then remove the block (or resolve the flag) from the note's
 * correction panel. Best-effort via Resend, same contract as
 * clarificationFlag.ts.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';
import { formatDateUS } from '../dateFormat';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';

export interface CorrectionAmendedNoticeParams {
  to: string;
  recipientName: string;
  nurseName: string;
  clientName: string;
  dateOfService: string;
  noteUrl: string;
}

export interface CorrectionAmendedNoticeResult {
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

export async function sendCorrectionAmendedNotice({
  to,
  recipientName,
  nurseName,
  clientName,
  dateOfService,
  noteUrl,
}: CorrectionAmendedNoticeParams): Promise<CorrectionAmendedNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!to) {
    return { ok: false, error: 'No recipient email on file.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;

  const firstName = (recipientName || '').trim().split(/\s+/)[0] || 'there';
  const subject = `Flagged note corrected: ${clientName} (${formatDateUS(dateOfService)})`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;color:#1a3a5c;">A flagged note was corrected</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
            <p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 12px;">${escapeHtml(nurseName)} amended a progress note you flagged for correction:</p>
            <p style="margin:0 0 16px;background:#ecfdf5;border:1px solid #a7f3d0;padding:10px 12px;border-radius:6px;">
              <strong>${escapeHtml(clientName)}</strong> &middot; ${escapeHtml(formatDateUS(dateOfService))}
            </p>
            <p style="margin:0 0 12px;">Her block on new documentation is STILL IN PLACE. Please review the amendment (every change is listed in the note's amendment history). If it fixes what you flagged, remove the block or mark the correction resolved; both let her document again. If it does not, add a follow-up telling her exactly what still needs to change.</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${noteUrl}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Review the amendment</a>
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

${nurseName} amended a progress note you flagged for correction:

${clientName} · ${formatDateUS(dateOfService)}

Her block on new documentation is STILL IN PLACE. Please review the amendment. If it fixes what you flagged, remove the block or mark the correction resolved; both let her document again. If it does not, add a follow-up telling her exactly what still needs to change.

Review the amendment: ${noteUrl}`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, html, text });
    if (error) {
      console.error('Resend correction-amended notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend correction-amended notice threw:', err);
    return { ok: false, error: message };
  }
}
