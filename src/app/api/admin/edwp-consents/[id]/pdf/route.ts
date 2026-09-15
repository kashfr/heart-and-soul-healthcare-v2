import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getEdwpConsent } from '@/lib/edwpConsentServer';
import EdwpConsentPDF from '@/lib/pdf/EdwpConsentPDF';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitize(part: string): string {
  return (part || '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'client';
}

/** Re-render the signed consent PDF for staff download. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const consent = await getEdwpConsent(id);
  if (!consent) return NextResponse.json({ error: 'Consent not found.' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(EdwpConsentPDF, { consent }) as any;
  const buffer = await renderToBuffer(element);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="EDWP_Consent_${sanitize(consent.clientName)}.pdf"`,
      // PHI document: never cache, never index.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
