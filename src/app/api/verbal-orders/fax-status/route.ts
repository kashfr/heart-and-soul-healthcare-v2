import { NextResponse } from 'next/server';
import { recordFaxStatus, verifyFaxWebhookKey } from '@/lib/verbalOrderServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SRFax sNotifyURL webhook. SRFax POSTs the fax status record (form fields)
 * when a queued fax completes. The URL carries a per-order key (an HMAC of the
 * order id under CRON_SECRET, so the secret itself never leaves the server)
 * and the verbal order id, both set by us when the fax was queued. The cron also polls status, so a
 * missed webhook self-heals.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  if (!verifyFaxWebhookKey(id, url.searchParams.get('key') || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let fields: Record<string, string> = {};
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      fields = (await request.json()) as Record<string, string>;
    } else {
      const form = await request.formData();
      form.forEach((v, k) => {
        fields[k] = String(v);
      });
    }
  } catch {
    return NextResponse.json({ error: 'Unreadable body' }, { status: 400 });
  }
  await recordFaxStatus(id, { sentStatus: fields.SentStatus || '', errorCode: fields.ErrorCode || '', dateSent: fields.DateSent || '', faxDetailsId: String(fields.FaxDetailsID || '') });
  return NextResponse.json({ ok: true });
}
