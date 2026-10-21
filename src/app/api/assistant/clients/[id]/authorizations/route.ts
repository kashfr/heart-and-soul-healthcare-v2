import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, requireAssistant } from '@/lib/assistantClientsServer';
import { listAssistantAuthorizations, saveAssistantAuthorization } from '@/lib/assistantClientRecordsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    return NextResponse.json(await listAssistantAuthorizations(context, (await params).id), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new AssistantClientError(400, 'Invalid authorization.'); }
    return NextResponse.json(await saveAssistantAuthorization(context, (await params).id, null, body), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
