import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { createMedError, getMedError, medErrorRecipients, notifyMedError } from '@/lib/medErrorServer';
import { EMPTY_MED_ERROR_INPUT, validateMedErrorInput, type MedErrorInput } from '@/lib/medErrorShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1_500_000;
const ID_RE = /^[A-Za-z0-9_-]{0,128}$/;

const SIG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const SIG_MAX = 400_000;

/** Agency-local now plus a few minutes: a nurse's phone a little ahead of the
 *  server must not be told her untouched default is "in the future". */
function agencyNowLocalWithGrace(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Date.now() + 10 * 60 * 1000));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

function notifFrom(v: unknown) {
  const n = (v || {}) as Record<string, unknown>;
  return { notified: n.notified === true, name: String(n.name || '').slice(0, 200), at: String(n.at || '') };
}

/**
 * POST /api/med-errors
 * File a medication error report. Anyone with an active clinical credential
 * (RN, LPN, CNA, HHA) or staff may file: the person who DISCOVERS an error is
 * often an aide, and the report captures the discovery in their own words.
 * A nurse or aide may only file on a client on their care team; staff on any.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && !caller.profile.credential) {
    return NextResponse.json({ error: 'A clinical credential is required to file a medication error report.' }, { status: 403 });
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

  const s = (k: string, max = 4001) => String(body[k] ?? '').slice(0, max);
  const input: MedErrorInput = {
    ...EMPTY_MED_ERROR_INPUT,
    patientId: s('patientId', 128).trim(),
    discoveredAt: s('discoveredAt', 16),
    occurredAt: s('occurredAt', 16),
    occurredApprox: body.occurredApprox === true,
    medName: s('medName', 200),
    doseOrdered: s('doseOrdered', 100),
    doseGiven: s('doseGiven', 100),
    route: s('route', 60),
    marOrderId: s('marOrderId', 128),
    marAdministrationId: s('marAdministrationId', 128),
    errorType: s('errorType', 40) as MedErrorInput['errorType'],
    doseOutcome: s('doseOutcome', 20) as MedErrorInput['doseOutcome'],
    description: s('description'),
    responsibleType: s('responsibleType', 20) as MedErrorInput['responsibleType'],
    responsibleName: s('responsibleName', 200),
    harm: s('harm', 20) as MedErrorInput['harm'],
    clientCondition: s('clientCondition'),
    physician: notifFrom(body.physician),
    guardian: notifFrom(body.guardian),
    supervisor: notifFrom(body.supervisor),
    actionsTaken: s('actionsTaken'),
    reporterSignature: String(body.reporterSignature || ''),
  };
  const errors = validateMedErrorInput(input, agencyNowLocalWithGrace());
  if (input.reporterSignature.length > SIG_MAX || !SIG_RE.test(input.reporterSignature)) errors.reporterSignature = 'The signature could not be read. Clear it and sign again.';
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fields: errors }, { status: 400 });
  if (!ID_RE.test(input.patientId) || !ID_RE.test(input.marOrderId) || !ID_RE.test(input.marAdministrationId)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  const db = adminDb();
  const patSnap = await db.collection('patients').doc(input.patientId).get();
  if (!patSnap.exists) return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  const pat = patSnap.data() || {};
  if (!isStaff) {
    const assigned = Array.isArray(pat.assignedNurseIds) ? pat.assignedNurseIds : [];
    if (!assigned.includes(caller.uid)) return NextResponse.json({ error: 'You can only file reports for clients on your care team.' }, { status: 403 });
  }
  // A linked MAR dose must belong to this client; a linked order likewise.
  if (input.marOrderId) {
    const o = await db.collection('marOrders').doc(input.marOrderId).get();
    if (!o.exists || String(o.data()?.patientId || '') !== input.patientId) return NextResponse.json({ error: 'That medication order belongs to a different client.' }, { status: 400 });
  }
  if (input.marAdministrationId) {
    const a = await db.collection('marAdministrations').doc(input.marAdministrationId).get();
    if (!a.exists || String(a.data()?.patientId || '') !== input.patientId) return NextResponse.json({ error: 'That charted dose belongs to a different client.' }, { status: 400 });
    if (input.marOrderId && String(a.data()?.orderId || '') !== input.marOrderId) return NextResponse.json({ error: 'That charted dose is for a different medication order.' }, { status: 400 });
  }

  const created = await createMedError({ input, caller, patient: { id: patSnap.id, name: String(pat.name || ''), dob: String(pat.dob || '') } });

  // Delivery is best-effort; the report is already on file.
  try {
    const report = await getMedError(created.id);
    if (report) {
      const recipients = await medErrorRecipients(caller.uid);
      await notifyMedError('filed', report, recipients);
      if (created.incident) await notifyMedError('incident', report, recipients);
    }
  } catch (err) {
    console.error('Med error: notifications failed (report is saved):', err);
  }
  return NextResponse.json({ id: created.id, incident: created.incident });
}
