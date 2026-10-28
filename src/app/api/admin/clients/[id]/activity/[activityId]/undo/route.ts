import { NextResponse } from 'next/server';
import { requireActivityAdmin, undoClientActivity } from '@/lib/clientActivityServer';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError } from '@/lib/assistantClientError';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string; activityId: string }> }) {
  try {
    const caller = await requireActivityAdmin(request);
    const { id, activityId } = await params;
    return NextResponse.json(await undoClientActivity(id, activityId, caller), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof AssistantClientError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw error;
  }
}
