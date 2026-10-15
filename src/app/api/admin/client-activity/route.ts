import { NextResponse } from 'next/server';
import { requireActivityAdmin, listAllClientActivity } from '@/lib/clientActivityServer';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError } from '@/lib/assistantClientsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await requireActivityAdmin(request);
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await listAllClientActivity(params.get('staff'), params.get('cursor'), { client: params.get('client') || undefined, from: params.get('from') || undefined, through: params.get('through') || undefined }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof AssistantClientError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw error;
  }
}
