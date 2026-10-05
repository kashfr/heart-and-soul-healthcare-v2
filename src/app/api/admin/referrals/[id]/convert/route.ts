import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { convertReferralToClient, previewReferralConversion } from '@/lib/referralConvertServer';
import { PROGRAMS } from '@/lib/programs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET  /api/admin/referrals/[id]/convert   what creating the client record would carry over.
 * POST /api/admin/referrals/[id]/convert   { dob?, program?, diagnosis? }  create it.
 * Staff who can create clients on the Clients page (admin, supervisor).
 */
async function guard(request: Request) {
  try {
    return { caller: await requireRole(request, ['admin', 'supervisor']) };
  } catch (err) {
    if (err instanceof AdminAuthError) return { res: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const r = await previewReferralConversion(id);
  if (!r.ok) return NextResponse.json({ error: r.error, patientId: r.patientId }, { status: r.status || 500 });
  return NextResponse.json({ ok: true, plan: r.plan });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(request);
  if (g.res) return g.res;
  const { id } = await params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const overrides: { dob?: string; program?: string; diagnosis?: string } = {};
  if (body.dob !== undefined) {
    const dob = String(body.dob || '');
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return NextResponse.json({ error: 'Enter the date of birth as a date.' }, { status: 400 });
    overrides.dob = dob;
  }
  if (body.program !== undefined) {
    const program = String(body.program || '');
    if (program && !PROGRAMS.some((p) => p.id === program)) return NextResponse.json({ error: 'Choose a program from the list.' }, { status: 400 });
    overrides.program = program;
  }
  if (body.diagnosis !== undefined) overrides.diagnosis = String(body.diagnosis || '').slice(0, 500);
  const r = await convertReferralToClient(id, overrides, g.caller!);
  if (!r.ok) return NextResponse.json({ error: r.error, patientId: r.patientId }, { status: r.status || 500 });
  return NextResponse.json({ ok: true, patientId: r.patientId, mrn: r.mrn, documentsMoved: r.documentsMoved });
}
