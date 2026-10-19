// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { prepareFaxAttachments } from './faxAttachments';
import { FAX_MAX_PAGES, FAX_MAX_PDF_BYTES } from './faxShared';
async function attachment(name: string, widths = [100]) {
  const doc = await PDFDocument.create(); widths.forEach((w) => doc.addPage([w, 200]));
  return { fileName: name, pdfBase64: Buffer.from(await doc.save()).toString('base64') };
}
describe('fax attachments', () => {
  it('combines all pages in attachment order, preserving page dimensions', async () => {
    const result = await prepareFaxAttachments([await attachment('first.pdf', [101, 102]), await attachment('second.pdf', [201])], true);
    expect((await PDFDocument.load(result.pdf)).getPages().map((p) => p.getWidth())).toEqual([101, 102, 201]);
    expect(result.fileName).toBe('Fax_Attachments.pdf');
  });
  it('retains the name for a single attachment', async () => {
    expect((await prepareFaxAttachments([await attachment('records.pdf')], false)).fileName).toBe('records.pdf');
  });
  it('flattens filled form values before merging', async () => {
    const doc = await PDFDocument.create(); const page = doc.addPage();
    const field = doc.getForm().createTextField('patient'); field.setText('TEST CLIENT'); field.addToPage(page);
    const result = await prepareFaxAttachments([{ fileName: 'form.pdf', pdfBase64: Buffer.from(await doc.save()).toString('base64') }, await attachment('records.pdf')], false);
    const merged = await PDFDocument.load(result.pdf);
    expect(merged.getPageCount()).toBe(2);
    expect(merged.getForm().getFields()).toHaveLength(0);
    expect(merged.getPage(0).node.Contents()).toBeDefined();
  });
  it('enforces the combined page limit including the optional cover', async () => {
    const full = await attachment('full.pdf', Array(FAX_MAX_PAGES).fill(100));
    await expect(prepareFaxAttachments([full], true)).rejects.toThrow('including the cover');
    expect((await PDFDocument.load((await prepareFaxAttachments([full], false)).pdf)).getPageCount()).toBe(FAX_MAX_PAGES);
    await expect(prepareFaxAttachments([full, await attachment('extra.pdf')], false)).rejects.toThrow('including the cover');
  });
  it('rejects the entire packet if any attachment is invalid', async () => {
    await expect(prepareFaxAttachments([await attachment('valid.pdf'), { fileName: 'broken.pdf', pdfBase64: Buffer.from('%PDF-broken').toString('base64') }], false)).rejects.toThrow('broken.pdf');
  });
  it('rejects empty PDFs, invalid base64, and too many attachments', async () => {
    await expect(prepareFaxAttachments([], false)).rejects.toThrow('between 1');
    await expect(prepareFaxAttachments(Array(11).fill({}), false)).rejects.toThrow('between 1');
    await expect(prepareFaxAttachments([{ fileName: 'bad.pdf', pdfBase64: '!!!!' }], false)).rejects.toThrow('invalid');
    const empty = await PDFDocument.create();
    await expect(prepareFaxAttachments([{ fileName: 'empty.pdf', pdfBase64: Buffer.from(await empty.save({ addDefaultPage: false })).toString('base64') }], false)).rejects.toThrow('no pages');
  });
  it('enforces total decoded bytes across attachments', async () => {
    const small = await attachment('a.pdf');
    const padded = Buffer.concat([Buffer.from(small.pdfBase64, 'base64'), Buffer.alloc(FAX_MAX_PDF_BYTES / 2, 32)]).toString('base64');
    await expect(prepareFaxAttachments([{ fileName: 'a.pdf', pdfBase64: padded }, { fileName: 'b.pdf', pdfBase64: padded }], false)).rejects.toThrow('together under 10 MB');
  });
});
