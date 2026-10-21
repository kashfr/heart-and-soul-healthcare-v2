import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, requireAssistant, readAssistantDocument } from '@/lib/assistantClientsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const context = await requireAssistant(request);
    const { id, docId } = await params;
    const file = await readAssistantDocument(context, id, docId);
    return new Response(new Uint8Array(file.bytes), { headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw err;
  }
}
