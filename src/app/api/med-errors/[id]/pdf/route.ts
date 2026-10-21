import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getMedError, medErrorPdfFileName, renderMedErrorPdf } from '@/lib/medErrorServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The report as a PDF: staff, the reporter, or a nurse on the client's care team. */
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
  const report = await getMedError(id);
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (caller.role === 'nurse' && report.reporterId !== caller.uid) {
    const pat = await adminDb().collection('patients').doc(report.patientId).get();
    const assigned = Array.isArray(pat.data()?.assignedNurseIds) ? (pat.data()?.assignedNurseIds as string[]) : [];
    if (!assigned.includes(caller.uid)) return NextResponse.json({ error: 'Not on this client\'s care team.' }, { status: 403 });
  }
  const pdf = await renderMedErrorPdf(report);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${medErrorPdfFileName(report)}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
