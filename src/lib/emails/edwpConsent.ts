import 'server-only';
import { Resend } from 'resend';
import type { EdwpConsentRecord } from '@/lib/edwpConsentServer';
import { PROGRAM_LABEL, serviceLabels, type EdwpProgram } from '@/lib/edwpConsent';
import { formatDateUS } from '@/lib/dateFormat';

// The three emails around the EDWP consent form:
//   1. staff notification when a client signs (PDF attached)
//   2. a copy to the client for their records (PDF attached)
//   3. the "please sign" request a staff member sends from the admin page

const FROM_ADDRESS = 'Heart & Soul Healthcare <notifications@heartandsoulhc.org>';
const NOTIFICATION_EMAIL = 'info@heartandsoulhc.org';
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

export interface EmailResult {
  ok: boolean;
  error?: string;
}

function client(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

async function send(
  label: string,
  payload: Parameters<Resend['emails']['send']>[0]
): Promise<EmailResult> {
  const resend = client();
  if (!resend) return { ok: false, error: 'RESEND_API_KEY not configured on the server.' };
  try {
    const { error } = await resend.emails.send(payload);
    if (error) {
      console.error(`Resend ${label} error:`, error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email failure.';
    console.error(`Resend ${label} threw:`, err);
    return { ok: false, error: message };
  }
}

function pdfFilename(consent: EdwpConsentRecord): string {
  const safe = (consent.clientName || 'client').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  return `EDWP_Consent_${safe || 'client'}.pdf`;
}

function rowsHtml(rows: Array<[string, string]>): string {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;">${value ? escapeHtml(value) : '<span style="color:#9ca3af;">—</span>'}</td>
        </tr>`
    )
    .join('');
}

/** Staff notification: a client just signed. The PDF is the record; the table
 *  is so the gist is readable from a phone without opening it. */
export async function sendEdwpConsentNotification(
  consent: EdwpConsentRecord,
  pdf: Buffer
): Promise<EmailResult> {
  const program = consent.program ? PROGRAM_LABEL[consent.program as EdwpProgram] : '';
  const signer =
    consent.signerType === 'representative'
      ? `${consent.signerName} (${consent.signerRelationship || 'authorized representative'})`
      : `${consent.signerName} (client)`;
  const rows: Array<[string, string]> = [
    ['Client', consent.clientName],
    ['Date of birth', formatDateUS(consent.dob)],
    ['Program', program],
    ['Medicaid ID', consent.medicaidId],
    ['Phone', consent.phone],
    ['Email', consent.email],
    ['Address', consent.address],
    ['Care coordinator', [consent.careCoordinatorName, consent.careCoordinatorAgency, consent.careCoordinatorPhone].filter(Boolean).join(' · ')],
    ['Services requested', serviceLabels(consent.services, consent.servicesOther).join(', ')],
    ['Signed by', signer],
  ];

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">
      <h2 style="margin:0 0 4px;">EDWP consent form signed</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Submitted online via heartandsoulhc.org. The signed PDF is attached.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rowsHtml(rows)}</table>
      <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">
        All signed EDWP consents are listed in the staff portal under EDWP Consents.
      </p>
    </div>`;

  return send('edwp-consent-notification', {
    from: FROM_ADDRESS,
    to: NOTIFICATION_EMAIL,
    replyTo: isValidEmail(consent.email) ? consent.email : undefined,
    subject: `EDWP consent signed: ${consent.clientName || 'Unknown'}`,
    html,
    attachments: [{ filename: pdfFilename(consent), content: pdf }],
  });
}

/** Copy for the client's records, only when they gave us an email. */
export async function sendEdwpConsentCopy(
  consent: EdwpConsentRecord,
  pdf: Buffer
): Promise<EmailResult> {
  if (!isValidEmail(consent.email)) return { ok: false, error: 'No client email on the form.' };
  const first = escapeHtml((consent.signerName || consent.clientName).split(' ')[0] || 'there');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.6;">
      <p style="margin:0 0 12px;">Hi ${first},</p>
      <p style="margin:0 0 12px;">
        Thank you for completing the EDWP client consent form for <strong>${escapeHtml(consent.clientName)}</strong>.
        A copy of the signed form is attached for your records.
      </p>
      <p style="margin:0 0 12px;">
        Our team will review it and be in touch about next steps. If you have any questions, reply to this
        email or call us at ${PHONE}.
      </p>
      <p style="margin:0 0 4px;">Warm regards,</p>
      <p style="margin:0;"><strong>Heart &amp; Soul Healthcare</strong><br/>
        <span style="color:#6b7280;font-size:13px;">1372 Peachtree St NE, Atlanta, GA 30309 · ${PHONE}</span></p>
    </div>`;

  return send('edwp-consent-copy', {
    from: FROM_ADDRESS,
    to: consent.email,
    replyTo: REPLY_TO,
    subject: 'Your Signed EDWP Consent Form',
    html,
    attachments: [{ filename: pdfFilename(consent), content: pdf }],
  });
}

export interface ConsentRequestInput {
  to: string;
  clientName: string;
  link: string;
  sentByName?: string;
  note?: string;
}

/** The "please sign" email staff send from the admin page. */
export async function sendEdwpConsentRequest(input: ConsentRequestInput): Promise<EmailResult> {
  if (!isValidEmail(input.to)) return { ok: false, error: 'A valid email address is required.' };
  const sender = input.sentByName ? escapeHtml(input.sentByName) : 'The Heart & Soul Healthcare team';
  const note = input.note?.trim()
    ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f9fafb;border-left:3px solid #de5b4a;white-space:pre-wrap;">${escapeHtml(input.note.trim())}</p>`
    : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:600px;line-height:1.6;">
      <p style="margin:0 0 12px;">Hello,</p>
      <p style="margin:0 0 12px;">
        Heart &amp; Soul Healthcare is preparing to provide services for <strong>${escapeHtml(input.clientName)}</strong>
        through Georgia's Elderly and Disabled Waiver Program (CCSP / SOURCE). Before we can begin, we need a signed
        client consent form.
      </p>
      ${note}
      <p style="margin:0 0 12px;">
        The form takes about five minutes. You can complete and sign it from a phone, tablet, or computer:
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(input.link)}" style="display:inline-block;background:#de5b4a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">Complete the consent form</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
        If the button does not work, copy and paste this link into your browser:<br/>
        <a href="${escapeHtml(input.link)}" style="color:#4a6fa5;">${escapeHtml(input.link)}</a>
      </p>
      <p style="margin:0 0 12px;">
        If the client is unable to sign, an authorized representative (such as a family member or legal guardian)
        may sign on their behalf. Questions? Reply to this email or call us at ${PHONE}.
      </p>
      <p style="margin:0 0 4px;">Thank you,</p>
      <p style="margin:0;"><strong>${sender}</strong><br/>
        <span style="color:#6b7280;font-size:13px;">Heart &amp; Soul Healthcare · ${PHONE}</span></p>
    </div>`;

  return send('edwp-consent-request', {
    from: FROM_ADDRESS,
    to: input.to,
    replyTo: REPLY_TO,
    subject: `Consent Form for ${input.clientName} from Heart and Soul Healthcare`,
    html,
  });
}
