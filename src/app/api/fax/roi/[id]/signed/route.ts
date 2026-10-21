import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { fileSignedRoi, readSignedRoi } from '@/lib/roiServer';
import { ROI_MAX_PDF_BYTES } from '@/lib/roiShared';
import { agencyTodayISO } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = Math.ceil(ROI_MAX_PDF_BYTES * 1.4) + 16_000;
const TOO_BIG = 'That file is too large. Keep it under 10 MB.';

async function guard(request: Request) {
  try {
    return { caller: await requireFaxAccess(request) };
  } catch (err) {
    if (err instanceof AdminAuthError) return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

/** GET /api/fax/roi/[id]/signed  the signed copy on file. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const file = await readSignedRoi(id);
  if (!file) return NextResponse.json({ error: 'No signed copy on file.' }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * POST /api/fax/roi/[id]/signed  { signedDate, pdfBase64 }
 * File the signed copy under the client's Documents and mark it signed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const signedDate = String(body.signedDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate) || Number.isNaN(Date.parse(`${signedDate}T00:00:00Z`))) {
    return NextResponse.json({ error: 'Enter the date it was signed.' }, { status: 400 });
  }
  if (signedDate > agencyTodayISO()) return NextResponse.json({ error: 'The signed date cannot be in the future.' }, { status: 400 });
  const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!b64) return NextResponse.json({ error: 'Choose the signed PDF.' }, { status: 400 });
  const pdf = Buffer.from(b64, 'base64');
  if (pdf.length > ROI_MAX_PDF_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  const result = await fileSignedRoi({ id, pdf, signedDate, caller: g.caller! });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, roi: result.roi });
}
