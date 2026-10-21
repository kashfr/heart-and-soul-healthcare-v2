import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, requireAssistant } from '@/lib/assistantClientsServer';
import { saveAssistantAuthorization } from '@/lib/assistantClientRecordsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; authId: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function PUT(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    const { id, authId } = await params;
    let body: unknown;
    try { body = await request.json(); } catch { throw new AssistantClientError(400, 'Invalid authorization.'); }
    return NextResponse.json(await saveAssistantAuthorization(context, id, authId, body), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
