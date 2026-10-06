import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { ChoaFormError } from '@/lib/pdf/choaStamp';
import { buildRoiForm } from '@/lib/roiServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/fax/roi/[id]/form  the prepared form, ready to send for signature. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  let file;
  try {
    file = await buildRoiForm(id);
  } catch (err) {
    if (err instanceof ChoaFormError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  if (!file) return NextResponse.json({ error: 'That release was not found.' }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
