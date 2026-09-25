import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { fileSignedPpot } from '@/lib/ppotServer';
import { validatePpotFiling } from '@/lib/ppotShared';
import { agencyTodayISO } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/inbound/[faxId]/ppot  { requestKey, signedDate, orderLineIds? }
 * File this inbound fax as the signed Appendix T for an open PPOT request.
 * orderLineIds ('task:<id>' / 'med:<id>') are the client's care-plan tasks
 * and MAR meds whose signed-order date moves to signedDate.
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
  if (!/^[0-9]{1,20}$/.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const requestKey = String(body.requestKey || '');
  const signedDate = String(body.signedDate || '');
  const invalid = validatePpotFiling({ requestKey, signedDate }, agencyTodayISO());
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const rawLines = Array.isArray(body.orderLineIds) ? body.orderLineIds : [];
  if (rawLines.length > 200 || !rawLines.every((x) => typeof x === 'string' && /^(task|med):[A-Za-z0-9_-]{1,128}$/.test(x))) {
    return NextResponse.json({ error: 'Bad order list.' }, { status: 400 });
  }
  const result = await fileSignedPpot({ faxId, requestKey, signedDate, caller, orderLineIds: rawLines as string[] });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, documentId: result.documentId, ordersUpdated: result.ordersUpdated ?? 0 });
}
