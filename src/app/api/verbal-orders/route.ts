import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { createVerbalOrder, faxVerbalOrder, getVerbalOrder, notifyStaff } from '@/lib/verbalOrderServer';
import { srfaxConfigured } from '@/lib/fax/srfax';
import { validateVerbalOrderInput, type VerbalOrderInput } from '@/lib/verbalOrderShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The nurse's signature PNG dominates the payload.
const MAX_BODY_BYTES = 1_500_000;

/**
 * POST /api/verbal-orders
 *   { patientId, orderType, physicianName, physicianPhone, physicianFax,
 *     physicianSpecialty, orderText, readBackVerified, nurseSignature,
 *     mar?: { changeRequestId, type, medName } }
 *
 * Records a verbal order the caller just took and immediately faxes the
 * physician authentication form (when SRFax is configured). Who may take one:
 * an RN or LPN on the client's care team, or staff. A medication order must
 * arrive with the MAR change already applied through /api/mar/change (all the
 * medication validation lives there); this route verifies that change is the
 * caller's own, on this client, and recent, then links the two records.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const credential = caller.profile.credential || '';
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && credential !== 'RN' && credential !== 'LPN') {
    return NextResponse.json({ error: 'Only an RN or LPN may take a verbal order.' }, { status: 403 });
  }

  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const input: VerbalOrderInput = {
    patientId: String(body.patientId || '').trim(),
    orderType: body.orderType === 'other' ? 'other' : 'medication',
    physicianName: String(body.physicianName || ''),
    physicianPhone: String(body.physicianPhone || ''),
    physicianFax: String(body.physicianFax || ''),
    physicianSpecialty: String(body.physicianSpecialty || ''),
    orderText: String(body.orderText || ''),
    readBackVerified: body.readBackVerified === true,
    nurseSignature: String(body.nurseSignature || ''),
  };
  const errors = validateVerbalOrderInput(input);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: 'Please correct the highlighted fields.', fields: errors }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.patientId)) {
    return NextResponse.json({ error: 'Invalid client.' }, { status: 400 });
  }

  const db = adminDb();
  const patSnap = await db.collection('patients').doc(input.patientId).get();
  if (!patSnap.exists) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  const pat = patSnap.data() || {};
  if (!isStaff) {
    const assigned = Array.isArray(pat.assignedNurseIds) ? pat.assignedNurseIds : [];
    if (!assigned.includes(caller.uid)) {
      return NextResponse.json({ error: 'You can only take verbal orders for clients on your care team.' }, { status: 403 });
    }
  }

  // Medication orders ride on an applied MAR change.
  let mar: { changeRequestId: string; orderId: string; type: 'add' | 'change' | 'discontinue'; medName: string } | undefined;
  const rawMar = (body.mar || null) as Record<string, unknown> | null;
  if (input.orderType === 'medication') {
    const reqId = String(rawMar?.changeRequestId || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(reqId)) {
      return NextResponse.json({ error: 'A medication verbal order must include the MAR change it authorizes.' }, { status: 400 });
    }
    const reqSnap = await db.collection('marChangeRequests').doc(reqId).get();
    if (!reqSnap.exists) return NextResponse.json({ error: 'MAR change not found.' }, { status: 404 });
    const r = reqSnap.data() || {};
    if (String(r.patientId || '') !== input.patientId) {
      return NextResponse.json({ error: 'That MAR change belongs to a different client.' }, { status: 400 });
    }
    if (String(r.performedBy || '') !== caller.uid) {
      return NextResponse.json({ error: 'You can only attach a MAR change you applied yourself.' }, { status: 403 });
    }
    if (r.status !== 'applied') {
      return NextResponse.json({ error: 'That MAR change was not applied.' }, { status: 400 });
    }
    if (String(r.verbalOrderId || '')) {
      return NextResponse.json({ error: 'That MAR change is already attached to a verbal order.' }, { status: 409 });
    }
    const type = r.type === 'change' ? 'change' : r.type === 'discontinue' ? 'discontinue' : 'add';
    const orderId = String(r.createdOrderId || r.updatedOrderId || r.targetOrderId || '');
    const medName = String((r.proposedMed as { medName?: string } | undefined)?.medName || r.targetMedName || '');
    mar = { changeRequestId: reqId, orderId, type, medName };
  }

  let created: { id: string };
  try {
    created = await createVerbalOrder({
      input,
      caller,
      patient: { id: patSnap.id, name: String(pat.name || ''), dob: String(pat.dob || '') },
      mar,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'The verbal order could not be saved.';
    return NextResponse.json({ error: msg }, { status: msg.includes('already attached') ? 409 : 500 });
  }

  // Everything past here is delivery. The order is on file; a PDF, fax, or
  // bell hiccup must not read as a failed save (the nurse would resubmit and
  // mint a duplicate). The queue has Resend for the fax.
  let fax: { ok: boolean; error?: string } = { ok: false, error: '' };
  try {
    fax = await faxVerbalOrder(created.id, { uid: caller.uid, name: caller.profile.displayName || caller.email || '' });
  } catch (err) {
    console.error('Verbal order: fax step failed (order is saved):', err);
    fax = { ok: false, error: 'The fax could not be sent; the office can resend it.' };
  }
  try {
    const order = await getVerbalOrder(created.id);
    if (order) await notifyStaff('taken', order, `/admin/verbal-orders?vo=${created.id}`);
  } catch (err) {
    console.error('Verbal order: staff bell failed (order is saved):', err);
  }

  return NextResponse.json({
    id: created.id,
    faxConfigured: srfaxConfigured(),
    faxQueued: fax.ok,
    faxError: fax.ok ? '' : fax.error || '',
  });
}
