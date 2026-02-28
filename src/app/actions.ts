'use server';

import { Resend } from 'resend';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { createClickUpTask } from '@/lib/clickup';

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

// Format phone number for ClickUp (requires +1 XXX-XXX-XXXX format for US numbers)
function formatPhoneForClickUp(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle US numbers (10 digits) - add +1 prefix and parens
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  // Handle numbers that already have country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  
  // If we can't parse it, return as-is (will fail ClickUp validation, but phone is in description anyway)
  return phone;
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
      Date: new Date().toISOString(),
      Name: name,
      Email: email,
      Phone: phone,
      Subject: subject,
      Message: message,
    });



    // 3. Create ClickUp Task
    const listId = process.env.CLICKUP_CONTACT_LIST_ID;
    if (listId) {
      await createClickUpTask(listId, {
        name: `Inquiry from ${name}`,
        // Description removed as all data is now mapped to custom fields
        notify_all: true,
        custom_fields: [
          { id: '57404b26-2c48-422c-afdb-c13f0dd1d9b7', value: name },            // Contact Name
          { id: '5110081d-90c9-434f-b92c-313663f771cf', value: email },           // Contact Email
          { id: '76faf960-c5c6-4bc4-9ff5-efeebbe9f8ba', value: formatPhoneForClickUp(phone) }, // Contact Phone (formatted text)
          { id: 'b616a16a-d597-4952-bc6f-02f99bced1c9', value: subject },         // Subject
          { id: 'e355f265-3271-44a9-9a56-10a40ddad778', value: message },         // Message
          { id: '51074c19-7d33-4462-a67e-56230d686d8b', value: Date.now() },      // Inquiry Date (Unix timestamp)
        ]
      });
    }

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

  try {
    // 1. Send Email
    const { data: result, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFICATION_EMAIL,
      replyTo: referrer.email,
      subject: `New Client Referral: ${client.firstName} ${client.lastName}`,
      html: `
        <h2>New Client Referral</h2>

        <h3>Client Information</h3>
        <p><strong>Name:</strong> ${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}</p>
        <p><strong>DOB:</strong> ${escapeHtml(client.dob)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(client.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(client.email)}</p>

        <h3>Program & Insurance</h3>
        <p><strong>Program Interest:</strong> ${escapeHtml(program.interest)}</p>

        <h3>Referrer Information</h3>
        <p><strong>Name:</strong> ${escapeHtml(referrer.name)}</p>
        <p><strong>Organization:</strong> ${escapeHtml(referrer.organization || 'N/A')}</p>

        <h3>Details</h3>
        <p><strong>Urgency:</strong> ${escapeHtml(details.urgency)}</p>
        <p><strong>Service Needs:</strong> ${escapeHtml(details.serviceNeeds)}</p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error(error.message);
    }

    // 2. Add to Google Sheet
    await addToGoogleSheet('Referral Submissions', {
      Date: new Date().toISOString(),
      'Client Name': `${client.firstName} ${client.lastName}`,
      'Client Phone': client.phone,
      'Client Email': client.email,
      'Program': program.interest,
      'Referrer Name': referrer.name,
      'Referrer Source': referrer.source,
      'Referrer Org': referrer.organization,
      'Urgency': details.urgency,
      'Service Needs': details.serviceNeeds
    });



    // 3. Create ClickUp Task
    const referralListId = process.env.CLICKUP_REFERRAL_LIST_ID;
    if (referralListId) {
      await createClickUpTask(referralListId, {
        name: `Referral: ${client.firstName} ${client.lastName}`,
        // Description removed as data is mapped to custom fields
        priority: details.urgency === 'immediate' ? 1 : 3, // 1 is Urgent, 3 is Normal
        notify_all: true,
        custom_fields: [
          { id: '9bf2cd0d-5ef4-4ebb-8522-f77e01985eb0', value: `${client.firstName} ${client.lastName}` }, // Referred Client Name
          { id: 'c02afbc9-b9b2-43b8-ad05-f74fe91dbbbf', value: new Date(new Date().toDateString()).getTime() }, // Referral Date (Today at midnight local)
          { id: '6668647f-6d01-4cfc-8b7b-04b56c819f8a', value: new Date(client.dob).getTime() }, // Client Date of Birth
          { id: 'bdac05ff-f0b8-4a99-ba28-6fcb46927cef', value: formatPhoneForClickUp(client.phone) }, // Client Phone
          { id: 'c8d866c9-2ea6-4f2f-9c66-9ab57d33639b', value: client.email },    // Client Email
          { id: '6749e013-8b78-4ca1-9f55-30525f4839e9', value: program.interest }, // Program Interest
          { id: '29489448-c512-4abc-8cc2-b7559391f8b2', value: referrer.name },   // Referrer Name
          { id: 'fff148ee-ebb0-46fb-be07-e4e2abdc4a66', value: referrer.organization || '' }, // Referrer Organization
          { id: '84d9a6f5-c7a0-4c9f-820f-c4de7be2ba57', value: details.urgency }, // Urgency
          { id: '1553a6b0-7a54-4747-9ff3-667ad669cfeb', value: details.serviceNeeds } // Service Needs
        ]
      });
    }

    return { success: true, id: result?.id };
  } catch (error) {
    console.error('Failed to process referral submission:', error);
    throw new Error('Failed to submit referral');
  }
}
