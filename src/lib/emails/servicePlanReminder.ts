/**
 * The daily service plan reminder email (Resend), PHI-free: counts and a
 * portal link only. Best-effort: a send failure is reported, never thrown.
 */
import { Resend } from 'resend';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function sendServicePlanReminderEmail(p: { to: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  if (!p.to) return { ok: false, error: 'No email on file for this staff member.' };
  const html = `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #2c3e50;">
    <div style="background: #1a3a5c; color: #fff; padding: 14px 20px; border-radius: 8px 8px 0 0; font-weight: 700;">Heart and Soul Healthcare</div>
    <div style="border: 1px solid #dde3e9; border-top: 0; border-radius: 0 0 8px 8px; padding: 20px;">
      ${p.body
        .split('\n\n')
        .map((para) => `<p style="margin: 0 0 14px; line-height: 1.5;">${escapeHtml(para).replace(/(https:\/\/[^\s]+)/g, '<a href="$1" style="color:#1a3a5c;">$1</a>')}</p>`)
        .join('')}
    </div>
  </div>`;
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `Heart and Soul Healthcare <${FROM_ADDRESS}>`,
      to: p.to,
      subject: p.subject,
      html,
      text: p.body,
    });
    if (error) return { ok: false, error: error.message || 'Email send failed.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email send failure.' };
  }
}
