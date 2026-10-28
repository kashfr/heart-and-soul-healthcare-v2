import { NextResponse } from 'next/server';
import { requireActivityAdmin, listClientActivity } from '@/lib/clientActivityServer';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError } from '@/lib/assistantClientError';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireActivityAdmin(request);
    return NextResponse.json(await listClientActivity((await params).id, new URL(request.url).searchParams.get('cursor')), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof AssistantClientError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw error;
  }
}
