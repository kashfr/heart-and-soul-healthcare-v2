import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import VerbalOrderPDF from './VerbalOrderPDF';
import type { VerbalOrder } from '../verbalOrderShared';

// A 1x1 white PNG stands in for the canvas signature.
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

function order(over: Partial<VerbalOrder> = {}): VerbalOrder {
  return {
    id: 'abc123',
    patientId: 'p1',
    patientName: 'ZZ Test Client',
    patientDob: '1985-06-07',
    orderType: 'medication',
    physicianName: 'Dr. Test',
    physicianPhone: '(678) 644-0337',
    physicianFax: '6788023121',
    physicianSpecialty: 'Neurology',
    orderText: 'Increase Keppra to 500 mg by mouth twice daily starting tonight. Continue seizure precautions. Call with any breakthrough seizure activity.\nMonitor for drowsiness for the first week.',
    readBackVerified: true,
    nurseId: 'n1',
    nurseName: 'ZZ TEST ACCOUNT - DO NOT ASSIGN',
    nurseCredential: 'LPN',
    nurseSignature: PNG_1PX,
    takenAt: '2026-09-16T23:34:14.071Z',
    takenDate: '2026-09-16',
    status: 'faxed',
    marChangeRequestId: '',
    marOrderId: '',
    marChangeType: '',
    marMedName: '',
    fax: null,
    signed: null,
    reminderSentAt: null,
    escalatedAt: null,
    createdAt: null,
    ...over,
  };
}

async function pages(el: React.ReactElement): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await renderToBuffer(el as any);
  const doc = await PDFDocument.load(new Uint8Array(buf));
  return doc.getPageCount();
}

// The physician authentication form must fit ONE page: a second page doubles
// the fax cost and reads as a stray sheet in a physician's office. Guards the
// spacing against the overflow seen on the first live fax (2026-09-16).
describe('VerbalOrderPDF', () => {
  it('unsigned form with e-sign QR fits on one page', async () => {
    const esignUrl = 'https://www.heartandsoulhc.org/physician/verbal-order?t=bdG1ogD_7Usk7d9NbSeQ0VJP48ATGw-a';
    const esignQrDataUrl = await QRCode.toDataURL(esignUrl, { margin: 1, width: 240 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = React.createElement(VerbalOrderPDF as any, { order: order(), returnFax: '4702351891', esignUrl, esignQrDataUrl });
    expect(await pages(el)).toBe(1);
  }, 30000);

  it('signed record fits on one page', async () => {
    const signed = order({
      status: 'signed',
      signed: { method: 'esign', signedDate: '2026-09-17', physicianPrintedName: 'Dr. Test', physicianSignature: PNG_1PX, receivedAt: '2026-09-17T12:00:00Z', receivedBy: '', receivedByName: 'Physician (signed online)', documentId: 'd1', inboundFaxFileName: '' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = React.createElement(VerbalOrderPDF as any, { order: signed, returnFax: '4702351891' });
    expect(await pages(el)).toBe(1);
  }, 30000);
});
