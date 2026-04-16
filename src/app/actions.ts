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

// Map form referral source values to ClickUp dropdown option UUIDs
const REFERRAL_SOURCE_OPTIONS: Record<string, string> = {
  'hospital': '88a91cb6-b878-4b2f-bfc7-9621ba7fa0d0',       // Hospital / Medical Facility
  'physician': 'f230bd9c-8f13-4833-a5d4-10908790f672',       // Physician / Healthcare Provider
  'case-manager': '3b6dee3d-4a28-4e5d-8ae2-bf1caa1b824b',    // Case Manager / Support Coordinator
  'family': 'fc3e314c-df5b-4108-b6d6-e22fe9fcf176',          // Family Member
  'self': '093c100e-e7c0-4378-9c59-235c72cac37a',            // Self-Referral
  'other': '95b9966f-50f3-436d-826e-821a2bab4014',           // Other
};

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
        <p><strong>Secondary Phone:</strong> ${escapeHtml(client.secondaryPhone || 'N/A')}</p>
        <p><strong>Email:</strong> ${escapeHtml(client.email)}</p>
        <p><strong>Address:</strong> ${escapeHtml(client.address || '')}${client.city ? ', ' + escapeHtml(client.city) : ''}${client.state ? ', ' + escapeHtml(client.state) : ''} ${escapeHtml(client.zip || '')}</p>
        <p><strong>County:</strong> ${escapeHtml(client.county || 'N/A')}</p>

        <h3>Program & Insurance</h3>
        <p><strong>Program Interest:</strong> ${escapeHtml(program.interest)}</p>
        <p><strong>Medicaid #:</strong> ${escapeHtml(program.medicaidNumber || 'N/A')}</p>
        <p><strong>Insurance Provider:</strong> ${escapeHtml(program.insuranceProvider || 'N/A')}</p>
        <p><strong>Insurance Policy #:</strong> ${escapeHtml(program.insuranceNumber || 'N/A')}</p>

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
      'Client DOB': client.dob,
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



    // 3. Create ClickUp Task
    const referralListId = process.env.CLICKUP_REFERRAL_LIST_ID;
    if (referralListId) {
      await createClickUpTask(referralListId, {
        name: `Referral: ${client.firstName} ${client.lastName}`,
        priority: details.urgency === 'immediate' ? 1 : 3, // 1 is Urgent, 3 is Normal
        notify_all: true,
        custom_fields: [
          // Client Information
          { id: '9bf2cd0d-5ef4-4ebb-8522-f77e01985eb0', value: `${client.firstName} ${client.lastName}` }, // Referred Client Name
          { id: 'c02afbc9-b9b2-43b8-ad05-f74fe91dbbbf', value: new Date(new Date().toDateString()).getTime() }, // Referral Date
          { id: '6668647f-6d01-4cfc-8b7b-04b56c819f8a', value: new Date(client.dob).getTime() }, // Client Date of Birth
          { id: 'bdac05ff-f0b8-4a99-ba28-6fcb46927cef', value: formatPhoneForClickUp(client.phone) }, // Client Phone
          { id: 'ed8b3cb4-ad84-4eb6-8d82-7580f48166ac', value: client.secondaryPhone ? formatPhoneForClickUp(client.secondaryPhone) : '' }, // Client Secondary Phone
          { id: 'c8d866c9-2ea6-4f2f-9c66-9ab57d33639b', value: client.email },    // Client Email
          { id: 'd040e616-0a22-4402-8cd1-827723ed8d2b', value: client.county || '' }, // Client County
          { id: 'c94e37a9-54f3-408b-9527-b7ea1a72dcbc', value: client.address || '' }, // Client Street Address
          { id: 'd7503cd8-81e7-40de-8d8c-07fedf8f4f3e', value: client.city || '' }, // Client City
          { id: 'b59c71c2-1dd4-4cd5-82fc-8f39f5b7a883', value: client.state || '' }, // Client State
          { id: 'd501b873-bf59-400e-9a7a-b5285b4bd873', value: client.zip || '' }, // Client ZIP Code
          // Program & Insurance
          { id: '6749e013-8b78-4ca1-9f55-30525f4839e9', value: program.interest }, // Program Interest
          { id: '1079f519-0313-4119-b007-d57f7169851b', value: program.medicaidNumber || '' }, // Medicaid Number
          { id: 'b35f6d26-97f4-4f2b-87a0-7cb464b5f334', value: program.insuranceProvider || '' }, // Insurance Provider
          { id: '2859e690-c43d-4cad-827a-40aa976c5ecf', value: program.insuranceNumber || '' }, // Insurance Policy Number
          // Referrer Information
          ...(REFERRAL_SOURCE_OPTIONS[referrer.source] ? [{ id: '0b7127bc-ccaa-4bba-acd0-8cbc293f5c63', value: REFERRAL_SOURCE_OPTIONS[referrer.source] }] : []), // Referral Source (dropdown)
          { id: '29489448-c512-4abc-8cc2-b7559391f8b2', value: referrer.name },   // Referrer Name
          { id: 'e66213b7-52a9-4032-bb81-d4794b6619a0', value: referrer.phone ? formatPhoneForClickUp(referrer.phone) : '' }, // Referrer Phone
          { id: 'b3e956cc-6bc8-4383-b0a4-89aaa336ad0b', value: referrer.email || '' }, // Referrer Email
          { id: 'fff148ee-ebb0-46fb-be07-e4e2abdc4a66', value: referrer.organization || '' }, // Referrer Organization
          // Status
          { id: 'bd47e7aa-89dd-498b-bb5c-d9c72e010df5', value: '1d4ff3d2-53fc-44a4-904b-945ce29cd428' }, // Referral Status → Pending
          // Details
          { id: '84d9a6f5-c7a0-4c9f-820f-c4de7be2ba57', value: details.urgency }, // Urgency
          { id: '1553a6b0-7a54-4747-9ff3-667ad669cfeb', value: details.serviceNeeds || '' }, // Service Needs
          { id: '60f2c2e6-7d3e-4628-89a6-76f2903bdf8d', value: details.additionalNotes || '' }, // Additional Notes
        ]
      });
    }

    return { success: true, id: result?.id };
  } catch (error) {
    console.error('Failed to process referral submission:', error);
    throw new Error('Failed to submit referral');
  }
}
