import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { resolveSharedReferral } from '@/lib/referralShares';
import ReferralSharePDF from '@/lib/pdf/ReferralSharePDF';

// Public PDF download for a shared referral. Same token gate as the view route.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sanitize(part: string): string {
  return (part || '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'referral';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await resolveSharedReferral(token);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.reason }), {
      status: result.reason === 'not_found' ? 404 : 410,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ReferralSharePDF, { view: result.referral }) as any;
  const buffer = await renderToBuffer(element);
  const filename = `Referral_${sanitize(result.referral.clientName)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // PHI document: never cache, never index.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
