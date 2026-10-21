import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { srfaxGetFaxStatus } from '@/lib/fax/srfax';
import { recordFaxStatus, verifyFaxWebhookKey } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SRFax sNotifyURL webhook. The doc describes a POST, but in practice SRFax
 * calls the URL with a GET (seen on the first live fax, 2026-09-16), so both
 * are accepted. Either way the callback is treated only as a TRIGGER: the
 * status is then read from SRFax's Get_FaxStatus for the order's current
 * job, never taken from the callback's own fields, so a forged or stale
 * notification can't flip an order's fax state. The URL carries a per-order
 * key (an HMAC of the order id under CRON_SECRET, so the secret itself never
 * leaves the server). The cron also polls, so a missed callback self-heals.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (!verifyFaxWebhookKey(id, url.searchParams.get('key') || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const snap = await adminDb().collection('verbalOrders').doc(id).get();
  const faxDetailsId = String(((snap.data() || {}).fax || {}).faxDetailsId || '');
  if (!snap.exists || !faxDetailsId) return NextResponse.json({ ok: true, ignored: true });
  const st = await srfaxGetFaxStatus(faxDetailsId);
  if (st.ok && st.sentStatus && st.sentStatus !== 'In Progress') {
    await recordFaxStatus(id, { sentStatus: st.sentStatus, errorCode: st.errorCode, dateSent: st.dateSent, faxDetailsId });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
