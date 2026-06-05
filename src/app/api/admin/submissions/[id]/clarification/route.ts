import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { applyClarification, type ClarificationAction } from '@/lib/clarificationServer';

const ACTIONS: ClarificationAction[] = ['flag', 'respond', 'resolve'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    // Nurses are allowed in so an author can *respond* to a clarification on
    // her own note; the per-action authorization (reviewer vs author) happens
    // in applyClarification.
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const action = String(body?.action || '') as ClarificationAction;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }
  const text = String(body?.text || '');
  const kind = body?.kind === 'correction' ? 'correction' : 'clarification';

  const result = await applyClarification(id, caller, action, text, kind);
  if (!result.ok) {
    const status =
      result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, noteId: result.noteId });
}
