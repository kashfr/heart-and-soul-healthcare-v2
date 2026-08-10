import { describe, it, expect } from 'vitest';
import {
  PROGRAMS,
  SERVICE_LEVELS,
  getProgram,
  getServiceLevel,
  programLabel,
  serviceLevelLabel,
  matchesClassification,
} from './programs';

describe('program catalog', () => {
  it('carries all four approved programs', () => {
    expect(PROGRAMS.map((p) => p.id).sort()).toEqual(['edwp', 'gapp', 'icwp', 'now-comp']);
  });

  it('uses unique ids', () => {
    expect(new Set(PROGRAMS.map((p) => p.id)).size).toBe(PROGRAMS.length);
    expect(new Set(SERVICE_LEVELS.map((s) => s.id)).size).toBe(SERVICE_LEVELS.length);
  });

  it('carries all three staffing models', () => {
    expect(SERVICE_LEVELS.map((s) => s.id)).toEqual([
      'rn-oversight',
      'rn-lpn-daily',
      'skilled-nursing-shifts',
    ]);
  });

  it('badges the exceptions but not oversight-only, so the common case stays quiet', () => {
    expect(SERVICE_LEVELS.filter((s) => s.badge).map((s) => s.badge)).toEqual([
      'DAILY LPN',
      'SHIFT NURSING',
    ]);
    expect(getServiceLevel('rn-oversight')?.badge).toBeNull();
  });

  it('resolves known ids and returns undefined for anything else', () => {
    expect(getProgram('gapp')?.label).toBe('GAPP');
    expect(getProgram('nope')).toBeUndefined();
    expect(getProgram(undefined)).toBeUndefined();
    expect(getServiceLevel('rn-lpn-daily')?.badge).toBe('DAILY LPN');
    expect(getServiceLevel('skilled-nursing-shifts')?.label).toBe('Daily skilled nursing shifts');
    expect(getServiceLevel(undefined)).toBeUndefined();
  });

  it('falls back to the raw value so an unknown id stays visible rather than blank', () => {
    expect(programLabel('now-comp')).toBe('NOW/COMP');
    expect(programLabel('mystery-waiver')).toBe('mystery-waiver');
    expect(programLabel(undefined)).toBe('');
    expect(serviceLevelLabel('rn-oversight')).toBe('RN oversight only');
    expect(serviceLevelLabel('something-else')).toBe('something-else');
  });
});

describe('matchesClassification', () => {
  const gappDaily = { program: 'gapp', serviceLevel: 'rn-lpn-daily' };
  const compOversight = { program: 'now-comp', serviceLevel: 'rn-oversight' };
  const unset = {};

  it('treats an empty filter as "any"', () => {
    expect(matchesClassification(gappDaily, {})).toBe(true);
    expect(matchesClassification(unset, {})).toBe(true);
  });

  it('filters on each axis independently', () => {
    expect(matchesClassification(gappDaily, { program: 'gapp' })).toBe(true);
    expect(matchesClassification(gappDaily, { program: 'now-comp' })).toBe(false);
    expect(matchesClassification(compOversight, { serviceLevel: 'rn-oversight' })).toBe(true);
    expect(matchesClassification(compOversight, { serviceLevel: 'rn-lpn-daily' })).toBe(false);
  });

  it('requires both to match when both are set', () => {
    expect(matchesClassification(gappDaily, { program: 'gapp', serviceLevel: 'rn-lpn-daily' })).toBe(true);
    expect(matchesClassification(gappDaily, { program: 'gapp', serviceLevel: 'rn-oversight' })).toBe(false);
  });

  it('never hides an unclassified client inside a specific group', () => {
    expect(matchesClassification(unset, { program: 'now-comp' })).toBe(false);
    expect(matchesClassification({ program: 'gapp' }, { serviceLevel: 'rn-oversight' })).toBe(false);
  });
});
