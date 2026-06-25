import { describe, it, expect } from 'vitest';
import { classifyDiagnosis, paidCaregiverDiagnosisFlag } from './diagnosisScreening';

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
