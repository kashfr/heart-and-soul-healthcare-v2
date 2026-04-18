import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { getSubmission } from './submissions';
import type { ProgressNoteFormData } from './submissions';

export type ExportFormat = 'zip' | 'merged-pdf';

export interface BatchExportProgress {
  total: number;
  completed: number;
  currentId?: string;
  stage: 'fetching' | 'assembling' | 'done';
}

export interface BatchExportResult {
  blob: Blob;
  filename: string;
  dateRange: { start: string | null; end: string | null };
  pdfCount: number;
}

const CONCURRENCY = 3;

function sanitize(part: string): string {
  return part.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function isoDate(s: string): string | null {
  // Input may be YYYY-MM-DD already or MM/DD/YYYY
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return null;
}

function pdfFilenameFor(form: ProgressNoteFormData): string {
  const date = isoDate(form.q6_dateofService) || 'unknown-date';
  const client = sanitize(form.q3_clientName || 'client');
  const nurse = sanitize(form.q11_nurseName || 'nurse');
  return `${date}_${client}_${nurse}.pdf`;
}

async function fetchPdfForSubmission(id: string): Promise<{ form: ProgressNoteFormData; bytes: Uint8Array }> {
  const form = await getSubmission(id);
  if (!form) throw new Error(`Submission ${id} not found`);
  // Send the raw form data — the PDF renderer now reads every q##_* field
  // directly instead of a lossy transformed shape.
  const res = await fetch('/api/progress-note/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
  if (!res.ok) {
    throw new Error(`PDF render failed for ${id}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return { form, bytes: new Uint8Array(buf) };
}

async function fetchAllWithPool(
  ids: string[],
  onProgress?: (p: BatchExportProgress) => void
): Promise<Array<{ id: string; form: ProgressNoteFormData; bytes: Uint8Array }>> {
  const results: Array<{ id: string; form: ProgressNoteFormData; bytes: Uint8Array }> = [];
  let cursor = 0;
  let completed = 0;

  const worker = async () => {
    while (cursor < ids.length) {
      const i = cursor++;
      const id = ids[i];
      onProgress?.({ total: ids.length, completed, currentId: id, stage: 'fetching' });
      const { form, bytes } = await fetchPdfForSubmission(id);
      results.push({ id, form, bytes });
      completed++;
      onProgress?.({ total: ids.length, completed, currentId: id, stage: 'fetching' });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  // Preserve input order for downstream merge (alphabetic/date ordering handled by caller)
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return results;
}

function dateRangeOf(forms: ProgressNoteFormData[]): { start: string | null; end: string | null } {
  const dates = forms.map((f) => isoDate(f.q6_dateofService)).filter((d): d is string => !!d).sort();
  return { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null };
}

function archiveFilename(range: { start: string | null; end: string | null }, ext: 'zip' | 'pdf'): string {
  if (range.start && range.end && range.start !== range.end) {
    return `progress-notes-${range.start}_to_${range.end}.${ext}`;
  }
  if (range.start) {
    return `progress-notes-${range.start}.${ext}`;
  }
  const today = new Date().toISOString().slice(0, 10);
  return `progress-notes-${today}.${ext}`;
}

export async function buildZip(
  ids: string[],
  onProgress?: (p: BatchExportProgress) => void
): Promise<BatchExportResult> {
  const items = await fetchAllWithPool(ids, onProgress);
  onProgress?.({ total: ids.length, completed: ids.length, stage: 'assembling' });

  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const item of items) {
    let name = pdfFilenameFor(item.form);
    let n = 2;
    while (usedNames.has(name)) {
      name = name.replace(/\.pdf$/, `-${n}.pdf`);
      n++;
    }
    usedNames.add(name);
    zip.file(name, item.bytes);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const range = dateRangeOf(items.map((i) => i.form));
  onProgress?.({ total: ids.length, completed: ids.length, stage: 'done' });
  return {
    blob,
    filename: archiveFilename(range, 'zip'),
    dateRange: range,
    pdfCount: items.length,
  };
}

export async function buildMergedPdf(
  ids: string[],
  onProgress?: (p: BatchExportProgress) => void
): Promise<BatchExportResult> {
  const items = await fetchAllWithPool(ids, onProgress);
  onProgress?.({ total: ids.length, completed: ids.length, stage: 'assembling' });

  const merged = await PDFDocument.create();
  for (const item of items) {
    const src = await PDFDocument.load(item.bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  const bytes = await merged.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const range = dateRangeOf(items.map((i) => i.form));
  onProgress?.({ total: ids.length, completed: ids.length, stage: 'done' });
  return {
    blob,
    filename: archiveFilename(range, 'pdf'),
    dateRange: range,
    pdfCount: items.length,
  };
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
