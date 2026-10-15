import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { AssistantClientError, requireAssistant, uploadAssistantDocument } from '@/lib/assistantClientsServer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAssistant(request);
    if (!context.grant.uploadDocuments) throw new AssistantClientError(403, 'Document uploads are not enabled for your account.');
    if (Number(request.headers.get('content-length') || 0) > 21 * 1024 * 1024) throw new AssistantClientError(413, 'Upload a file smaller than 20 MB.');
    let body: FormData;
    try { body = await request.formData(); } catch { throw new AssistantClientError(400, 'Invalid upload.'); }
    const file = body.get('file');
    if (!(file instanceof File)) throw new AssistantClientError(400, 'Choose a file to upload.');
    const field = (key: string) => typeof body.get(key) === 'string' ? body.get(key) as string : '';
    return NextResponse.json(await uploadAssistantDocument(context, (await params).id, file, { title: field('title'), category: field('category'), docDate: field('docDate') }), { status: 201, headers });
  } catch (err) {
    if (err instanceof AdminAuthError || err instanceof AssistantClientError) return NextResponse.json({ error: err.message }, { status: err.status, headers });
    throw err;
  }
}
