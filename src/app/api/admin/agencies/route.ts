import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { listPartnerAgencies, createPartnerAgency } from '@/lib/partnerAgencies';

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

  const agencies = await listPartnerAgencies();
  return NextResponse.json({ agencies });
}

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

  let body: {
    name?: string; email?: string; phone?: string; contactName?: string; notes?: string;
    counties?: string[]; services?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const agency = await createPartnerAgency(
      {
        name: body.name ?? '',
        email: body.email ?? '',
        phone: body.phone,
        contactName: body.contactName,
        notes: body.notes,
        counties: body.counties,
        services: body.services,
      },
      caller
    );
    return NextResponse.json({ ok: true, agency });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not create agency.' },
      { status: 400 }
    );
  }
}
