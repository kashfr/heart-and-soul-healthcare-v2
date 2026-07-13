import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { looksLikeUnknownPhysician } from '@/lib/marShared';
import { adminDb } from '@/lib/firebaseAdmin';
import { applyStandaloneChange, type StandaloneChangeInput } from '@/lib/marServer';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serverToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * POST /api/mar/change
 *
 * Add / change / discontinue a medication straight from the standalone MAR
 * (no progress note). Maintaining the MAR per physician orders is within an
 * RN/LPN's scope, and a supervisor may also do it; the change applies
 * immediately (no approval gate) and lands in the RN's acknowledgment queue.
 *
 * Because there's no note to imply scope, a NURSE may only manage a client she
 * is assigned to (assignedNurseIds). Staff (admin/supervisor) may manage any.
 * All writes happen server-side via applyStandaloneChange (Admin SDK).
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const credential = caller.profile.credential || '';
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && credential !== 'RN' && credential !== 'LPN') {
    return NextResponse.json(
      { error: 'Only RN/LPN nurses or supervisors can manage medications.' },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = String(body?.patientId || '').trim();
  if (!patientId) {
    return NextResponse.json({ error: 'patientId is required.' }, { status: 400 });
  }
  const type = String(body?.type || '');
  if (type !== 'add' && type !== 'change' && type !== 'discontinue') {
    return NextResponse.json({ error: 'type must be add, change, or discontinue.' }, { status: 400 });
  }
  const reason = String(body?.reason || '').trim();
  if (!reason) {
    return NextResponse.json({ error: 'A reason is required.' }, { status: 400 });
  }

  // Load the patient: needed for the display name and, for nurses, the
  // care-team scope check (this route runs with the Admin SDK, which bypasses
  // the Firestore read scope, so the assignment must be enforced here).
  const patSnap = await adminDb().collection('patients').doc(patientId).get();
  if (!patSnap.exists) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }
  const pat = patSnap.data() || {};
  if (!isStaff) {
    const assigned = Array.isArray(pat.assignedNurseIds) ? pat.assignedNurseIds : [];
    if (!assigned.includes(caller.uid)) {
      return NextResponse.json(
        { error: 'You can only manage medications for clients on your care team.' },
        { status: 403 },
      );
    }
  }
  const patientName = String(pat.name || '');

  // Per-type validation (mirrors the modal, enforced server-side so a bad
  // payload can't create a junk order).
  const rawProposed = (body?.proposedMed || {}) as Record<string, unknown>;
  const isPRN = !!rawProposed.isPRN;
  const physicianFlaggedUnknown = rawProposed.physicianPending === true;
  const scheduledTimes = Array.isArray(rawProposed.scheduledTimes)
    ? (rawProposed.scheduledTimes as unknown[]).map((t) => String(t)).filter(Boolean)
    : [];

  if (type === 'add' || type === 'change') {
    const medName = String(rawProposed.medName || '').trim();
    const dose = String(rawProposed.dose || '').trim();
    const units = String(rawProposed.units || '').trim();
    const route = String(rawProposed.route || '').trim();
    const orderingPhysician = String(rawProposed.orderingPhysician || '').trim();
    const indication = String(rawProposed.indication || '').trim();
    if (!medName || !dose || !units || !route) {
      return NextResponse.json({ error: 'Medication, dose, units, and route are required.' }, { status: 400 });
    }
    // Mirror of the form rule: a REAL name is required, but the author may
    // instead explicitly flag the physician as unknown (physicianPending) —
    // that stores an honest follow-up flag rather than junk like "N/A".
    // Server-side junk rejection also blocks crafted payloads.
    if (!physicianFlaggedUnknown && looksLikeUnknownPhysician(orderingPhysician)) {
      return NextResponse.json(
        {
          error:
            'Ordering physician is required (a real name, not a placeholder); this change reflects a physician order. If unknown right now, flag it for follow-up instead.',
        },
        { status: 400 },
      );
    }
    if (!isPRN && scheduledTimes.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one scheduled time, or choose the "As needed (PRN)" frequency.' },
        { status: 400 },
      );
    }
    if (isPRN && !indication) {
      return NextResponse.json(
        { error: 'An indication is required for PRN medications.' },
        { status: 400 },
      );
    }
  }
  if ((type === 'change' || type === 'discontinue') && !String(body?.targetOrderId || '').trim()) {
    return NextResponse.json({ error: 'Choose the medication to change or discontinue.' }, { status: 400 });
  }

  const today = ISO_DATE_RE.test(String(body?.today || '')) ? String(body.today) : serverToday();
  const clientRequestId = String(body?.clientRequestId || '').trim();
  // Only accept a safe, doc-id-shaped idempotency key; otherwise ignore it.
  const safeRequestId = /^[A-Za-z0-9_-]{8,128}$/.test(clientRequestId) ? clientRequestId : '';

  const input: StandaloneChangeInput = {
    patientId,
    patientName,
    type,
    reason,
    proposedMed:
      type === 'add' || type === 'change'
        ? {
            medName: String(rawProposed.medName || ''),
            dose: String(rawProposed.dose || ''),
            units: String(rawProposed.units || ''),
            route: String(rawProposed.route || ''),
            frequencyLabel: String(rawProposed.frequencyLabel || ''),
            scheduledTimes,
            isPRN,
            indication: String(rawProposed.indication || ''),
            startDate: ISO_DATE_RE.test(String(rawProposed.startDate || '')) ? String(rawProposed.startDate) : today,
            orderingPhysician: String(rawProposed.orderingPhysician || ''),
            physicianPending:
              physicianFlaggedUnknown &&
              looksLikeUnknownPhysician(String(rawProposed.orderingPhysician || '')),
            notes: String(rawProposed.notes || ''),
          }
        : undefined,
    targetOrderId: String(body?.targetOrderId || '').trim() || undefined,
    targetMedName: String(body?.targetMedName || '').trim() || undefined,
    effectiveDate: ISO_DATE_RE.test(String(body?.effectiveDate || '')) ? String(body.effectiveDate) : undefined,
    clientRequestId: safeRequestId || undefined,
  };

  const result = await applyStandaloneChange(input, caller, today);
  if (!result.ok) {
    const status = result.reason === 'apply-failed' || result.reason === 'duplicate' ? 409 : 500;
    return NextResponse.json({ error: result.message || 'Failed to apply the change.' }, { status });
  }
  return NextResponse.json(result);
}
