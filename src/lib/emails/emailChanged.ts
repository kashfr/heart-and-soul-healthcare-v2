/**
 * Sends a heads-up email to a staff member's *previous* email address after
 * an admin/supervisor changes their account email. Belt-and-suspenders for
 * account-takeover scenarios: if the change was made by a bad actor, the
 * legitimate owner sees this and can flag it before losing access.
 *
 * Mirrors the same Resend setup that powers the contact + invite flows.
 * Failure to send is non-fatal — the underlying email change has already
 * succeeded; this notification is best-effort.
 */
import { Resend } from 'resend';
import { getServerSettings } from '../settingsServer';

// The actual from-email *address* stays env-pinned because changing
// it requires DNS/SPF/DKIM updates that go beyond a settings toggle.
// The human-readable display name (the text before the angle bracket)
// is configurable via /admin/settings → Branding.
const FROM_ADDRESS = 'notifications@heartandsoulhc.org';
const SIGNIN_URL = 'https://www.heartandsoulhc.org/login';

export interface EmailChangedParams {
  /** The OLD address the change is being announced to. */
  to: string;
  /** Staff member whose email was changed. */
  displayName: string;
  /** The NEW email now on file. */
  newEmail: string;
  /** Display name of the admin/supervisor who performed the change. */
  changedByName: string;
}

export interface EmailChangedResult {
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

export async function sendEmailChangedNotice({
  to,
  displayName,
  newEmail,
  changedByName,
}: EmailChangedParams): Promise<EmailChangedResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const firstName = displayName.split(/\s+/)[0] || displayName;

  // Branding + subject pulled from /admin/settings so admin can rename
  // the org or tune the subject line without a deploy. mergeWithDefaults
  // guarantees orgName + subject are non-empty strings.
  const settings = await getServerSettings();
  const orgName = settings.branding.orgName;
  const fromDisplay = settings.branding.fromEmailDisplay || orgName;
  const subject = settings.emails.subjects.emailChanged;
  const fromEmail = `${fromDisplay} <${FROM_ADDRESS}>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0;font-size:20px;color:#1a3a5c;">Your account email was changed</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
                <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
                <p style="margin:0 0 16px;">
                  An administrator (${escapeHtml(changedByName)}) just changed the email on your
                  ${escapeHtml(orgName)} staff portal account. From now on you'll sign in with:
                </p>
                <p style="margin:0 0 20px;padding:10px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#1a3a5c;">
                  ${escapeHtml(newEmail)}
                </p>
                <p style="margin:0 0 16px;">
                  Your password and all of your existing notes are unchanged.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;font-size:13px;line-height:1.6;color:#7c2d12;background:#fffbeb;border-top:1px solid #fde68a;border-bottom:1px solid #fde68a;">
                <strong>If you did not request this change,</strong> contact your administrator
                immediately. Someone may have made a change to your account without your knowledge.
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f8fafc;font-size:12px;color:#7f8c8d;">
                Sign in at <a href="${SIGNIN_URL}" style="color:#1a3a5c;">${SIGNIN_URL}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${firstName},\n\nAn administrator (${changedByName}) just changed the email on your ${orgName} staff portal account. From now on you'll sign in with:\n\n  ${newEmail}\n\nYour password and all of your existing notes are unchanged.\n\nIf you did NOT request this change, contact your administrator immediately.\n\nSign in at ${SIGNIN_URL}`;

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('Resend email-changed notice error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend email-changed notice threw:', err);
    return { ok: false, error: message };
  }
}
