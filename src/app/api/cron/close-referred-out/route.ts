import { NextResponse } from 'next/server';
import { autoCloseStaleReferredOut, REFERRED_OUT_AUTO_CLOSE_DAYS } from '@/lib/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily sweep (Vercel Cron) that moves referrals out of "Referred Out" into
// "Closed" once they've sat there long enough. Vercel attaches the CRON_SECRET
// as a Bearer token to scheduled invocations; we fail closed if it's unset or
// mismatched, so this mutation endpoint is never publicly callable.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await autoCloseStaleReferredOut(REFERRED_OUT_AUTO_CLOSE_DAYS);
    return NextResponse.json({ ok: true, days: REFERRED_OUT_AUTO_CLOSE_DAYS, ...result });
  } catch (err) {
    console.error('Auto-close sweep failed:', err);
    return NextResponse.json({ error: 'Sweep failed.' }, { status: 500 });
  }
}
