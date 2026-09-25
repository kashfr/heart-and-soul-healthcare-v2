// @vitest-environment node
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import RoiLetterPDF from './RoiLetterPDF';
import { roiIntroParagraphs } from '../roiShared';

describe('RoiLetterPDF', () => {
  it('fits on one page even with long names', async () => {
    const member = 'Maria Guadalupe Fernandez Rodriguez';
    const facility = 'Magnolia Manor Health and Rehabilitation of Greater Decatur';
    const el = React.createElement(RoiLetterPDF, {
      date: '09/25/2026',
      facilityName: facility,
      attention: 'Medical Records Department',
      facilityAddress: '2020 Example Rd, Suite 400, Decatur, GA 30033',
      memberName: member,
      dob: '03/14/1978',
      paragraphs: roiIntroParagraphs({ memberName: member, program: 'now-comp', facilityName: facility, direction: 'both' }),
      senderName: 'Kaheem Freeman',
      returnFax: '4702351891',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
    }) as any;
    const pdf = await renderToBuffer(el);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  }, 60_000);
});
