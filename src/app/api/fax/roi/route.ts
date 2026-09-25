import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { createRoi, listRois } from '@/lib/roiServer';
import { validateRoiInput } from '@/lib/roiShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/fax/roi   Releases of Information, plus the client list for the dialog.
 * POST /api/fax/roi   { patientId, direction, facility, information, purpose, duration }
 *                     record a new release, ready to download for signature.
 */
export async function GET(request: Request) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await listRois());
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
  const { errors, value } = validateRoiInput(body);
  if (!value) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 });
  const result = await createRoi(value, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, roi: result.roi });
}
