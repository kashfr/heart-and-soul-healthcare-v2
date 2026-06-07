/**
 * Notifies admins when a staff member files a self-service request to change
 * their login email. Best-effort via Resend — the request is recorded on the
 * user's profile regardless; this just gives admins a heads-up so they can
 * approve or dismiss it from Staff & Roles. Email is the auth identity, so the
 * change itself only ever happens when an admin approves.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';
const STAFF_URL = 'https://www.heartandsoulhc.org/admin/users';

export interface EmailChangeRequestNoticeParams {
  to: string[];
  staffName: string;
  currentEmail: string;
  newEmail: string;
  reason: string;
}

export interface EmailChangeRequestNoticeResult {
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

export async function sendEmailChangeRequestNotice({
  to,
  staffName,
  currentEmail,
  newEmail,
  reason,
}: EmailChangeRequestNoticeParams): Promise<EmailChangeRequestNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (to.length === 0) {
    return { ok: false, error: 'No admin recipients found.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;
  const subject = `Email-change approval needed — ${staffName}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;color:#1a3a5c;">Email-change approval needed</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
            <p style="margin:0 0 12px;"><strong>${escapeHtml(staffName)}</strong> has requested a change to their login email address:</p>
            <p style="margin:0 0 8px;background:#f1f5f9;border:1px solid #e2e8f0;padding:10px 12px;border-radius:6px;">
              From: <strong>${escapeHtml(currentEmail)}</strong><br/>
              To: <strong>${escapeHtml(newEmail)}</strong>
            </p>
            <p style="margin:0 0 4px;color:#5c6b7a;font-size:13px;">Reason:</p>
            <p style="margin:0 0 16px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;">${reason ? escapeHtml(reason) : '<em>(no reason given)</em>'}</p>
          </td></tr>
          <tr><td align="center" style="padding:8px 32px 8px;">
            <a href="${STAFF_URL}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Review in Staff &amp; Roles</a>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:13px;line-height:1.6;color:#5c6b7a;">
            <p style="margin:12px 0 0;">Their login does not change until you approve it. Open their record in Staff &amp; Roles to approve or dismiss the request.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#7f8c8d;">
            ${escapeHtml(orgName)} staff portal &middot; <a href="${STAFF_URL}" style="color:#1a3a5c;">${STAFF_URL}</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `${staffName} has requested a change to their login email address:\n\nFrom: ${currentEmail}\nTo: ${newEmail}\n\nReason: ${reason || '(none given)'}\n\nTheir login does not change until you approve it. Review it in Staff & Roles: ${STAFF_URL}`;

  try {
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, html, text });
    if (error) {
      console.error('Resend email-change-request notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend email-change-request notice threw:', err);
    return { ok: false, error: message };
  }
}
