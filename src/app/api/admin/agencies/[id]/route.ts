import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { updatePartnerAgency, archivePartnerAgency } from '@/lib/partnerAgencies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: {
    name?: string; email?: string; phone?: string; contactName?: string; notes?: string;
    counties?: string[]; services?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  let agency;
  try {
    agency = await updatePartnerAgency(id, body, caller);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not update agency.' },
      { status: 400 }
    );
  }
  if (!agency) {
    return NextResponse.json({ error: 'Agency not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, agency });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const ok = await archivePartnerAgency(id, caller);
  if (!ok) {
    return NextResponse.json({ error: 'Agency not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
