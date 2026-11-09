import { emailLogoBlock } from './logo';

// Body of the referral confirmation auto-responder (sent by
// referralConfirmation.ts). Kept free of server-only imports so it can be
// unit tested.

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

export interface ReferralConfirmationContent {
  submitterName?: string;
  childName?: string;
  seekingPaidCaregiver?: boolean;
  mixedDiagnosis?: boolean;
  phone: string;
}

export function buildReferralConfirmationHtml(input: ReferralConfirmationContent): string {
  const phone = input.phone;
  const greetName = firstName(input.submitterName);
  const greeting = greetName ? `Hi ${escapeHtml(greetName)},` : 'Hello,';
  const child = input.childName ? escapeHtml(input.childName) : 'your child';

  const mixedSection =
    input.seekingPaidCaregiver && input.mixedDiagnosis
      ? `
        <p style="margin:10px 0 0;">Your referral lists both a medical or physical condition and autism or a developmental diagnosis, so paid family caregiver hours through GAPP may still be possible. If approved, those hours can cover only the hands-on care your child needs because of the medical or physical condition, not care related to the autism or developmental diagnosis. We will go over this with you during the assessment.</p>`
      : '';

  const paidSection = input.seekingPaidCaregiver
    ? `
      <div style="margin-top:18px;padding:14px 16px;background:#f5f7fa;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 8px;font-weight:600;">A note about being paid to care for your child</p>
        <p style="margin:0 0 10px;">You mentioned you are interested in being paid to help care for your child. We want to be upfront so you know what to expect:</p>
        <ul style="margin:0 0 0 18px;padding:0;">
          <li style="margin-bottom:8px;">In some cases this is possible through the Georgia Pediatric Program (GAPP) Family Caregiver Option, where a parent can be hired and paid for personal support hours. This requires your child to qualify for GAPP (Georgia Medicaid plus medically necessary care), and it is limited to personal support. It does not cover skilled nursing or behavioral health aide services, and foster parents are not eligible.</li>
          <li>If your child has autism, Down syndrome, or a developmental or behavioral diagnosis without those medical needs, the programs to look into are the NOW and COMP waivers through Georgia DBHDD. Under those, a parent of a child under 18 generally cannot be paid, and there is a long waiting list.</li>
        </ul>${mixedSection}
        <p style="margin:10px 0 0;">When we call, we will help you figure out which path fits your child. Having your child&#39;s Georgia Medicaid information and a short summary of their medical or care needs ready will help us move quickly.</p>
      </div>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.55;">
      ${emailLogoBlock()}
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">Thank you for reaching out to Heart &amp; Soul Healthcare. We received your referral for ${child} and our team will review it and contact you within 1 to 2 business days.</p>
      ${paidSection}
      <p style="margin:18px 0 0;">Questions? Reply to this email or call us at ${phone}.</p>
      <p style="margin:14px 0 0;color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare</p>
    </div>`;

  return html;
}
