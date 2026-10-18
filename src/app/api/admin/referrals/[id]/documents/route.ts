import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { listReferralDocuments } from '@/lib/referralDocumentsServer';
import {
  REFERRAL_UPLOAD_MAX_BYTES, openPpotForReferral, uploadReferralDocument, uploadSignedPpotForReferral,
} from '@/lib/referralUploadServer';
import { validateFileFaxToClient } from '@/lib/docCategories';
import { agencyTodayISO } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = ['admin', 'supervisor', 'va'] as const;
const MAX_BODY_BYTES = Math.ceil(REFERRAL_UPLOAD_MAX_BYTES * 1.4) + 16_000;
const TOO_BIG = 'That file is too large. Keep it under 10 MB.';

/** GET /api/admin/referrals/[id]/documents  papers filed against this referral, and any open PPOT request. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, [...ROLES]);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const [documents, openPpot] = await Promise.all([listReferralDocuments(id), openPpotForReferral(id)]);
  return NextResponse.json({ documents, openPpot });
}

/**
 * POST /api/admin/referrals/[id]/documents
 *   { pdfBase64, category, title, docDate }            any document
 *   { pdfBase64, asSignedPpot: true, docDate }         the signed Appendix T for the open PPOT request
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, [...ROLES]);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!b64) return NextResponse.json({ error: 'Choose the PDF.', fields: { file: 'Choose the PDF.' } }, { status: 400 });
  const pdf = Buffer.from(b64, 'base64');
  if (pdf.length > REFERRAL_UPLOAD_MAX_BYTES) return NextResponse.json({ error: TOO_BIG, fields: { file: TOO_BIG } }, { status: 413 });
  const docDate = String(body.docDate || '');
  const today = agencyTodayISO();

  if (body.asSignedPpot === true) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(docDate)) return NextResponse.json({ error: 'Enter the date it was signed.', fields: { docDate: 'Enter the date it was signed.' } }, { status: 400 });
    if (docDate > today) return NextResponse.json({ error: 'The signed date cannot be in the future.', fields: { docDate: 'The signed date cannot be in the future.' } }, { status: 400 });
    const r = await uploadSignedPpotForReferral({ referralId: id, pdf, signedDate: docDate, caller });
    return r.ok ? NextResponse.json({ ok: true, documentId: r.documentId }) : NextResponse.json({ error: r.error }, { status: r.status });
  }

  const title = String(body.title || '').trim();
  const category = String(body.category || '');
  const errors = validateFileFaxToClient({ patientId: id, title, category, docDate }, today);
  if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 });
  const r = await uploadReferralDocument({ referralId: id, pdf, category, title, docDate, caller });
  return r.ok ? NextResponse.json({ ok: true, documentId: r.documentId }) : NextResponse.json({ error: r.error }, { status: r.status });
}
