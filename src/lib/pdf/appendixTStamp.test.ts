// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { stampAppendixTIdentity } from './appendixTStamp';

const blank = readFileSync(path.join(process.cwd(), 'public', 'forms', 'gapp-appendix-t.pdf'));

describe('stampAppendixTIdentity', () => {
  it('keeps the form a single valid page and adds content', async () => {
    const out = await stampAppendixTIdentity(blank, { name: 'Jane Doe', medicaidId: '123456789012' });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    expect(Buffer.compare(out, blank)).not.toBe(0);
  });
  it('handles a missing Medicaid ID and a very long name', async () => {
    const out = await stampAppendixTIdentity(blank, { name: 'Maria Guadalupe Fernandez-Rodriguez de la Cruz Montgomery', medicaidId: '' });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
