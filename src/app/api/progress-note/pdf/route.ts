import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ProgressNotePDF from '@/lib/pdf/ProgressNotePDF';
import type { ProgressNoteData } from '@/lib/pdf/ProgressNotePDF';

export async function POST(request: Request) {
  try {
    const data: ProgressNoteData = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(ProgressNotePDF, { data }) as any;
    const buffer = await renderToBuffer(element);

    const clientName = data.client.name.replace(/\s+/g, '_');
    const dateStr = data.shift.dateOfService.replace(/\//g, '-');
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
