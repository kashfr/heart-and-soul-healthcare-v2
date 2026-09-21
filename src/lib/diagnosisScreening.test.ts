import { describe, it, expect } from 'vitest';
import {
  classifyDiagnosis,
  paidCaregiverDiagnosisFlag,
  screenYoungPaidCaregiver,
  ageYearsFromDob,
} from './diagnosisScreening';

describe('classifyDiagnosis', () => {
  it('classifies behavioral/developmental-only diagnoses', () => {
    expect(classifyDiagnosis('Autism')).toBe('behavioral');
    expect(classifyDiagnosis('autism spectrum disorder, speech delay')).toBe('behavioral');
    expect(classifyDiagnosis('global developmental delay')).toBe('behavioral');
    expect(classifyDiagnosis('ADHD')).toBe('behavioral');
  });

  it('classifies behavioral + a physical/medical condition as mixed', () => {
    expect(
      classifyDiagnosis('cerebral palsy, developmental delay disorder, autism')
    ).toBe('mixed');
    expect(classifyDiagnosis('autism with a feeding tube')).toBe('mixed');
    // "ASD" as atrial septal defect (a heart condition), not autism.
    expect(classifyDiagnosis('ASD, atrial septal defect')).toBe('mixed');
  });

  it('returns none for physical-only or empty diagnoses', () => {
    expect(classifyDiagnosis('cerebral palsy')).toBe('none');
    expect(classifyDiagnosis('feeding tube, seizures')).toBe('none');
    expect(classifyDiagnosis('')).toBe('none');
  });

  it('does not false-positive on unrelated words', () => {
    expect(classifyDiagnosis('asthma')).toBe('none');
  });
});

describe('paidCaregiverDiagnosisFlag', () => {
  it('flags behavioral-only paid requests as likely ineligible', () => {
    expect(paidCaregiverDiagnosisFlag('Autism', 'yes')).toMatch(/Likely ineligible/);
  });

  it('flags mixed paid requests for review', () => {
    expect(paidCaregiverDiagnosisFlag('cerebral palsy, autism', 'yes')).toMatch(/Review/);
  });

  it('does not flag when not seeking pay', () => {
    expect(paidCaregiverDiagnosisFlag('Autism', 'no')).toBeNull();
    expect(paidCaregiverDiagnosisFlag('Autism', '')).toBeNull();
  });

  it('does not flag a physical-only paid request', () => {
    expect(paidCaregiverDiagnosisFlag('feeding tube', 'yes')).toBeNull();
    expect(paidCaregiverDiagnosisFlag('cerebral palsy', 'yes')).toBeNull();
  });
});

describe('screenYoungPaidCaregiver (young-child hard stop)', () => {
  // Fixed "now" so ages are deterministic: September 20, 2026.
  const NOW = new Date('2026-09-20T12:00:00Z').getTime();
  const screen = (
    dob: string | undefined,
    seeking: string | undefined,
    equipment: string[] = []
  ) => screenYoungPaidCaregiver({ dob, seekingPaidCaregiver: seeking, equipment }, NOW);

  it('refuses a paid request for a 2-month-old needing help with feeding (the Legacy case)', () => {
    const r = screen('2026-07-18', 'yes', ['help_feeding']);
    expect(r.block).toContain('an infant (2 months old)');
    expect(r.block).toContain('cannot be accepted');
    expect(r.cleared).toBeNull();
    expect(r.ageYears).toBe(0);
  });

  it('refuses everyday-care requests for a 2-year-old and a 5-year-old', () => {
    expect(screen('2024-04-10', 'yes', ['help_hygiene']).block).toContain('a 2-year-old');
    expect(screen('2021-06-15', 'yes', ['equip_none']).block).toContain('a 5-year-old');
  });

  it('refuses regardless of the care-need radio (the radio is gameable)', () => {
    const r = screenYoungPaidCaregiver(
      { dob: '2026-07-18', seekingPaidCaregiver: 'yes', equipment: ['help_feeding'], careNeeds: 'nursing' },
      NOW
    );
    expect(r.block).not.toBeNull();
  });

  it('lets a young child through when skilled equipment is reported, and says why', () => {
    const r = screen('2026-07-18', 'yes', ['feeding_tube', 'help_feeding']);
    expect(r.block).toBeNull();
    expect(r.cleared).toContain('skilled needs were reported');
    expect(r.cleared).toContain('Feeding tube');
  });

  it('lets a mobility need through only at 18 months or older', () => {
    // 4-year-old in a wheelchair: the assessment scores non-ambulation.
    const older = screen('2022-03-01', 'yes', ['wheelchair']);
    expect(older.block).toBeNull();
    expect(older.cleared).toContain('mobility need was reported');
    // 12-month-old who "cannot walk unassisted": age-typical, still refused.
    const infant = screen('2025-09-01', 'yes', ['wheelchair']);
    expect(infant.block).not.toBeNull();
    // Exactly 18 months clears.
    expect(screen('2025-03-20', 'yes', ['help_transfer']).block).toBeNull();
    expect(screen('2025-03-21', 'yes', ['help_transfer']).block).not.toBeNull();
  });

  it('does not screen at 6 or older (the 6th birthday itself is old enough)', () => {
    expect(screen('2020-09-20', 'yes', ['help_feeding'])).toEqual({ block: null, cleared: null, ageYears: 6 });
    expect(screen('2020-09-21', 'yes', ['help_feeding']).block).toContain('a 5-year-old');
  });

  it('never screens when not seeking pay', () => {
    expect(screen('2026-07-18', 'no', ['help_feeding']).block).toBeNull();
    expect(screen('2026-07-18', undefined, ['help_feeding']).block).toBeNull();
  });

  it('stays silent on missing, unparseable, or future DOBs', () => {
    expect(screen(undefined, 'yes', ['help_feeding']).block).toBeNull();
    expect(screen('not-a-date', 'yes', ['help_feeding']).block).toBeNull();
    expect(screen('2027-01-01', 'yes', ['help_feeding']).block).toBeNull();
  });

  it('contains no em or en dashes (shown to families and stored for staff)', () => {
    expect(screen('2026-07-18', 'yes', ['help_feeding']).block).not.toMatch(/[—–]/);
    expect(screen('2026-07-18', 'yes', ['trach']).cleared).not.toMatch(/[—–]/);
    expect(screen('2022-03-01', 'yes', ['wheelchair']).cleared).not.toMatch(/[—–]/);
  });
});

describe('ageYearsFromDob', () => {
  const NOW = new Date('2026-07-30T12:00:00Z').getTime();

  it('computes whole years with birthday awareness', () => {
    expect(ageYearsFromDob('2024-04-10', NOW)).toBe(2);
    expect(ageYearsFromDob('2024-08-10', NOW)).toBe(1);
    expect(ageYearsFromDob('2026-07-01', NOW)).toBe(0);
  });

  it('returns null for junk', () => {
    expect(ageYearsFromDob('', NOW)).toBeNull();
    expect(ageYearsFromDob('garbage', NOW)).toBeNull();
    expect(ageYearsFromDob('2030-01-01', NOW)).toBeNull();
  });
});
