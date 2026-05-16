/**
 * Sends a staff-invitation email via Resend.
 *
 * Used by the create-staff and resend-link API routes so admins don't have to
 * copy a link and paste it into their mail client. The same Resend setup
 * (RESEND_API_KEY + notifications@heartandsoulhc.org) that powers the contact
 * form and referral flow handles this.
 *
 * Returns `{ ok }` so the caller can surface success or fall back to "copy
 * link, send manually" if Resend rejects the send.
 */
import { Resend } from 'resend';

const FROM_EMAIL = 'Heart and Soul Healthcare <notifications@heartandsoulhc.org>';
const SIGNIN_URL = 'https://www.heartandsoulhc.org/login';

export type StaffInviteRole = 'admin' | 'supervisor' | 'nurse';

export interface StaffInviteParams {
  to: string;
  displayName: string;
  role: StaffInviteRole;
  resetLink: string;
  /** True when we're regenerating a link for an existing user, false on first invite. */
  isResend?: boolean;
}

export interface StaffInviteResult {
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

function roleLabel(role: StaffInviteRole): string {
  return role === 'admin' ? 'an Admin' : role === 'supervisor' ? 'a Supervisor' : 'a Nurse';
}

export async function sendStaffInvite({
  to,
  displayName,
  role,
  resetLink,
  isResend = false,
}: StaffInviteParams): Promise<StaffInviteResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const subject = isResend
    ? 'Your Heart and Soul Healthcare password reset link'
    : 'Welcome to Heart and Soul Healthcare — set up your account';

  const intro = isResend
    ? `Here's a fresh password reset link for your Heart and Soul Healthcare staff portal account.`
    : `You've been invited to the Heart and Soul Healthcare staff portal as ${roleLabel(role)}. Click the button below to set your password and finish setting up your account.`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2c3e50;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 20px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="margin:0;font-size:20px;color:#1a3a5c;">${isResend ? 'Password reset link' : 'Welcome to Heart and Soul Healthcare'}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#2c3e50;">
                <p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
                <p style="margin:0 0 20px;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 8px;">
                <a href="${resetLink}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">Set up your password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;font-size:13px;line-height:1.6;color:#5c6b7a;">
                <p style="margin:16px 0 8px;">Or paste this link into your browser:</p>
                <p style="margin:0 0 16px;word-break:break-all;color:#1a3a5c;">${escapeHtml(resetLink)}</p>
                <p style="margin:16px 0 0;color:#7f8c8d;">This link expires in about an hour. If it expires before you use it, head to <a href="${SIGNIN_URL}" style="color:#1a3a5c;">${SIGNIN_URL}</a> and click <strong>Forgot password?</strong> under the Sign in button to send yourself a fresh one.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#7f8c8d;">
                Once your password is set, sign in at <a href="${SIGNIN_URL}" style="color:#1a3a5c;">${SIGNIN_URL}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${firstName},\n\n${intro.replace(/<[^>]+>/g, '')}\n\nSet up your password: ${resetLink}\n\nThis link expires in about an hour. If it expires before you use it, go to ${SIGNIN_URL} and click "Forgot password?" to send yourself a fresh one.\n\nOnce your password is set, sign in at ${SIGNIN_URL}.`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('Resend staff-invite error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Resend staff-invite threw:', err);
    return { ok: false, error: message };
  }
}
