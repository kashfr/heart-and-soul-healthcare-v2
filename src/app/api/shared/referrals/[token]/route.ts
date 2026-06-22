import { NextResponse } from 'next/server';
import { resolveSharedReferral } from '@/lib/referralShares';

// Public, no-login endpoint backing the partner-agency share page. The token in
// the URL is the only credential; resolveSharedReferral validates it, audits the
// view, and returns a read-only referral payload (or a tagged error).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON_STATUS: Record<string, number> = {
  not_found: 404,
  expired: 410,
  revoked: 410,
};

// PHI must never be cached by browsers/proxies/CDNs, and the URL must never be
// indexed. Applied to every response from this token-gated endpoint.
const SECURE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await resolveSharedReferral(token);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: REASON_STATUS[result.reason] ?? 404, headers: SECURE_HEADERS }
    );
  }
  return NextResponse.json({ referral: result.referral }, { headers: SECURE_HEADERS });
}
