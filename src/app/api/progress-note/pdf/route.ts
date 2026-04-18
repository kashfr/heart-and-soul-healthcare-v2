import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ProgressNotePDF from '@/lib/pdf/ProgressNotePDF';
import type { ProgressNoteFormData } from '@/lib/pdf/ProgressNotePDF';

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ProgressNotePDF, { data }) as any;
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
