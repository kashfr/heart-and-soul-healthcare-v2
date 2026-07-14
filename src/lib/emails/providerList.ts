import 'server-only';
import { Resend } from 'resend';
import { buildProviderListEmail, type ProviderListEmailInput } from './providerListContent';

// Sender for the "GAPP provider list" email (see providerListContent.ts for the
// copy). Sent to the FAMILY when no partner agency matches their referral, as
// the final rung of the refer-out triage ladder.

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const REPLY_TO = 'info@heartandsoulhc.org';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendProviderListInput extends ProviderListEmailInput {
  to: string;
}

export async function sendProviderListEmail(
  input: SendProviderListInput
): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!input.to || !EMAIL_RE.test(input.to)) {
    return { ok: false, error: 'Invalid recipient email.' };
  }

  const { subject, html } = buildProviderListEmail(input);
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error('Resend provider-list error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error('Resend provider-list threw:', err);
    return { ok: false, error: message };
  }
}
