import { NextResponse } from 'next/server';
import { applyPandadocEvents, verifyPandadocSignature } from '@/lib/pandadocServer';
import { parsePandadocWebhook } from '@/lib/pandadocShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1_000_000;

/**
 * POST /api/pandadoc/webhook?signature=<hex HMAC-SHA256 of the raw body>
 *
 * PandaDoc's webhook (Dev Center > Webhooks) for document state changes.
 * The signature is checked against PANDADOC_WEBHOOK_KEY before anything is
 * read; only documents whose name matches Settings > E-signature tracking
 * are kept. Always answers quickly so PandaDoc doesn't retry needlessly.
 */
export async function POST(request: Request) {
  if (!process.env.PANDADOC_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Too large.' }, { status: 413 });
  }
  const raw = await request.text();
  const signature = new URL(request.url).searchParams.get('signature') || '';
  if (!verifyPandadocSignature(raw, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const changed = await applyPandadocEvents(parsePandadocWebhook(body));
  return NextResponse.json({ ok: true, changed });
}
