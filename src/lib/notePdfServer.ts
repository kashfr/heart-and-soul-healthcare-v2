import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import ProgressNotePDF from '@/lib/pdf/ProgressNotePDF';
import type { ProgressNoteFormData, PdfAuditEntry, PdfFieldVersion } from '@/lib/pdf/ProgressNotePDF';
import { getServerSettings } from '@/lib/settingsServer';
import { getEditHistoryServer } from '@/lib/editHistoryServer';
import { buildFieldAmendments } from '@/lib/revisionFormat';
import { formatDateUS, formatDateUSFile } from '@/lib/dateFormat';

/**
 * Server-side rendering of a progress / oversight note to PDF bytes, shared
 * by the on-demand export route and the auto-filing of oversight notes into
 * the client's Documents tab. Both must produce the same document: the note
 * body with in-place amendments, plus the audit trail when a saved note id
 * is supplied.
 */

function sanitize(part: string): string {
  return (part || '').replace(/[^a-zA-Z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'note';
}

export function isoFromAnyDate(v: string | undefined): string {
  if (!v) return 'unknown-date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const parts = v.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return v;
}

// Display string for a struck-through prior value. Never truncated (the record
// must stay legible); a blank prior shows as "(blank)" so an added field reads
// clearly. Mirrors the on-screen displayOld.
function displayOldPdf(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(blank)';
  if (typeof v === 'string') return v.startsWith('data:image/') ? '(signature image)' : formatDateUS(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function fmtWhenPdf(d: Date | null): string {
  if (!d) return 'an earlier edit';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The audit trail of a saved note, pre-formatted for the PDF renderer. */
export async function loadNoteAuditForPdf(noteId: string): Promise<{
  editHistory: PdfAuditEntry[];
  fieldAmendments: Record<string, PdfFieldVersion[]>;
}> {
  const rows = await getEditHistoryServer(noteId);
  const editHistory = rows.map((r) => ({
    editedByName: r.editedByName,
    editedByRole: r.editedByRole,
    editedAt: r.editedAt ? r.editedAt.toLocaleString('en-US') : 'Unknown',
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.correctionNote ? { correctionNote: r.correctionNote } : {}),
    ...(r.action ? { action: r.action } : {}),
  }));
  // Per-field prior values for the in-place amendment rendering in the note
  // body (the "what changed"); the audit section becomes the "who/why" log.
  const rawAmendments = buildFieldAmendments(rows);
  const fieldAmendments: Record<string, PdfFieldVersion[]> = {};
  for (const [key, versions] of Object.entries(rawAmendments)) {
    fieldAmendments[key] = versions.map((v) => ({
      oldValue: displayOldPdf(v.oldValue),
      correctedAt: fmtWhenPdf(v.correctedAt),
      correctedBy: v.correctedBy || '',
    }));
  }
  return { editHistory, fieldAmendments };
}

/** Render a note to PDF. Pass `noteId` to append the saved note's audit trail. */
export async function renderNotePdf(data: ProgressNoteFormData, noteId?: string | null): Promise<Buffer> {
  // Vital-range overrides + branding so the rendered PDF uses the
  // admin-configured thresholds and org name/tagline.
  const settings = await getServerSettings();
  const vitalsOverride = settings.vitals.rangesByAgeGroup;
  const branding = {
    orgName: settings.branding.orgName,
    tagline: settings.branding.tagline,
  };
  let editHistory: PdfAuditEntry[] | undefined;
  let fieldAmendments: Record<string, PdfFieldVersion[]> | undefined;
  if (noteId) {
    ({ editHistory, fieldAmendments } = await loadNoteAuditForPdf(noteId));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ProgressNotePDF, { data, vitalsOverride, branding, editHistory, fieldAmendments }) as any;
  return renderToBuffer(element);
}

/** 'Oversight_Note_Ann_Torres_09-07-2026.pdf' / 'Progress_Note_...'. */
export function notePdfFilename(data: { q3_clientName?: string; q6_dateofService?: string; noteType?: string }): string {
  const clientName = sanitize(data.q3_clientName || 'client');
  const dateStr = isoFromAnyDate(data.q6_dateofService);
  const kind = data.noteType === 'rn-oversight-visit' ? 'Oversight_Note' : 'Progress_Note';
  return `${kind}_${clientName}_${formatDateUSFile(dateStr)}.pdf`;
}
