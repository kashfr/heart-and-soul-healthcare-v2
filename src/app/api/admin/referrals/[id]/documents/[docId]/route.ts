import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { replaceReferralDocument, ReferralDocumentError } from '@/lib/referralDocumentsServer';

export const runtime = 'nodejs';
const MAX_BYTES = 20 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const caller = await requireRole(request, ['admin', 'supervisor', 'va']);
    const { id, docId } = await params;
    const revision = request.headers.get('If-Match') || '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(docId) || !/^[a-f0-9]{64}$/.test(revision)) {
      return NextResponse.json({ error: 'Invalid document or version. Refresh and try again.' }, { status: 400 });
    }
    if (request.headers.get('Content-Type') !== 'application/pdf') return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return NextResponse.json({ error: 'PDF must be 20 MB or smaller.' }, { status: 413 }); }
      chunks.push(value);
    }
    const pdf = Buffer.concat(chunks);
    try {
      if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error();
      const parsed = await PDFDocument.load(pdf);
      if (parsed.getPageCount() < 1) throw new Error();
    } catch {
      return NextResponse.json({ error: 'Choose a valid, unencrypted PDF with at least one page.' }, { status: 400 });
    }
    await replaceReferralDocument({ referralId: id, docId, revision, pdf, by: { uid: caller.uid, name: caller.profile.displayName || caller.email || '', role: caller.role } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof ReferralDocumentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Referral document replacement failed', err);
    return NextResponse.json({ error: 'Could not confirm replacement. Refresh to check the current document before trying again.' }, { status: 500 });
  }
}
