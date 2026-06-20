import 'server-only';
import { Resend } from 'resend';

// Auto-responder sent to the PERSON WHO SUBMITTED a referral (the parent or
// referrer), confirming receipt. Everyone who submits gets the confirmation;
// people who indicated they hope to be paid as their child's caregiver also get
// a clarification section so expectations are set before the team calls.

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const REPLY_TO = 'info@heartandsoulhc.org';
const PHONE = '(678) 644-0337';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (value?: string): boolean => !!value && EMAIL_RE.test(value);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(full?: string): string {
  const n = (full || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

export interface ReferralConfirmationInput {
  to: string; // the submitter's email
  submitterName?: string; // for the greeting
  childName?: string; // the referral subject
  seekingPaidCaregiver?: boolean; // include the clarification section
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
  const phone = input.phone || PHONE;
  const greetName = firstName(input.submitterName);
  const greeting = greetName ? `Hi ${escapeHtml(greetName)},` : 'Hello,';
  const child = input.childName ? escapeHtml(input.childName) : 'your child';

  const paidSection = input.seekingPaidCaregiver
    ? `
      <div style="margin-top:18px;padding:14px 16px;background:#f5f7fa;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 8px;font-weight:600;">A note about being paid to care for your child</p>
        <p style="margin:0 0 10px;">You mentioned you are interested in being paid to help care for your child. We want to be upfront so you know what to expect:</p>
        <ul style="margin:0 0 0 18px;padding:0;">
          <li style="margin-bottom:8px;">In some cases this is possible through the Georgia Pediatric Program (GAPP) Family Caregiver Option, where a parent can be hired and paid for personal support hours. This requires your child to qualify for GAPP (Georgia Medicaid plus medically necessary care), and it is limited to personal support. It does not cover skilled nursing or behavioral health aide services, and foster parents are not eligible.</li>
          <li>If your child has autism, Down syndrome, or a developmental or behavioral diagnosis without those medical needs, the programs to look into are the NOW and COMP waivers through Georgia DBHDD. Under those, a parent of a child under 18 generally cannot be paid, and there is a long waiting list.</li>
        </ul>
        <p style="margin:10px 0 0;">When we call, we will help you figure out which path fits your child. Having your child&#39;s Georgia Medicaid information and a short summary of their medical or care needs ready will help us move quickly.</p>
      </div>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">Thank you for reaching out to Heart &amp; Soul Healthcare. We received your referral for ${child} and our team will review it and contact you within 1 to 2 business days.</p>
      ${paidSection}
      <p style="margin:18px 0 0;">Questions? Reply to this email or call us at ${phone}.</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare</p>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      replyTo: REPLY_TO,
      subject: 'We received your referral, and what to expect next',
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
