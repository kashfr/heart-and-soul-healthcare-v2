import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { fileInboundFaxToClient, fileInboundFaxToReferral } from '@/lib/ppotServer';

import { INBOUND_FAX_ID_RE } from '@/lib/inboundFaxPdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/inbound/[faxId]/client  { patientId | referralId, category, title, docDate }
 * File this inbound fax into a client's Documents (records sent back on a
 * release, labs, discharge papers), or against a referral that has no client
 * record yet. Anyone with Fax Center access.
 */
export async function POST(request: Request, { params }: { params: Promise<{ faxId: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { faxId } = await params;
  if (!INBOUND_FAX_ID_RE.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const common = { faxId, category: String(body.category || ''), title: String(body.title || ''), docDate: String(body.docDate || ''), caller };
  const result = String(body.referralId || '')
    ? await fileInboundFaxToReferral({ ...common, referralId: String(body.referralId) })
    : await fileInboundFaxToClient({ ...common, patientId: String(body.patientId || '') });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, documentId: result.documentId });
}
