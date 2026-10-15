import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, getAssistantClient, requireAssistant, updateAssistantClient } from '@/lib/assistantClientsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    return NextResponse.json(await getAssistantClient(context, (await params).id), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new AssistantClientError(400, 'Invalid client information.'); }
    return NextResponse.json(await updateAssistantClient(context, (await params).id, body), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
