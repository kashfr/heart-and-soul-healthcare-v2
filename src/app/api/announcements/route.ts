import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { publishAnnouncement } from '@/lib/announcementServer';
import type { AnnouncementInput } from '@/lib/announcementShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST: admin publishes a "What's new" announcement to a role audience. */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  let body: Partial<AnnouncementInput>;
  try {
    body = (await request.json()) as Partial<AnnouncementInput>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input: AnnouncementInput = {
    title: String(body.title || ''),
    items: Array.isArray(body.items) ? body.items.map((it) => ({ label: String(it?.label || ''), text: String(it?.text || '') })) : [],
    footer: String(body.footer || ''),
    audience: Array.isArray(body.audience) ? body.audience.map(String) as AnnouncementInput['audience'] : [],
  };
  const r = await publishAnnouncement(input, caller);
  if (!r.ok) return NextResponse.json({ error: r.error, field: r.field }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
