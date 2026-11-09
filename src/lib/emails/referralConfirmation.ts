import 'server-only';
import { Resend } from 'resend';
import { buildReferralConfirmationHtml } from './referralConfirmationContent';

// Auto-responder sent to the PERSON WHO SUBMITTED a referral (the parent or
// referrer), confirming receipt. Everyone who submits gets the confirmation;
// people who indicated they hope to be paid as their child's caregiver also get
// a clarification section so expectations are set before the team calls.

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const REPLY_TO = 'info@heartandsoulhc.org';
const PHONE = '(678) 644-0337';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value?: string): boolean => !!value && EMAIL_RE.test(value);

export interface ReferralConfirmationInput {
  to: string; // the submitter's email
  submitterName?: string; // for the greeting
  childName?: string; // the referral subject
  seekingPaidCaregiver?: boolean; // include the clarification section
  // Paid request where the family listed both a medical/physical condition and
  // autism or a developmental diagnosis. Adds a paragraph so the autism bullet
  // does not read as a flat "no": paid hours are possible, but only for care
  // tied to the medical condition (see screenMixedPaidCaregiver).
  mixedDiagnosis?: boolean;
  phone?: string; // callback number shown in the email (defaults to PHONE)
}

export interface ReferralConfirmationResult {
  ok: boolean;
  error?: string;
}

export async function sendReferralConfirmation(
  input: ReferralConfirmationInput
): Promise<ReferralConfirmationResult> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  }
  if (!isValidEmail(input.to)) {
    return { ok: false, error: 'Invalid recipient email.' };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const html = buildReferralConfirmationHtml({ ...input, phone: input.phone || PHONE });

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: REPLY_TO,
      subject: 'We Received Your Referral, and What to Expect Next',
      html,
    });
    if (error) {
      console.error('Resend referral-confirmation error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error('Resend referral-confirmation threw:', err);
    return { ok: false, error: message };
  }
}
