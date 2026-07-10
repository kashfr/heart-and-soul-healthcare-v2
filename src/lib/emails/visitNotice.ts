/**
 * Emails a staff member when a visit is assigned to them, cancelled, or put
 * back on the schedule. Companion to the Quo SMS notice — the owner's rule is
 * both channels fire on every scheduling event so nobody can miss one.
 * Best-effort via Resend: the visit itself is saved regardless; a send failure
 * is reported to the caller for the toast, never fatal.
 *
 * PHI-FREE: the body carries only the visit's date/time/type and a portal
 * link — never the client's name or details (same policy as all outbound
 * email/SMS; see visitNotifyShared.ts, which cannot even accept PHI).
 */
import { Resend } from 'resend';
import {
  PORTAL_LOGIN_URL,
  visitEmailBody,
  visitEmailSubject,
  type VisitNotifyEvent,
  type VisitNotifyFacts,
} from '../visitNotifyShared';

const FROM_ADDRESS = 'notifications@heartandsoulhc.org';

export interface VisitNoticeResult {
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

export async function sendVisitNotice(params: {
  to: string;
  recipientName: string;
  event: VisitNotifyEvent;
  facts: VisitNotifyFacts;
}): Promise<VisitNoticeResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!params.to) {
    return { ok: false, error: 'No email on file for this staff member.' };
  }

  const firstName = (params.recipientName || '').trim().split(/\s+/)[0] || '';
  const subject = visitEmailSubject(params.event, params.facts);
  const text = visitEmailBody(params.event, params.facts, firstName);

  const html = `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #2c3e50;">
    <div style="background: #1a3a5c; color: #fff; padding: 14px 20px; border-radius: 8px 8px 0 0; font-weight: 700;">
      Heart and Soul Healthcare
    </div>
    <div style="border: 1px solid #dde3e9; border-top: 0; border-radius: 0 0 8px 8px; padding: 20px;">
      ${text
        .split('\n\n')
        .map((p) => `<p style="margin: 0 0 14px; line-height: 1.5;">${escapeHtml(p).replace(escapeHtml(PORTAL_LOGIN_URL), `<a href="${PORTAL_LOGIN_URL}" style="color:#1a3a5c;">${PORTAL_LOGIN_URL}</a>`)}</p>`)
        .join('')}
    </div>
  </div>`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `Heart and Soul Healthcare <${FROM_ADDRESS}>`,
      to: params.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('Visit notice email failed:', error);
      return { ok: false, error: error.message || 'Email send failed.' };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email send failure.';
    console.error('Visit notice email threw:', err);
    return { ok: false, error: message };
  }
}
