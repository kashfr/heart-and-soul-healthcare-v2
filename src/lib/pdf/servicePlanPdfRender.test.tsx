// @vitest-environment node
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import ServicePlanPDF from './ServicePlanPDF';
import type { ServicePlanRecord } from '../servicePlanShared';

// A 1x1 transparent PNG, as the signature pad would produce.
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const long = (n: number) => Array.from({ length: n }, (_, i) => `Sentence number ${i + 1} of the narrative, written out in full so the line wraps.`).join(' ');

const plan: ServicePlanRecord = {
  id: 'plan1',
  patientId: 'p1',
  clientName: 'ZZ Test Client',
  dob: '2010-01-01',
  address: '1372 Peachtree St NE, Atlanta, GA 30309',
  diagnosis: 'Cerebral palsy; seizure disorder',
  functionalLimitations: long(3),
  serviceTypes: ['personal-care-assistant', 'nursing'],
  nutritionalNeeds: 'Pureed diet, thickened liquids',
  allergies: 'Penicillin',
  expectedTimesFrequency: 'Monday through Friday, 8 AM to 4 PM',
  expectedDuration: 'Ongoing, reviewed every 12 months',
  descriptionOfServices: long(8),
  regularDiet: 'no',
  specialDiets: ['low-salt'],
  specialDietOther: 'Diabetic',
  specialTreatments: 'G-tube feeds',
  specialEquipment: 'Hoyer lift, wheelchair',
  behaviors: long(2),
  tubBath: 'no',
  bedBath: 'yes',
  lotionToBack: 'yes',
  goals: Array.from({ length: 6 }, (_, i) => ({ goal: `Goal ${i + 1}: ${long(1)}`, objective: `Objective ${i + 1}: ${long(1)}` })),
  medications: Array.from({ length: 10 }, (_, i) => `Medication ${i + 1}, 10 mg, PO, Twice daily (BID)`).join('\n'),
  dischargePlans: long(2),
  supervisorName: 'S. Lilian Payne',
  supervisorCredentials: 'MSN, RN',
  signature: SIG,
  revisesPlanId: '',
  signedDate: '2026-09-28',
  createdAt: null,
  createdBy: 'u1',
  createdByName: 'S. Lilian Payne',
  documentId: '',
};

describe('ServicePlanPDF', () => {
  it('renders a full plan across pages with the signature', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
    const el = React.createElement(ServicePlanPDF, { plan, dob: '01/01/2010', signedDate: '09/28/2026' }) as any;
    const pdf = await renderToBuffer(el);
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(4);
  }, 60_000);

  it('renders a short plan without a signature image', async () => {
    const short = { ...plan, functionalLimitations: 'Short', descriptionOfServices: 'Short', behaviors: '', goals: [{ goal: 'G', objective: 'O' }], medications: 'None', signature: '' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-pdf's renderToBuffer wants its own element type
    const el = React.createElement(ServicePlanPDF, { plan: short, dob: '01/01/2010', signedDate: '09/28/2026' }) as any;
    const pdf = await renderToBuffer(el);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeLessThanOrEqual(2);
  }, 60_000);
});
