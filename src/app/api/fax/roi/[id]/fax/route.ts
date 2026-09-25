import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { faxRoi } from '@/lib/roiServer';
import { validateFaxSendInput } from '@/lib/faxShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fax/roi/[id]/fax  { recipientName, toNumber, confirmNumber, note }
 * Fax the signed release to the facility behind a cover sheet and the
 * introduction letter.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input = {
    recipientName: String(body.recipientName || ''),
    recipientOrg: '',
    toNumber: String(body.toNumber || ''),
    confirmNumber: String(body.confirmNumber || ''),
    regarding: '',
    note: String(body.note || ''),
    includeCover: true,
  };
  // The file is the signed copy on record, so there is no upload to check.
  const fields = validateFaxSendInput(input, true);
  if (Object.keys(fields).length > 0) return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 });
  const result = await faxRoi({ id, recipientName: input.recipientName, toNumber: input.toNumber, confirmNumber: input.confirmNumber, note: input.note, caller });
  if (!result.ok) return NextResponse.json({ error: result.error, fax: result.fax }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, fax: result.fax });
}
