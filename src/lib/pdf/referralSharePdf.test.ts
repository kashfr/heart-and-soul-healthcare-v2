// @vitest-environment node
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import ReferralSharePDF from './ReferralSharePDF';

describe('ReferralSharePDF', () => {
  it('renders a non-empty PDF from a shared referral view', async () => {
    const view = {
      partnerAgency: 'Acme Home Health',
      clientName: 'Jordan A. Carter',
      clientEmail: 'jordan@example.com',
      clientPhone: '(404) 555-0101',
      county: 'Fulton',
      program: 'GAPP - Georgia Pediatric Program',
      referrerName: 'Dr. Sample',
      details: [
        { label: 'Diagnosis', value: 'Cerebral palsy' },
        { label: 'Service needs', value: 'Skilled nursing, 8h/day' },
      ],
      submittedAt: new Date('2026-06-20T12:00:00Z').toISOString(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(React.createElement(ReferralSharePDF, { view }) as any);
    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
