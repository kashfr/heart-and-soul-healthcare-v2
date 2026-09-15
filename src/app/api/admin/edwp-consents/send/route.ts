import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { createEdwpConsentInvite } from '@/lib/edwpConsentServer';
import { sendEdwpConsentRequest } from '@/lib/emails/edwpConsent';
import { buildEdwpConsentUrl } from '@/lib/shareLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email a client (or their representative) a link to the consent form. */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: { clientName?: string; email?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const clientName = (body.clientName ?? '').trim().slice(0, 120);
  const email = (body.email ?? '').trim().slice(0, 120);
  const note = (body.note ?? '').trim().slice(0, 1000);
  if (!clientName) return NextResponse.json({ error: 'Client name is required.' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });

  const { invite, token } = await createEdwpConsentInvite({ clientName, email }, caller);
  const link = buildEdwpConsentUrl(token);
  const result = await sendEdwpConsentRequest({
    to: email,
    clientName,
    link,
    sentByName: caller.profile.displayName || undefined,
    note,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: `The invite was recorded but the email failed to send: ${result.error ?? 'unknown error'}`, invite, link },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true, invite, link });
}
