import { optionalFaxAttachments, readFaxJson, FaxAttachmentError } from '@/lib/faxAttachments';
import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { faxVerbalOrder, getVerbalOrder } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Send (or resend) the authentication form to the physician. Staff, or the
 *  nurse who took the order. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: 'Only the nurse who took the order or the office can resend it.' }, { status: 403 });
  }
  let supportingPdf;
  try { supportingPdf = await optionalFaxAttachments((await readFaxJson(request)).attachments); } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid attachments.' }, { status: 400 }); }
  let result;
  try { result = await faxVerbalOrder(id, { uid: caller.uid, name: caller.profile.displayName || caller.email || '' }, supportingPdf); } catch (err) { return NextResponse.json({ error: err instanceof FaxAttachmentError ? err.message : 'The fax outcome could not be confirmed. Check its status before trying again.' }, { status: err instanceof FaxAttachmentError ? 400 : 502 }); }
  if (!result.ok) return NextResponse.json({ error: result.error || 'Fax failed.', configured: result.configured }, { status: result.configured ? 502 : 409 });
  return NextResponse.json({ ok: true });
}
