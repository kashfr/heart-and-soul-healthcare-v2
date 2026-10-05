import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { listReferralDocuments } from '@/lib/referralDocumentsServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/referrals/[id]/documents  papers filed against this referral. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ['admin', 'supervisor', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  return NextResponse.json({ documents: await listReferralDocuments(id) });
}
