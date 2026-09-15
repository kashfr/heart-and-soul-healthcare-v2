import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import {
  normalizeEdwpConsent,
  validateEdwpConsent,
  MAX_SIGNATURE_BYTES,
} from '@/lib/edwpConsent';
import {
  createEdwpConsent,
  getEdwpConsent,
  lookupInviteName,
} from '@/lib/edwpConsentServer';
import EdwpConsentPDF from '@/lib/pdf/EdwpConsentPDF';
import { sendEdwpConsentNotification, sendEdwpConsentCopy } from '@/lib/emails/edwpConsent';

// Public intake for the EDWP client consent form (/programs/edwp/consent).
// Unauthenticated by design: the people signing are prospective clients, not
// staff. The route validates server-side, stores through the Admin SDK (the
// collection is closed to browser writes), renders the signed PDF, and emails
// it to the office plus a copy to the client.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The signature PNG dominates the payload; everything else is a few KB.
const MAX_BODY_BYTES = MAX_SIGNATURE_BYTES + 64 * 1024;

/** Prefill lookup for a staff-sent link: `?invite=<token>` -> client name. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('invite') ?? '';
  const clientName = token ? await lookupInviteName(token) : null;
  return NextResponse.json(
    { clientName },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Honeypot: a hidden field real users never see. Bots that fill every input
  // get a success response and nothing stored.
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).website) {
    return NextResponse.json({ ok: true, id: 'ok' });
  }

  const input = normalizeEdwpConsent(raw);
  const errors = validateEdwpConsent(input);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: 'Please correct the highlighted fields.', fields: errors },
      { status: 400 }
    );
  }

  let created: { id: string };
  try {
    created = await createEdwpConsent(input);
  } catch (err) {
    console.error('EDWP consent: createEdwpConsent failed:', err);
    return NextResponse.json(
      { error: 'We could not save your form. Please try again or call us at (678) 644-0337.' },
      { status: 500 }
    );
  }

  // Everything past this point is delivery. The consent is already on file, so
  // a PDF or email hiccup must not read as a failure to the client; staff can
  // always pull the PDF from the portal.
  let emailSent = false;
  let copySent = false;
  try {
    const consent = await getEdwpConsent(created.id);
    if (consent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(EdwpConsentPDF, { consent }) as any;
      const pdf = Buffer.from(await renderToBuffer(element));
      const [notif, copy] = await Promise.all([
        sendEdwpConsentNotification(consent, pdf),
        consent.email ? sendEdwpConsentCopy(consent, pdf) : Promise.resolve({ ok: false }),
      ]);
      emailSent = notif.ok;
      copySent = copy.ok;
    }
  } catch (err) {
    console.error('EDWP consent: PDF/email delivery failed (consent is stored):', err);
  }

  return NextResponse.json({ ok: true, id: created.id, emailSent, copySent });
}
