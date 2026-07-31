import { describe, it, expect } from 'vitest';
import { classifyDiagnosis, paidCaregiverDiagnosisFlag, paidCaregiverAgeFlag, ageYearsFromDob } from './diagnosisScreening';

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

describe('paidCaregiverAgeFlag (young-child advisory)', () => {
  // Fixed "now" so ages are deterministic: July 30, 2026.
  const NOW = new Date('2026-07-30T12:00:00Z').getTime();
  const flag = (dob: string | undefined, seeking: string | undefined) =>
    paidCaregiverAgeFlag(dob, seeking, NOW);

  it('flags a paid request for a 2-year-old (the Madalie case)', () => {
    const f = flag('2024-04-10', 'yes');
    expect(f).toContain('a 2-year-old');
    expect(f).toContain('age-typical');
    expect(f).toContain('other GAPP services');
  });

  it('flags an infant with under-1 wording', () => {
    expect(flag('2026-01-15', 'yes')).toContain('an infant under 1');
  });

  it('flags a 5-year-old but not a 6-year-old (under-6 line)', () => {
    expect(flag('2021-06-15', 'yes')).toContain('a 5-year-old');
    expect(flag('2020-06-15', 'yes')).toBeNull();
  });

  it('treats the 6th birthday itself as old enough', () => {
    expect(flag('2020-07-30', 'yes')).toBeNull();
    expect(flag('2020-07-31', 'yes')).toContain('a 5-year-old');
  });

  it('never flags when not seeking pay', () => {
    expect(flag('2024-04-10', 'no')).toBeNull();
    expect(flag('2024-04-10', undefined)).toBeNull();
  });

  it('stays silent on missing, unparseable, or future DOBs', () => {
    expect(flag(undefined, 'yes')).toBeNull();
    expect(flag('not-a-date', 'yes')).toBeNull();
    expect(flag('2027-01-01', 'yes')).toBeNull();
  });

  it('contains no em or en dashes (goes into staff email under the org name)', () => {
    expect(flag('2024-04-10', 'yes')).not.toMatch(/[—–]/);
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
