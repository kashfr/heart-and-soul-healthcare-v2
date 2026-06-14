import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ProgressNotePDF from '@/lib/pdf/ProgressNotePDF';
import type { ProgressNoteFormData, PdfAuditEntry } from '@/lib/pdf/ProgressNotePDF';
import { getServerSettings } from '@/lib/settingsServer';
import { getEditHistoryServer } from '@/lib/editHistoryServer';
import { prettyFieldName, prettyValue } from '@/lib/revisionFormat';

function sanitize(part: string): string {
  return (part || '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'note';
}

function isoFromAnyDate(v: string | undefined): string {
  if (!v) return 'unknown-date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const parts = v.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return v;
}

export async function POST(request: Request) {
  try {
    const data: ProgressNoteFormData = await request.json();

    // Pull vital-range overrides + branding so the rendered PDF uses
    // the admin-configured thresholds and org name/tagline. Both are
    // read in one settings call.
    const settings = await getServerSettings();
    const vitalsOverride = settings.vitals.rangesByAgeGroup;
    const branding = {
      orgName: settings.branding.orgName,
      tagline: settings.branding.tagline,
    };

    // When a saved note id is supplied (?id=), append its audit trail so
    // post-submission amendments travel with the export. Read server-side
    // (authoritative) and pre-formatted here so the PDF stays a dumb renderer.
    // Unsaved previews pass no id and get no audit section.
    const noteId = new URL(request.url).searchParams.get('id');
    let editHistory: PdfAuditEntry[] | undefined;
    if (noteId) {
      const rows = await getEditHistoryServer(noteId);
      editHistory = rows.map((r) => ({
        editedByName: r.editedByName,
        editedByRole: r.editedByRole,
        editedAt: r.editedAt ? r.editedAt.toLocaleString('en-US') : '—',
        ...(r.reason ? { reason: r.reason } : {}),
        ...(r.correctionNote ? { correctionNote: r.correctionNote } : {}),
        ...(r.action ? { action: r.action } : {}),
        changes: Object.keys(r.changes).map((k) => ({
          field: prettyFieldName(k),
          from: prettyValue(r.changes[k]?.from),
          to: prettyValue(r.changes[k]?.to),
        })),
      }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ProgressNotePDF, { data, vitalsOverride, branding, editHistory }) as any;
    const buffer = await renderToBuffer(element);

    const clientName = sanitize(data.q3_clientName || 'client');
    const dateStr = isoFromAnyDate(data.q6_dateofService);
    const filename = `Progress_Note_${clientName}_${dateStr}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
