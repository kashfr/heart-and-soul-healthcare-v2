import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { readSignedCopy, saveSignedCopy } from '@/lib/pandadocServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * The signed PDF of a tracked PandaDoc packet. Admin only: onboarding packets
 * carry tax and identity forms.
 *   GET   download it
 *   POST  { pdfBase64 } attach it (saved from PandaDoc by hand)
 */
async function guard(request: Request) {
  try {
    return { caller: await requireRole(request, ['admin']) };
  } catch (err) {
    if (err instanceof AdminAuthError) return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const file = await readSignedCopy(id);
  if (!file) return NextResponse.json({ error: 'No signed copy on file.' }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > Math.ceil(MAX_PDF_BYTES * 1.4)) {
    return NextResponse.json({ error: 'That file is too large (25 MB at most).' }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const pdf = Buffer.from(String(body.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, ''), 'base64');
  if (pdf.length === 0) return NextResponse.json({ error: 'Choose the signed PDF.' }, { status: 400 });
  if (pdf.length > MAX_PDF_BYTES) return NextResponse.json({ error: 'That file is too large (25 MB at most).' }, { status: 413 });
  const result = await saveSignedCopy({ packetId: id, pdf, caller: g.caller! });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status || 500 });
  return NextResponse.json({ ok: true });
}
