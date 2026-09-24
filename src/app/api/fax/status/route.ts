import { NextResponse } from 'next/server';
import { refreshOutboundFaxStatus, verifyOutboundFaxWebhookKey } from '@/lib/faxCenterServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SRFax sNotifyURL webhook for Fax Center sends. Same contract as the
 * verbal-order one: accepted as GET or POST, treated only as a trigger (the
 * status is read back from Get_FaxStatus, never taken from the callback),
 * and authorized by a per-fax HMAC key. The cron polls too, so a missed
 * callback self-heals.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (!verifyOutboundFaxWebhookKey(id, url.searchParams.get('key') || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await refreshOutboundFaxStatus(id);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
