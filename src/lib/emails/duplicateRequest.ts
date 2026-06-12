/**
 * Notifies admins + supervisors when a nurse requests approval to submit a
 * second note for a client she's already documented on that date. Best-effort
 * via Resend — the request is recorded regardless; this just gives reviewers a
 * heads-up so they can act from the In Progress screen.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';
const IN_PROGRESS_URL = 'https://www.heartandsoulhc.org/admin/in-progress';

export interface DuplicateRequestNoticeParams {
  to: string[];
  nurseName: string;
  clientName: string;
  dateOfService: string;
  reason: string;
}

export interface DuplicateRequestNoticeResult {
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

export async function sendDuplicateRequestNotice({
  to,
  nurseName,
  clientName,
  dateOfService,
  reason,
}: DuplicateRequestNoticeParams): Promise<DuplicateRequestNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (to.length === 0) {
    return { ok: false, error: 'No admin/supervisor recipients found.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;
  const subject = `Duplicate-note approval needed — ${clientName} (${dateOfService})`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;color:#1a3a5c;">Duplicate-note approval needed</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
            <p style="margin:0 0 12px;"><strong>${escapeHtml(nurseName)}</strong> is asking to submit a <strong>second</strong> progress note for a client already documented on this date:</p>
            <p style="margin:0 0 8px;background:#fff8ec;border:1px solid #f0d9a8;padding:10px 12px;border-radius:6px;">
              <strong>${escapeHtml(clientName)}</strong> &middot; ${escapeHtml(dateOfService)}
            </p>
            <p style="margin:0 0 4px;color:#5c6b7a;font-size:13px;">Reason given:</p>
            <p style="margin:0 0 16px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;">${reason ? escapeHtml(reason) : '<em>(no reason given)</em>'}</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${IN_PROGRESS_URL}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Review in In&nbsp;Progress</a>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:13px;line-height:1.6;color:#5c6b7a;">
            <p style="margin:12px 0 0;">Approve or deny it on the In Progress screen. They can keep working but can&apos;t submit the second note until it&apos;s approved.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#7f8c8d;">
            ${escapeHtml(orgName)} staff portal &middot; <a href="${IN_PROGRESS_URL}" style="color:#1a3a5c;">${IN_PROGRESS_URL}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `${nurseName} is asking to submit a second progress note for a client already documented on this date:\n\n${clientName} · ${dateOfService}\n\nReason: ${reason || '(none given)'}\n\nApprove or deny it on the In Progress screen: ${IN_PROGRESS_URL}`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, html, text });
    if (error) {
      console.error('Resend duplicate-request notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend duplicate-request notice threw:', err);
    return { ok: false, error: message };
  }
}
