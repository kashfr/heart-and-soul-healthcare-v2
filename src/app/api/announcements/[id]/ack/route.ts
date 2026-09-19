import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { acknowledgeAnnouncement } from '@/lib/announcementServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST: the signed-in user records that she read this announcement. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const r = await acknowledgeAnnouncement(id, caller);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, already: r.already });
}
