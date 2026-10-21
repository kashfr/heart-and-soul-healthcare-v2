import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { normalizeDateISO } from '@/lib/clientDashboardShared';
import { oversightAllotment, type HoursAuthorization } from '@/lib/shiftHours';

/**
 * GET /api/oversight/allotment?patientId=&date=YYYY-MM-DD&exclude=<noteId>
 *
 * Where the client's month stands before this visit: the authorized RN hours,
 * what their other oversight visits that month already bill (with dates), and
 * what is left. The oversight form shows it while the nurse records the
 * visit's real times; billing is capped separately (oversightVisitBilling).
 *
 * hoursAuthorizations is owner-only in rules, so this route (Admin SDK)
 * returns ONLY the numbers the form needs, never the authorization itself.
 * Staff, or a nurse with an RN credential (the people who write oversight
 * notes).
 */
export async function GET(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (caller.role === 'nurse' && (caller.profile.credential || '').toUpperCase() !== 'RN') {
    return NextResponse.json({ error: 'RN oversight notes are limited to RNs.' }, { status: 403 });
  }
  const url = new URL(request.url);
  const patientId = (url.searchParams.get('patientId') || '').trim();
  const date = (url.searchParams.get('date') || '').trim();
  const exclude = (url.searchParams.get('exclude') || '').trim();
  if (!patientId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'patientId and date (YYYY-MM-DD) are required.' }, { status: 400 });
  }

  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const authSnap = await adminDb().collection('hoursAuthorizations').where('patientId', '==', patientId).get();
  const auths: HoursAuthorization[] = authSnap.docs.map((d) => {
    const x = d.data();
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries((x.monthOverrides as Record<string, unknown>) || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) overrides[k] = v;
    }
    return {
      id: d.id,
      patientId,
      paNumber: String(x.paNumber || ''),
      kind: x.kind === 'unskilled' ? 'unskilled' : 'skilled',
      covers: x.covers === 'oversight' ? 'oversight' : 'shift',
      rateBasis: x.rateBasis === 'day' || x.rateBasis === 'month' ? x.rateBasis : 'week',
      rateHours: 'rateHours' in x ? num(x.rateHours) : num(x.hoursPerWeek),
      from: String(x.from || ''),
      to: String(x.to || ''),
      monthOverrides: overrides,
      totalUnits: num(x.totalUnits),
    };
  });

  const noteSnap = await adminDb().collection('progressNotes').where('patientId', '==', patientId).get();
  const others = noteSnap.docs
    .filter((d) => d.id !== exclude)
    .map((d) => d.data())
    .filter((x) => x.noteType === 'rn-oversight-visit' && x.status !== 'archived' && !x.archivedAt)
    .map((x) => ({
      dateISO: normalizeDateISO(String(x.q6_dateofService || '')),
      timeIn: String(x.ov_timeIn || ''),
      timeOut: String(x.ov_timeOut || ''),
    }))
    .filter((v) => v.dateISO && v.timeIn && v.timeOut);

  return NextResponse.json(oversightAllotment(auths, date, others));
}
