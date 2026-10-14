import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { ReferralDocumentError } from '@/lib/referralDocumentsServer';
import { undoReferralPpot } from '@/lib/undoReferralPpotServer';
import { validateFileFaxToClient } from '@/lib/docCategories';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireRole(request, ['admin', 'supervisor', 'va']);
    const { id } = await params;
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    const revision = String(body.revision || '');
    const title = String(body.title || '').trim();
    const category = String(body.category || '');
    const docDate = String(body.docDate || '');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const errors = validateFileFaxToClient({ patientId: id, title, category, docDate }, today);
    if (!/^[a-f0-9]{64}$/.test(revision) || Object.keys(errors).length || !/^\d{4}-\d{2}-\d{2}$/.test(docDate) || !Number.isFinite(Date.parse(`${docDate}T12:00:00Z`)) || new Date(`${docDate}T12:00:00Z`).toISOString().slice(0, 10) !== docDate) {
      return NextResponse.json({ error: Object.values(errors)[0] || 'Invalid document date or version. Refresh and try again.' }, { status: 400 });
    }
    const documentId = await undoReferralPpot({ referralId: id, revision, title, category, docDate, by: { uid: caller.uid, name: caller.profile.displayName || caller.email || '', role: caller.role } });
    return NextResponse.json({ ok: true, documentId });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof ReferralDocumentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('Undo referral PPOT filing failed', err);
    return NextResponse.json({ error: 'Could not confirm the correction. Refresh the documents before trying again.' }, { status: 500 });
  }
}
