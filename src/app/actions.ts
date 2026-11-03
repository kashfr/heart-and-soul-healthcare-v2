'use server';

import { Resend } from 'resend';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { createReferral } from '@/lib/referrals';
import { referralPortalButtonHtml } from '@/lib/emails/referralPortalLink';
import { sendReferralConfirmation } from '@/lib/emails/referralConfirmation';
import { formatDateUS } from '@/lib/dateFormat';
import { buildHsReferral, hsRefusal, type HsAnswers } from '@/lib/websiteIntake';
import { emailLogoBlock } from '@/lib/emails/logo';

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFICATION_EMAIL = 'info@heartandsoulhc.org';
const FROM_EMAIL = 'notifications@heartandsoulhc.org';

// Escape user-supplied strings before embedding in HTML email bodies
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function addToGoogleSheet(sheetName: string, rowData: any) {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SHEET_ID) {
      console.warn('Google Sheets credentials missing. Skipping Sheet update.');
      return;
    }

    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    let sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) {
      // Create sheet if it doesn't exist
      sheet = await doc.addSheet({ title: sheetName });
      // Set header row based on keys
      await sheet.setHeaderRow(Object.keys(rowData));
    }

    await sheet.addRow(rowData);
  } catch (error) {
    console.error(`Error adding to Google Sheet (${sheetName}):`, error);
    // Don't throw, so we don't block the user response if sheets fail but email succeeds
  }
}

export async function processContactSubmission(data: any) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY environment variable');
  }

  const { name, email, phone, subject, message } = data;

  try {
    // 1. Send Email
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      replyTo: email,
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        ${emailLogoBlock()}
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <h3>Message:</h3>
        <p>${escapeHtml(message)}</p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }

    // 2. Add to Google Sheet
    await addToGoogleSheet('Contact Submissions', {
      Date: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
      Name: name,
      Email: email,
      Phone: phone,
      Subject: subject,
      Message: message,
    });

    return { success: true, id: result?.id };
  } catch (error) {
    console.error('Failed to process contact submission:', error);
    throw new Error('Failed to submit form');
  }
}

