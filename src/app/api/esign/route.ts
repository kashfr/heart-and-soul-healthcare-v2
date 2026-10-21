import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { listTrackedPackets } from '@/lib/pandadocServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/esign  PandaDoc packets the webhook is tracking (status and
 * signers only). Same access as the Fax Center; signed copies are admin-only
 * (see ./[id]/signed-copy).
 */
export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const packets = await listTrackedPackets();
  return NextResponse.json({
    packets,
    canHandleSignedCopies: caller.role === 'admin',
    webhookConfigured: !!process.env.PANDADOC_WEBHOOK_KEY,
  });
}
