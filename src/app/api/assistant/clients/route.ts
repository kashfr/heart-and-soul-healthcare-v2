import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, listAssistantClients, requireAssistant } from '@/lib/assistantClientsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const context = await requireAssistant(request);
    return NextResponse.json(await listAssistantClients(context), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw err;
  }
}
