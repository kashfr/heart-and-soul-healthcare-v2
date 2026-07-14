// Pure content builder for the "GAPP provider list" email sent to a family
// when no partner agency can take their referral. Split from the sender (which
// is server-only) so the copy is unit-testable.
//
// Copy rules: family-facing and warm; no PHI in the subject; and NO em or en
// dashes anywhere (the user's writing style: sent under the org's name, dashes
// read as AI-written). The test suite enforces the dash rule.

import { PROVIDER_LIST_URL } from '../shareLink';

const PHONE = '(678) 644-0337';

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

export interface ProviderListEmailInput {
  /** Family contact name for the greeting (falls back to "Hello,"). */
  familyName?: string;
  /** The child the referral is about (falls back to "your child"). */
  childName?: string;
  /** Callback number shown in the email. */
  phone?: string;
}

export interface ProviderListEmailContent {
  subject: string;
  html: string;
}

export function buildProviderListEmail(input: ProviderListEmailInput): ProviderListEmailContent {
  const phone = input.phone || PHONE;
  const greetName = firstName(input.familyName);
  const greeting = greetName ? `Hi ${escapeHtml(greetName)},` : 'Hello,';
  const child = input.childName ? escapeHtml(input.childName) : 'your child';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">Thank you for reaching out to Heart &amp; Soul Healthcare about ${child}. After reviewing your referral, we are not able to take it on at this time.</p>
      <p style="margin:0 0 12px;">We do not want that to slow down your search for care. Georgia Medicaid publishes an official list of approved GAPP providers, with each provider&#39;s address and phone number. You can view and download it here:</p>
      <p style="margin:0 0 16px;">
        <a href="${PROVIDER_LIST_URL}" style="display:inline-block;background:#1a3a5c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">View the GAPP provider list (PDF)</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br />${PROVIDER_LIST_URL}</p>
      <p style="margin:0 0 12px;">Coverage areas change often, so we recommend calling a few providers directly to confirm they serve your county and are accepting new clients.</p>
      <p style="margin:0 0 12px;">If your situation changes or you have any questions, reply to this email or call us at ${phone}. We are sorry we could not help this time, and we wish your family the very best.</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare</p>
    </div>`;

  return {
    subject: 'A list of GAPP providers for your family',
    html,
  };
}
