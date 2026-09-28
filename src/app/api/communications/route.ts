import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';
import { listCommunications, recordCommunication } from '@/lib/communicationsServer';
import { agencyLocalToISO, agencyNowLocal, channelLabel, sanitizeManualComm, validateManualComm } from '@/lib/communicationsShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BODY_BYTES = 100_000;

async function guard(request: Request) {
  try {
    return { caller: await requireRole(request, ['admin', 'supervisor']) };
  } catch (err) {
    if (err instanceof AdminAuthError) return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

/**
 * GET /api/communications?patientId=|staffUid=
 * The log, newest first, plus the pickers for "Log a message": active staff
 * and clients. Admins and supervisors.
 */
export async function GET(request: Request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId') || '';
  const staffUid = url.searchParams.get('staffUid') || '';
  if ((patientId && !ID_RE.test(patientId)) || (staffUid && !ID_RE.test(staffUid))) {
    return NextResponse.json({ error: 'Invalid filter.' }, { status: 400 });
  }
  const db = adminDb();
  const [entries, users, patients] = await Promise.all([
    listCommunications({ patientId: patientId || undefined, staffUid: staffUid || undefined }),
    db.collection('users').get(),
    db.collection('patients').get(),
  ]);
  const staff = users.docs
    .map((d) => ({ uid: d.id, name: String(d.data().displayName || ''), credential: String(d.data().credential || ''), active: d.data().active !== false, test: d.data().isTestAccount === true }))
    .filter((u) => u.name && u.active && !u.test)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ uid, name, credential }) => ({ uid, name, credential }));
  const clients = patients.docs
    .map((d) => ({ id: d.id, name: String(d.data().name || '') }))
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ entries, staff, clients });
}

/** POST /api/communications  log a message sent or received outside the portal. */
export async function POST(request: Request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const caller = g.caller!;
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const m = sanitizeManualComm(body);
  // A few minutes of grace for a device clock slightly ahead of the server.
  const errors = validateManualComm(m, agencyNowLocal(10 * 60 * 1000));
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please correct the highlighted fields.', fields: errors }, { status: 400 });
  if ((m.staffUid && !ID_RE.test(m.staffUid)) || (m.patientId && !ID_RE.test(m.patientId))) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }

  const db = adminDb();
  let staffName = '';
  let staffTo = '';
  if (m.staffUid) {
    const u = await db.collection('users').doc(m.staffUid).get();
    if (!u.exists) return NextResponse.json({ error: 'That staff member was not found.' }, { status: 404 });
    staffName = String(u.data()?.displayName || '');
    staffTo = m.channel === 'email' ? String(u.data()?.email || '') : m.channel === 'sms' || m.channel === 'phone' ? String(u.data()?.phone || '') : staffName;
  }
  let patientName = '';
  if (m.patientId) {
    const p = await db.collection('patients').doc(m.patientId).get();
    if (!p.exists) return NextResponse.json({ error: 'That client was not found.' }, { status: 404 });
    patientName = String(p.data()?.name || '');
  }
  const who = staffName || m.counterpartyName;
  const firstLine = (m.subject.trim() || m.body.trim().split(/\r?\n/)[0]).slice(0, 140);
  const id = await recordCommunication({
    source: 'manual',
    event: 'manual',
    direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
    patientId: m.patientId,
    patientName,
    staffUid: m.staffUid,
    staffName,
    counterpartyName: m.counterpartyName,
    summary: `${channelLabel(m.channel)} ${m.direction === 'inbound' ? 'from' : 'to'} ${who}: ${firstLine}`,
    channels: [{ channel: m.channel as 'email', to: staffTo || m.counterpartyName, ok: true, ...(m.subject.trim() ? { subject: m.subject.trim() } : {}), body: m.body }],
    relatedVisitId: '',
    occurredAt: agencyLocalToISO(m.occurredAt),
    loggedByUid: caller.uid,
    loggedByName: caller.profile.displayName || caller.email || '',
  });
  if (!id) return NextResponse.json({ error: 'The message could not be logged. Try again.' }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
