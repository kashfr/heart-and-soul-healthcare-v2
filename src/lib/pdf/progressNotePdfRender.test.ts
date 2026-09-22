import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync } from 'node:fs';
import ProgressNotePDF from './ProgressNotePDF';

// Smoke test: the PDF must actually render (react-pdf reconciler) with the
// inline-amendment context in place. This guards the Document -> Provider -> Page
// wiring and the AmendedVersions rendering against regressions.
describe('ProgressNotePDF inline amendments', () => {
  it('renders a non-empty PDF with per-field amendments without throwing', async () => {
    const data: Record<string, string> = {
      q3_clientName: 'ZZ Test Client',
      q4_dateofBirth: '1985-06-07',
      q5_ageYears: '41',
      q6_dateofService: '2026-07-01',
      q11_nurseName: 'Jane Doe',
      q12_credential: 'RN',
      q16_temperature: '98.6',
      q22_additionalObservations: 'Corrected observation text',
      q63_clinicalSummary: 'Client febrile, MD notified',
    };
    const fieldAmendments = {
      q3_clientName: [{ oldValue: 'Z Test', correctedAt: 'Jul 1, 2026, 3:00 PM', correctedBy: 'Jane Doe' }],
      q16_temperature: [{ oldValue: '99.6', correctedAt: 'Jul 1, 2026, 3:05 PM', correctedBy: 'Jane Doe' }],
      q22_additionalObservations: [{ oldValue: '(blank)', correctedAt: 'Jul 1, 2026, 3:10 PM', correctedBy: 'Jane Doe' }],
      q63_clinicalSummary: [{ oldValue: 'Client stable', correctedAt: 'Jul 1, 2026, 3:15 PM', correctedBy: 'Jane Doe' }],
    };
    const editHistory = [
      {
        editedByName: 'Jane Doe',
        editedByRole: 'nurse',
        editedAt: 'Jul 1, 2026, 3:00 PM',
        reason: 'Typo correction per chart review',
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = React.createElement(ProgressNotePDF as any, { data, editHistory, fieldAmendments });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(el as any);
    expect(buf.length).toBeGreaterThan(1000);
  }, 30000);

  it('renders unchanged when there are no amendments', async () => {
    const data: Record<string, string> = { q3_clientName: 'X', q6_dateofService: '2026-07-01' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = React.createElement(ProgressNotePDF as any, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(el as any);
    expect(buf.length).toBeGreaterThan(500);
  }, 30000);

  it('prints later-in-shift vitals rechecks under the first set, with amendments and abnormal marks', async () => {
    // The 09/22/2026 case: pulse 102 on the first set, retaken at 100 after
    // rest; plus a second recheck with a still-high pulse and a BP.
    const data: Record<string, string> = {
      q3_clientName: 'ZZ Test Client',
      q4_dateofBirth: '1985-06-07',
      q5_ageYears: '41',
      q6_dateofService: '2026-09-22',
      q11_nurseName: 'Jane Doe',
      q12_credential: 'RN',
      q16_temperature: '97.5',
      q16_temperatureRoute: 'Temporal',
      q17_bloodPressure: '125/82',
      q18_pulse: '102',
      q18_pulseSite: 'Radial',
      q19_respiration: '20',
      q20_oxygenSaturation: '95',
      q21_oxygenSource: 'Room Air',
      q16r_readingCount: '2',
      q16r_reading1_time: '11:00',
      q16r_reading1_context: 'Resting / calm',
      q16r_reading1_pulse: '100',
      q16r_reading1_pulseSite: 'Radial',
      q16r_reading1_notes: 'Retaken after 2 hours of rest.',
      q16r_reading2_time: '14:30',
      q16r_reading2_context: 'After activity or exertion',
      q16r_reading2_systolic: '150',
      q16r_reading2_diastolic: '88',
      q16r_reading2_bpMethod: 'Automatic (oscillometric)',
      q16r_reading2_bpSite: 'Left arm',
      q16r_reading2_pulse: '112',
      q16r_reading2_oxygenSaturation: '96',
      q16r_reading2_oxygenSource: 'Room Air',
    };
    const fieldAmendments = {
      q16r_reading1_pulse: [{ oldValue: '98', correctedAt: 'Sep 22, 2026, 3:05 PM', correctedBy: 'Jane Doe' }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const el = React.createElement(ProgressNotePDF as any, { data, fieldAmendments });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf = await renderToBuffer(el as any);
    expect(buf.length).toBeGreaterThan(1000);
    // Optional visual check: PDF_OUT=/path/to/file.pdf npx vitest run src/lib/pdf/progressNotePdfRender.test.ts
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, buf);
  }, 30000);
});
