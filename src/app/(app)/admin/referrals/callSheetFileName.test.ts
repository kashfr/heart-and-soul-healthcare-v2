import { describe, it, expect } from 'vitest';
import { callSheetFileName } from './callSheetFileName';
import type { Referral } from './types';

const ref = (clientName: string, submittedAt: string | null) => ({ clientName, submittedAt } as Referral);
const NOW = new Date('2026-10-06T17:00:00Z');

describe('callSheetFileName', () => {
  it('names one sheet after the client and the day it was received', () => {
    expect(callSheetFileName([ref('Paisley Wiggins', '2026-10-06T15:02:00Z')], NOW)).toBe('Paisley Wiggins Call Sheet 10-06-2026');
  });

  it('uses the agency date, not UTC (a 10 PM Eastern referral stays on its own day)', () => {
    expect(callSheetFileName([ref('Kasai Williams', '2026-09-30T02:05:00Z')], NOW)).toBe('Kasai Williams Call Sheet 09-29-2026');
  });

  it('strips characters a file name cannot hold', () => {
    expect(callSheetFileName([ref('Marcos R. Hernandez / Garcia: "Jr"', '2026-10-06T15:00:00Z')], NOW)).toBe('Marcos R. Hernandez Garcia Jr Call Sheet 10-06-2026');
  });

  it('names a batch by count and the print date', () => {
    expect(callSheetFileName([ref('A', null), ref('B', null), ref('C', null)], NOW)).toBe('Referral Call Sheets (3) 10-06-2026');
  });

  it('falls back when the name or date is missing', () => {
    expect(callSheetFileName([ref('', null)], NOW)).toBe('Referral Call Sheet 10-06-2026');
  });
});
