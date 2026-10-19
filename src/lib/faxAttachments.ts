import { PDFDocument } from 'pdf-lib';
import { cleanFaxFileName, FAX_MAX_PDF_BYTES, FAX_MAX_PAGES } from './faxShared';

export const FAX_MAX_ATTACHMENTS = 10;
export class FaxAttachmentError extends Error {}

/** Validate all attachments before sending; preserve the user's page order. */
export async function prepareFaxAttachments(raw: unknown, includeCover: boolean): Promise<{ pdf: Buffer; fileName: string }> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > FAX_MAX_ATTACHMENTS) throw new FaxAttachmentError(`Choose between 1 and ${FAX_MAX_ATTACHMENTS} PDFs.`);
  const out = await PDFDocument.create();
  let bytes = 0;
  const names: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || typeof item.pdfBase64 !== 'string') throw new FaxAttachmentError('Each attachment must be a PDF.');
    const name = cleanFaxFileName(String(item.fileName || 'document.pdf'));
    names.push(name);
    const b64 = item.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    if (!b64 || b64.length > Math.ceil(FAX_MAX_PDF_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) throw new FaxAttachmentError(`${name}: invalid PDF attachment or file too large.`);
    const pdf = Buffer.from(b64, 'base64');
    bytes += pdf.length;
    if (bytes > FAX_MAX_PDF_BYTES) throw new FaxAttachmentError('Keep all attachments together under 10 MB.');
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new FaxAttachmentError(`${name}: choose a valid PDF.`);
    let doc: PDFDocument;
    try { doc = await PDFDocument.load(pdf); } catch { throw new FaxAttachmentError(`${name}: could not read this PDF. Save an unprotected PDF and try again.`); }
    if (doc.getPageCount() < 1) throw new FaxAttachmentError(`${name}: this PDF has no pages.`);
    if (out.getPageCount() + doc.getPageCount() + (includeCover ? 1 : 0) > FAX_MAX_PAGES) throw new FaxAttachmentError(`Fax at most ${FAX_MAX_PAGES} pages including the cover sheet.`);
    // Flatten filled fields so values survive copying pages between documents.
    try {
      doc.getForm().flatten();
      for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
    } catch { throw new FaxAttachmentError(`${name}: could not combine this PDF. Print it to a new PDF and try again.`); }
  }
  return { pdf: Buffer.from(await out.save()), fileName: names.length === 1 ? names[0] : 'Fax_Attachments.pdf' };
}

/** Supporting attachments are optional; existing generated forms stay first. */
export async function optionalFaxAttachments(raw: unknown): Promise<Buffer | undefined> {
  if (raw === undefined || (Array.isArray(raw) && raw.length === 0)) return undefined;
  return (await prepareFaxAttachments(raw, false)).pdf;
}
export async function appendFaxPdfs(primary: Buffer, supporting?: Buffer, coverPages = 0): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const bytes of [primary, supporting].filter((b): b is Buffer => !!b)) {
    const doc = await PDFDocument.load(bytes);
    if (out.getPageCount() + doc.getPageCount() + coverPages > FAX_MAX_PAGES) throw new FaxAttachmentError(`Fax at most ${FAX_MAX_PAGES} pages including the cover.`);
    doc.getForm().flatten();
    for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
  }
  const result = Buffer.from(await out.save());
  if (result.length > FAX_MAX_PDF_BYTES) throw new FaxAttachmentError('The complete fax packet must be at most 10 MB.');
  return result;
}

/** Bound actual bytes, including clients that omit Content-Length. */
export async function readFaxJson(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new FaxAttachmentError('Request too large. Keep attachments under 10 MB.'); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new FaxAttachmentError('Invalid request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new FaxAttachmentError('Invalid request.');
  return body;
}