export async function processReferralSubmission(data: any) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Missing RESEND_API_KEY environment variable');
  }

  const { client, program, referrer, details } = data;
  const physician = (data.physician ?? {}) as { name?: string; office?: string; phone?: string; fax?: string };

  // Hard stops (GAPP only), same rules as the GAPP site and the portal intake:
  // the paid-caregiver dead ends, and declining agency staff, are refused
  // before any email, CRM, or referral record is created. The form blocks
  // these client-side; this is the backstop for anything that bypasses it.
  // Returned, not thrown, so the page can show the reason. The rules live in
  // src/lib/websiteIntake.ts, shared with staff edits of the screened answers.
  const answers: HsAnswers = { client, program, referrer, details, physician: data.physician ?? {} };
  const refusal = hsRefusal(answers);
  if (refusal) {
    return { success: false, refused: refusal.code, error: refusal.reason };
  }

  try {
    // 1. Store in the unified referrals collection so it appears in the admin
    // Referrals tab alongside referrals forwarded from the GAPP site. Done
    // before the email so the email can link straight to the card. Non-fatal:
    // a storage failure must never block the email/Sheets flow (the
    // email then just goes out without the link).
    let storedId: string | null = null;
    try {
      // The card is built by the shared builder (src/lib/websiteIntake.ts),
      // and the answers are kept on the referral so staff edits of the
      // screened answers can be re-screened and rebuilt the same way.
      const stored = await createReferral({
        source: 'hs-website',
        ...buildHsReferral(answers),
        intakeAnswers: answers,
      });
      storedId = stored.id;
    } catch (storeErr) {
      console.error('Referral Firestore store failed (non-fatal):', storeErr);
    }

    // 2. Send Email
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      replyTo: referrer.email,
      subject: `New Client Referral: ${client.firstName} ${client.lastName}`,
      html: `
        ${emailLogoBlock()}
        <h2>New Client Referral</h2>

        <h3>Client Information</h3>
        <p><strong>Name:</strong> ${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}</p>
        <p><strong>DOB:</strong> ${escapeHtml(formatDateUS(client.dob ?? ''))}</p>
        <p><strong>Phone:</strong> ${escapeHtml(client.phone)}</p>
        <p><strong>Secondary Phone:</strong> ${escapeHtml(client.secondaryPhone || 'N/A')}</p>
        <p><strong>Email:</strong> ${escapeHtml(client.email)}</p>
        <p><strong>Address:</strong> ${escapeHtml(client.address || '')}${client.city ? ', ' + escapeHtml(client.city) : ''}${client.state ? ', ' + escapeHtml(client.state) : ''} ${escapeHtml(client.zip || '')}</p>
        <p><strong>County:</strong> ${escapeHtml(client.county || 'N/A')}</p>

        <h3>Program & Insurance</h3>
        <p><strong>Program Interest:</strong> ${escapeHtml(program.interest)}</p>
        <p><strong>Medicaid #:</strong> ${escapeHtml(program.medicaidNumber || 'N/A')}</p>
        <p><strong>Insurance Provider:</strong> ${escapeHtml(program.insuranceProvider || 'N/A')}</p>
        <p><strong>Insurance Policy #:</strong> ${escapeHtml(program.insuranceNumber || 'N/A')}</p>

        <h3>Child's Physician</h3>
        <p><strong>Name:</strong> ${escapeHtml(physician.name || 'N/A')}</p>
        <p><strong>Office:</strong> ${escapeHtml(physician.office || 'N/A')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(physician.phone || 'N/A')}</p>
        <p><strong>Fax:</strong> ${escapeHtml(physician.fax || 'N/A')}</p>

        <h3>Referrer Information</h3>
        <p><strong>Source:</strong> ${escapeHtml(referrer.source || 'N/A')}</p>
        <p><strong>Name:</strong> ${escapeHtml(referrer.name)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(referrer.phone || 'N/A')}</p>
        <p><strong>Email:</strong> ${escapeHtml(referrer.email || 'N/A')}</p>
        <p><strong>Organization:</strong> ${escapeHtml(referrer.organization || 'N/A')}</p>

        <h3>Details</h3>
        <p><strong>Urgency:</strong> ${escapeHtml(details.urgency)}</p>
        <p><strong>Service Needs:</strong> ${escapeHtml(details.serviceNeeds || 'N/A')}</p>
        <p><strong>Additional Notes:</strong> ${escapeHtml(details.additionalNotes || 'N/A')}</p>
        ${storedId ? referralPortalButtonHtml(storedId) : ''}
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }


    // 1.6 Confirmation auto-responder to the submitter (non-fatal). Goes to the
    // referrer's email if given, otherwise the client/contact email.
    try {
      const childName = `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim();
      await sendReferralConfirmation({
        to: referrer.email || client.email,
        submitterName: referrer.name || childName,
        childName,
        seekingPaidCaregiver: details.seekingPaidCaregiver === 'yes',
      });
    } catch (confirmErr) {
      console.error('Referral confirmation email failed (non-fatal):', confirmErr);
    }

    // 3. Add to Google Sheet
    await addToGoogleSheet('Referral Submissions', {
      Date: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
      'Client Name': `${client.firstName} ${client.lastName}`,
      'Client DOB': formatDateUS(client.dob ?? ''),
      'Client Phone': client.phone,
      'Client Secondary Phone': client.secondaryPhone,
      'Client Email': client.email,
      'Client Address': client.address,
      'Client City': client.city,
      'Client State': client.state,
      'Client ZIP': client.zip,
      'Client County': client.county,
      'Program': program.interest,
      'Medicaid Number': program.medicaidNumber,
      'Insurance Provider': program.insuranceProvider,
      'Insurance Policy #': program.insuranceNumber,
      'Referral Source': referrer.source,
      'Referrer Name': referrer.name,
      'Referrer Phone': referrer.phone,
      'Referrer Email': referrer.email,
      'Referrer Org': referrer.organization,
      'Urgency': details.urgency,
      'Service Needs': details.serviceNeeds,
      'Additional Notes': details.additionalNotes,
    });

    return { success: true, id: result?.id };
  } catch (error) {
    console.error('Failed to process referral submission:', error);
    throw new Error('Failed to submit referral');
  }
}
