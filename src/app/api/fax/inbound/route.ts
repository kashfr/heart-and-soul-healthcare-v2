import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { listIncomingFaxes, listOpenPpotRequests, listReceivedPpots } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fax/inbound  unfiled faxes on the portal line (with any PPOT
 * request they look like the answer to), the PPOT requests still waiting on
 * a signed copy, and the signed copies filed most recently. Fax Center only.
 */
export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const [incoming, openRequests, received] = await Promise.all([listIncomingFaxes(), listOpenPpotRequests(), listReceivedPpots()]);
  openRequests.sort((a, b) => a.date.localeCompare(b.date));
  return NextResponse.json({ incoming, openRequests, received, canDismissIncoming: caller.role === 'admin' || caller.role === 'supervisor' });
}
