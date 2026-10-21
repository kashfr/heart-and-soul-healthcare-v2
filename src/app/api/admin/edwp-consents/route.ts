import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireEdwpAccess } from '@/lib/edwpAccessServer';
import { listEdwpConsents, listEdwpConsentInvites } from '@/lib/edwpConsentServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed consents plus outstanding "please sign" invites, for the admin list. */
export async function GET(request: Request) {
  try {
    await requireEdwpAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const [consents, invites] = await Promise.all([listEdwpConsents(), listEdwpConsentInvites()]);
  return NextResponse.json({ consents, invites });
}
