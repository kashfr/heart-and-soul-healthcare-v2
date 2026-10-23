import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, requireAssistant } from '@/lib/assistantClientsServer';
import { getAssistantRecord, isAssistantRecordKind, saveAssistantRecord } from '@/lib/assistantClientRecordsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; kind: string }> };
const headers = { 'Cache-Control': 'private, no-store' };
async function kindOf(params: Context['params']) {
  const { id, kind } = await params;
  if (!isAssistantRecordKind(kind)) throw new AssistantClientError(404, 'Record not found.');
  return { id, kind };
}
export async function GET(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    const { id, kind } = await kindOf(params);
    return NextResponse.json(await getAssistantRecord(context, id, kind), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const context = await requireAssistant(request);
    const { id, kind } = await kindOf(params);
    let body: unknown;
    try { body = await request.json(); } catch { throw new AssistantClientError(400, 'Invalid record details.'); }
    return NextResponse.json(await saveAssistantRecord(context, id, kind, body), { headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
