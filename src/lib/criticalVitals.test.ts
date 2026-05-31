import { describe, it, expect } from 'vitest';
import {
  getCriticalThresholds,
  getCriticalFindings,
  hasCriticalVital,
} from './criticalVitals';

// Helper: build a minimal submission record with an age (years) + vitals.
function note(ageYears: string, vitals: Record<string, string>) {
  return { q5_ageYears: ageYears, ...vitals };
}

describe('getCriticalThresholds', () => {
  it('uses PALS hypotension formula (70 + 2*age) for a toddler', () => {
    const th = getCriticalThresholds('2'); // toddler
    expect(th.systolic.low).toBe(74); // 70 + 2*2
  });

  it('caps the systolic floor at 90 for children older than 10', () => {
    const th = getCriticalThresholds('12'); // school-age but >10
    expect(th.systolic.low).toBe(90);
  });

  it('keeps the infant systolic floor at 70', () => {
    const th = getCriticalThresholds('0'); // <1 year → infant
    expect(th.systolic.low).toBe(70);
  });

  it('keeps SpO2 notify threshold at 90% across ages', () => {
    expect(getCriticalThresholds('1').oxygenSaturation.low).toBe(90);
    expect(getCriticalThresholds('15').oxygenSaturation.low).toBe(90);
  });
});

describe('getCriticalFindings', () => {
  it('flags low SpO2 below 90%', () => {
    const f = getCriticalFindings(note('8', { q20_oxygenSaturation: '86' }));
    expect(f).toHaveLength(1);
    expect(f[0].key).toBe('oxygenSaturation');
    expect(f[0].direction).toBe('low');
  });

  it('does not flag a normal SpO2', () => {
    expect(getCriticalFindings(note('8', { q20_oxygenSaturation: '98' }))).toHaveLength(0);
  });

  it('flags tachycardia above the age-band ceiling', () => {
    // school-age ceiling is 140
    expect(hasCriticalVital(note('8', { q18_pulse: '150' }))).toBe(true);
    expect(hasCriticalVital(note('8', { q18_pulse: '120' }))).toBe(false);
  });

  it('flags systolic hypotension using the patient age', () => {
    // toddler age 2 → floor 74; 70 is below
    expect(hasCriticalVital(note('2', { q17_bloodPressure: '70/40' }))).toBe(true);
    expect(hasCriticalVital(note('2', { q17_bloodPressure: '90/50' }))).toBe(false);
  });

  it('reads systolic from the split q17_systolic field too', () => {
    expect(hasCriticalVital(note('15', { q17_systolic: '85' }))).toBe(true); // adolescent floor 90
  });

  it('flags fever above 103°F and hypothermia below 95°F', () => {
    expect(hasCriticalVital(note('8', { q16_temperature: '104.2' }))).toBe(true);
    expect(hasCriticalVital(note('8', { q16_temperature: '94' }))).toBe(true);
    expect(hasCriticalVital(note('8', { q16_temperature: '99' }))).toBe(false);
  });

  it('returns multiple findings when several vitals are critical', () => {
    const f = getCriticalFindings(note('8', { q20_oxygenSaturation: '85', q18_pulse: '160' }));
    expect(f.length).toBe(2);
  });

  it('ignores blank / unparseable vitals', () => {
    expect(getCriticalFindings(note('8', { q18_pulse: '', q20_oxygenSaturation: 'n/a' }))).toHaveLength(0);
  });
});
