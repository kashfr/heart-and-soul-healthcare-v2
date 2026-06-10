import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { applyStagedChanges } from '@/lib/marServer';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serverToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Maintaining the MAR per physician orders is within an RN/LPN's scope; staff
  // (admin/supervisor) can also apply. CNA/HHA cannot.
  const credential = caller.profile.credential || '';
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  if (!isStaff && credential !== 'RN' && credential !== 'LPN') {
    return NextResponse.json(
      { error: 'Only RN/LPN nurses or supervisors can apply medication changes.' },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const sourceNoteId = String(body?.sourceNoteId || '').trim();
  if (!sourceNoteId) {
    return NextResponse.json({ error: 'sourceNoteId is required.' }, { status: 400 });
  }
  const today = ISO_DATE_RE.test(String(body?.today || '')) ? String(body.today) : serverToday();

  const result = await applyStagedChanges(sourceNoteId, caller, today);
  return NextResponse.json(result);
}
