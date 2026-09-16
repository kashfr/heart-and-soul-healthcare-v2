import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getVerbalOrder, readSignToken, renderVerbalOrderPdf, verbalOrderPdfFileName } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The verbal order form as a PDF: the fax-ready authentication form while
 *  unsigned, the completed record once signed. Staff, the taking nurse, or a
 *  nurse on the client's care team. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const order = await getVerbalOrder(id);
  if (!order) return NextResponse.json({ error: 'Verbal order not found.' }, { status: 404 });

  if (caller.role === 'nurse' && order.nurseId !== caller.uid) {
    const pat = await adminDb().collection('patients').doc(order.patientId).get();
    const assigned = Array.isArray(pat.data()?.assignedNurseIds) ? (pat.data()?.assignedNurseIds as string[]) : [];
    if (!assigned.includes(caller.uid)) return NextResponse.json({ error: 'Not on this client\'s care team.' }, { status: 403 });
  }

  const pdf = await renderVerbalOrderPdf(order, await readSignToken(id));
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${verbalOrderPdfFileName(order)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
