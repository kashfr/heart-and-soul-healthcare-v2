import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
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
});
