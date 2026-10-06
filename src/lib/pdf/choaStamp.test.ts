// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFDict } from 'pdf-lib';
import { fillChoaForm } from './choaStamp';

const blank = readFileSync('public/forms/choa-medical-records-authorization.pdf');
const input = {
  memberName: 'Sample Patient', dob: '03/14/2015', returnFax: '4705550100',
  request: { location: 'Scottish Rite', dateFrom: '2026-01-01', dateTo: '2026-10-06', recordTypes: ['routine', 'labs'] as const },
};

async function generate(returnFax = input.returnFax) {
  return fillChoaForm(blank, { ...input, returnFax, request: { ...input.request, recordTypes: [...input.request.recordTypes] } });
}

describe('official CHOA PDF', () => {
  it('preserves two pages, fills canonical fields, and leaves signer choices blank', async () => {
    const pdf = await PDFDocument.load(await generate());
    expect(pdf.getPageCount()).toBe(2);
    for (const page of pdf.getPages()) {
      for (const ref of page.node.Annots()?.asArray() || []) expect(pdf.context.lookup(ref)).toBeInstanceOf(PDFDict);
    }
    const form = pdf.getForm();
    expect(form.getTextField('Name  First Middle Last').getText()).toBe('Sample Patient');
    expect(form.getTextField('Date of Birth').getText()).toBe('03/14/2015');
    expect(form.getTextField('Indicate Applicable Dates of Service').getText()).toBe('01/01/2026 through 10/06/2026');
    expect(form.getTextField('Name of Facility or Person').getText()).toBe('Heart and Soul Healthcare');
    for (const field of ['CHOA sender', 'Other recipient', 'Routin record set', 'Lab reports', 'Continuing care', 'Fax2']) expect(form.getCheckBox(field).isChecked()).toBe(true);
    for (const field of ['Other sender', 'CHOA recipient', 'Parent', 'Legal guardian', 'Health care agent', 'Legal guardian or conservator', 'Any and all records', 'Radiology/EEG images', 'Mail']) expect(form.getCheckBox(field).isChecked()).toBe(false);
    expect(form.getTextField('Fax').getText()).toBe('(470) 555-0100');
    expect(form.getTextField('Date').getText()).toBeUndefined();
    expect(form.getSignature('PatientLegal Guardian Signature')).toBeDefined();
    expect(form.getTextField('This Authorization expires in 12 months from the signed date unless an alternative date is inserted here').getText()).toBeUndefined();
    expect(form.getFieldMaybe("Children's Healthcare of Atlanta")).toBeUndefined();
    expect(form.getFieldMaybe('Other facility')).toBeUndefined();
  });
  it('does not silently replace unsupported patient-name characters', async () => {
    await expect(fillChoaForm(blank, { ...input, memberName: '患者', request: { ...input.request, recordTypes: ['routine'] } })).rejects.toThrow('complete it manually');
  });
  it('requests paper by mail when no return fax is configured', async () => {
    const form = (await PDFDocument.load(await generate(''))).getForm();
    expect(form.getCheckBox('Fax2').isChecked()).toBe(false);
    expect(form.getCheckBox('Mail').isChecked()).toBe(true);
    expect(form.getCheckBox('Paper').isChecked()).toBe(true);
    expect(form.getTextField('Fax').getText()).toBeUndefined();
  });
});
