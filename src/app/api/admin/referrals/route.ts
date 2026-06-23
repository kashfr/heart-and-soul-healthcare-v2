import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { listReferrals } from '@/lib/referrals';
import { summarizeSharesByReferral } from '@/lib/referralShares';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Fetch the referrals and the per-referral share roll-up in parallel, then
  // attach each summary so the board/table can render the "Shared" badge without
  // a second round-trip. A share-summary hiccup must not sink the whole list.
  const [referrals, shareMap] = await Promise.all([
    listReferrals(),
    summarizeSharesByReferral().catch((err) => {
      console.error('summarizeSharesByReferral failed (non-fatal):', err);
      return {} as Record<string, never>;
    }),
  ]);

  const withShares = referrals.map((r) => ({ ...r, shareSummary: shareMap[r.id] ?? null }));
  return NextResponse.json({ referrals: withShares });
}
