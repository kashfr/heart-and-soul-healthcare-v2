'use server';

import { Resend } from 'resend';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFICATION_EMAIL = 'info@heartandsoulhc.org';
const FROM_EMAIL = 'notifications@heartandsoulhc.org';

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
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <h3>Message:</h3>
        <p>${message}</p>
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
        <p><strong>Name:</strong> ${client.firstName} ${client.lastName}</p>
        <p><strong>DOB:</strong> ${client.dob}</p>
        <p><strong>phone:</strong> ${client.phone}</p>
        <p><strong>Email:</strong> ${client.email}</p>
        
        <h3>Program & Insurance</h3>
        <p><strong>Program Interest:</strong> ${program.interest}</p>
        
        <h3>Referrer Information</h3>
        <p><strong>Name:</strong> ${referrer.name}</p>
        <p><strong>Organization:</strong> ${referrer.organization || 'N/A'}</p>
        
        <h3>Details</h3>
        <p><strong>Urgency:</strong> ${details.urgency}</p>
        <p><strong>Service Needs:</strong> ${details.serviceNeeds}</p>
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

    return { success: true, id: result?.id };
  } catch (error) {
    console.error('Failed to process referral submission:', error);
    throw new Error('Failed to submit referral');
  }
}
