import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getServerSettings } from '@/lib/settingsServer';
import { getMedError, medErrorRecipients, notifyMedError, reviewMedError } from '@/lib/medErrorServer';
import { isSubstantiveText } from '@/lib/medErrorShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/med-errors/[id]/review
 *   { findings, rootCause, correctiveAction, incidentReportRequired, incidentReportFiledDate? }
 * The nursing review. Who may review: an RN, a supervisor, an admin, or the
 * configured corrections reviewer. The reporter may not review her own report.
 */
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

  let reviewerUid = '';
  try {
    reviewerUid = (await getServerSettings()).corrections.reviewerUid || '';
  } catch {
    /* fall through */
  }
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  const mayReview = isStaff || caller.profile.credential === 'RN' || caller.uid === reviewerUid;
  if (!mayReview) return NextResponse.json({ error: 'Only an RN, a supervisor, or an admin can review a medication error report.' }, { status: 403 });

  const report = await getMedError(id);
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (report.reporterId === caller.uid) return NextResponse.json({ error: 'A report cannot be reviewed by the person who filed it.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const findings = String(body.findings || '').trim().slice(0, 4000);
  const rootCause = String(body.rootCause || '').trim().slice(0, 4000);
  const correctiveAction = String(body.correctiveAction || '').trim().slice(0, 4000);
  const incidentReportRequired = body.incidentReportRequired === true;
  const incidentReportFiledDate = String(body.incidentReportFiledDate || '').trim();
  if (!isSubstantiveText(findings)) return NextResponse.json({ error: 'Findings must say what the review found, in at least a sentence. Placeholders like N/A are not accepted.' }, { status: 400 });
  if (!isSubstantiveText(correctiveAction)) return NextResponse.json({ error: 'Corrective action must say what will change, in at least a sentence. If the review found no action is needed, say why.' }, { status: 400 });
  if (incidentReportFiledDate && !/^\d{4}-\d{2}-\d{2}$/.test(incidentReportFiledDate)) return NextResponse.json({ error: 'Incident report date must be YYYY-MM-DD.' }, { status: 400 });

  const r = await reviewMedError({ id, caller, findings, rootCause, correctiveAction, incidentReportRequired, incidentReportFiledDate });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes('already') ? 409 : 500 });

  try {
    const fresh = await getMedError(id);
    if (fresh) {
      const recipients = await medErrorRecipients(caller.uid);
      if (fresh.reporterId && fresh.reporterId !== caller.uid) recipients.push(fresh.reporterId);
      await notifyMedError('reviewed', fresh, Array.from(new Set(recipients)));
      // The reviewer raised the incident flag the form did not: that is a new
      // filing obligation for the office, so it gets its own bell.
      if (incidentReportRequired && !fresh.incidentReportRequired) await notifyMedError('incident', fresh, await medErrorRecipients(caller.uid));
    }
  } catch (err) {
    console.error('Med error: review notifications failed:', err);
  }
  return NextResponse.json({ ok: true });
}
