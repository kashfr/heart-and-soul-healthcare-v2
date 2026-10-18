import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { srfaxConfig } from '@/lib/fax/srfax';
import { createRoi, listRois, recordOutsideRoi } from '@/lib/roiServer';
import { isOutsideRoi, ROI_MAX_PDF_BYTES, validateRoiInput } from '@/lib/roiShared';
import { agencyTodayISO } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/fax/roi   Releases of Information, plus the client list for the dialog.
 * POST /api/fax/roi   { patientId, direction, facility, information, purpose, duration }
 *                     record a new release, ready to download for signature.
 *                     A release signed elsewhere (formType 'ga-hipaa' or
 *                     'outside') also sends { signedDate, pdfBase64 } and is
 *                     recorded already signed.
 */
export async function GET(request: Request) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const referralId = new URL(request.url).searchParams.get('referralId');
  if (referralId !== null && !/^[A-Za-z0-9_-]{1,128}$/.test(referralId)) return NextResponse.json({ error: 'Invalid referral.' }, { status: 400 });
  const data = await listRois(referralId || undefined);
  if (referralId && !data.subject) return NextResponse.json({ error: 'Referral not found.' }, { status: 404 });
  return NextResponse.json({ ...data, faxConfigured: !!srfaxConfig() });
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
  if (isOutsideRoi(String(body.formType || ''))) {
    const signedDate = String(body.signedDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate) || Number.isNaN(Date.parse(`${signedDate}T00:00:00Z`))) errors.signedDate = 'Enter the date it was signed.';
    else if (signedDate > agencyTodayISO()) errors.signedDate = 'The signed date cannot be in the future.';
    const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '');
    if (!b64) errors.signedPdf = 'Choose the signed PDF.';
    const pdf = Buffer.from(b64, 'base64');
    if (pdf.length > ROI_MAX_PDF_BYTES) errors.signedPdf = 'That file is too large. Keep it under 10 MB.';
    if (!value || Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 });
    const recorded = await recordOutsideRoi({ input: value, pdf, signedDate, caller });
    if (!recorded.ok) return NextResponse.json({ error: recorded.error }, { status: recorded.status });
    return NextResponse.json({ ok: true, roi: recorded.roi });
  }
  if (!value) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 });
  const result = await createRoi(value, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, roi: result.roi });
}
