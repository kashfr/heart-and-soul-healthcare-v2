import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { listPpotSubjects, sendPpotRequest } from '@/lib/ppotServer';
import { validatePpotSendInput, type PpotSendInput } from '@/lib/ppotShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fax/ppot   who a PPOT can be requested for (open referrals and
 *                     clients, identity + physician only) and who is due for
 *                     recertification.
 * POST /api/fax/ppot  { subjectKind, subjectId, requestType, recipientName,
 *                       recipientOrg, toNumber, confirmNumber, medicaidId, note }
 *                     faxes the blank Appendix T behind a request cover sheet.
 *
 * Fax Center access only (admins, and supervisors / the VA granted in Settings).
 */
export async function GET(request: Request) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await listPpotSubjects());
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input: PpotSendInput = {
    subjectKind: body.subjectKind === 'client' ? 'client' : body.subjectKind === 'referral' ? 'referral' : ('' as PpotSendInput['subjectKind']),
    subjectId: String(body.subjectId || ''),
    requestType: body.requestType === 'recert' ? 'recert' : body.requestType === 'new' ? 'new' : ('' as PpotSendInput['requestType']),
    recipientName: String(body.recipientName || ''),
    recipientOrg: String(body.recipientOrg || '').slice(0, 80),
    toNumber: String(body.toNumber || ''),
    confirmNumber: String(body.confirmNumber || ''),
    medicaidId: String(body.medicaidId || ''),
    note: String(body.note || ''),
  };
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.subjectId)) input.subjectId = '';
  const fields = validatePpotSendInput(input);
  if (Object.keys(fields).length > 0) return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 });
  const result = await sendPpotRequest(input, caller);
  if (!result.ok) return NextResponse.json({ error: result.error, fax: result.fax }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, fax: result.fax });
}
