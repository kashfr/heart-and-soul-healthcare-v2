import { describe, expect, it } from 'vitest';
import {
  EMPTY_MED_ERROR_INPUT,
  effectiveIncidentRequired,
  formatLocalDateTimeUS,
  incidentReportRequired,
  medErrorBellText,
  validateMedErrorInput,
  type MedErrorInput,
} from './medErrorShared';

const NOW = '2026-09-16T20:30';
const good: MedErrorInput = {
  ...EMPTY_MED_ERROR_INPUT,
  patientId: 'p1',
  discoveredAt: '2026-09-16T19:00',
  occurredAt: '2026-09-16T08:00',
  medName: 'Keppra 500 mg',
  doseOrdered: '500 mg',
  doseGiven: '0',
  route: 'PO',
  errorType: 'omitted',
  doseOutcome: 'omitted',
  description: 'Morning Keppra dose still in the organizer at shift start; mother says she forgot. Found at 7 PM.',
  responsibleType: 'family',
  responsibleName: 'Mother',
  harm: 'none',
  clientCondition: 'No seizure activity. Alert, baseline.',
  physician: { notified: false, name: '', at: '' },
  guardian: { notified: true, name: 'Mother', at: '2026-09-16T19:05' },
  supervisor: { notified: true, name: 'Souz Payne, RN', at: '2026-09-16T19:10' },
  actionsTaken: 'Supervisor advised to give the dose now and monitor.',
  reporterSignature: 'data:image/png;base64,AAAA',
};

describe('validateMedErrorInput', () => {
  it('accepts a complete report', () => {
    expect(validateMedErrorInput(good, NOW)).toEqual({});
  });
  it('rejects a one-line description', () => {
    expect(validateMedErrorInput({ ...good, description: 'Missed dose.' }, NOW).description).toBeTruthy();
  });
  it('requires the core fields', () => {
    const e = validateMedErrorInput({ ...EMPTY_MED_ERROR_INPUT, reporterSignature: '' }, NOW);
    expect(Object.keys(e).sort()).toEqual(
      ['actionsTaken', 'clientCondition', 'description', 'discoveredAt', 'doseOutcome', 'errorType', 'harm', 'medName', 'patientId', 'reporterSignature', 'responsibleType'].sort(),
    );
  });
  it('rejects discovery in the future and occurrence after discovery', () => {
    expect(validateMedErrorInput({ ...good, discoveredAt: '2026-09-17T09:00' }, NOW).discoveredAt).toBeTruthy();
    expect(validateMedErrorInput({ ...good, occurredAt: '2026-09-16T19:30' }, NOW).occurredAt).toBeTruthy();
  });
  it('requires physician notification when the client was affected', () => {
    expect(validateMedErrorInput({ ...good, harm: 'monitoring' }, NOW).physician).toBeTruthy();
    expect(validateMedErrorInput({ ...good, harm: 'monitoring', physician: { notified: true, name: 'Dr. H', at: '2026-09-16T19:20' } }, NOW)).toEqual({});
  });
  it('validates notification times when given', () => {
    expect(validateMedErrorInput({ ...good, guardian: { notified: true, name: 'Mom', at: 'yesterday' } }, NOW).guardianAt).toBeTruthy();
  });
});

describe('stricter rules', () => {
  it('requires physician notification when a wrong dose was actually given, even with no effect', () => {
    const e = validateMedErrorInput({ ...good, errorType: 'wrong-dose', doseOutcome: 'given', harm: 'none', doseGiven: '1000 mg' }, NOW);
    expect(e.physician).toBeTruthy();
    expect(validateMedErrorInput({ ...good, errorType: 'wrong-dose', doseOutcome: 'given', harm: 'none', doseGiven: '', physician: { notified: true, name: 'Dr', at: '2026-09-16T19:20' } }, NOW).doseGiven).toBeTruthy();
    expect(validateMedErrorInput({ ...good, errorType: 'wrong-dose', doseOutcome: 'omitted', harm: 'none' }, NOW)).toEqual({});
  });
  it('rejects notification times in the future or before the error', () => {
    expect(validateMedErrorInput({ ...good, guardian: { notified: true, name: 'Mom', at: '2026-09-16T21:00' } }, NOW).guardianAt).toBeTruthy();
    expect(validateMedErrorInput({ ...good, guardian: { notified: true, name: 'Mom', at: '2026-09-16T07:00' } }, NOW).guardianAt).toBeTruthy();
  });
  it('rejects impossible calendar dates and hours', () => {
    expect(validateMedErrorInput({ ...good, discoveredAt: '2026-02-30T10:00' }, NOW).discoveredAt).toBeTruthy();
    expect(validateMedErrorInput({ ...good, discoveredAt: '2026-09-16T24:00' }, NOW).discoveredAt).toBeTruthy();
  });
  it('effectiveIncidentRequired prefers the review', () => {
    expect(effectiveIncidentRequired({ incidentReportRequired: true, review: null })).toBe(true);
    expect(effectiveIncidentRequired({ incidentReportRequired: true, review: { incidentReportRequired: false } as never })).toBe(false);
  });
});

describe('incidentReportRequired', () => {
  it('flags harm needing treatment and wrong-client errors', () => {
    expect(incidentReportRequired({ harm: 'none', errorType: 'omitted' })).toBe(false);
    expect(incidentReportRequired({ harm: 'monitoring', errorType: 'wrong-dose' })).toBe(false);
    expect(incidentReportRequired({ harm: 'treatment', errorType: 'wrong-dose' })).toBe(true);
    expect(incidentReportRequired({ harm: 'er', errorType: 'omitted' })).toBe(true);
    expect(incidentReportRequired({ harm: 'none', errorType: 'wrong-client' })).toBe(true);
  });
});

describe('formatting', () => {
  it('formats local datetimes US style', () => {
    expect(formatLocalDateTimeUS('2026-09-16T19:05')).toBe('09/16/2026 7:05 PM');
    expect(formatLocalDateTimeUS('2026-09-16T00:30')).toBe('09/16/2026 12:30 AM');
    expect(formatLocalDateTimeUS('')).toBe('');
  });
  it('bell text names the client and med', () => {
    const r = { patientName: 'ZZ Test Client', reporterName: 'Test Nurse', medName: 'Keppra', errorType: 'omitted' as const };
    expect(medErrorBellText('filed', r)).toContain('ZZ Test Client');
    expect(medErrorBellText('incident', r)).toContain('incident report');
  });
});
