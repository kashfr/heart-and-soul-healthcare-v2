import { describe, it, expect } from 'vitest';
import {
  orderBetween,
  stageFromStatus,
  statusFromStage,
  REFERRAL_STAGES,
} from './types';

describe('orderBetween', () => {
  it('returns 0 when the column is empty (no neighbors)', () => {
    expect(orderBetween(undefined, undefined)).toBe(0);
  });

  it('places a card above the current top (smaller than the first order)', () => {
    expect(orderBetween(undefined, 1000)).toBeLessThan(1000);
  });

  it('places a card below the current bottom (larger than the last order)', () => {
    expect(orderBetween(1000, undefined)).toBeGreaterThan(1000);
  });

  it('places a card strictly between two neighbors', () => {
    const mid = orderBetween(0, 1000);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1000);
  });

  it('keeps successive midpoints strictly ordered between the same neighbors', () => {
    let lo = 0;
    const hi = 1000;
    // Repeatedly insert just above `lo`; each result must stay in (lo, hi).
    for (let i = 0; i < 20; i++) {
      const next = orderBetween(lo, hi);
      expect(next).toBeGreaterThan(lo);
      expect(next).toBeLessThan(hi);
      lo = next;
    }
  });

  it('works with negative creation-time orders (newest-first scheme)', () => {
    // New referrals get order = -Date.now(); inserting between two of them stays between.
    const a = -1_700_000_000_500;
    const b = -1_700_000_000_400;
    const mid = orderBetween(a, b);
    expect(mid).toBeGreaterThan(a);
    expect(mid).toBeLessThan(b);
  });
});

describe('stage <-> status mapping', () => {
  it('maps every stage to a valid legacy status', () => {
    for (const stage of REFERRAL_STAGES) {
      expect(['new', 'contacted', 'archived']).toContain(statusFromStage(stage));
    }
  });

  it('maps closed <-> archived', () => {
    expect(statusFromStage('closed')).toBe('archived');
    expect(stageFromStatus('archived')).toBe('closed');
  });

  it('maps new <-> new and contacted <-> contacted', () => {
    expect(statusFromStage('new')).toBe('new');
    expect(stageFromStatus('new')).toBe('new');
    expect(statusFromStage('contacted')).toBe('contacted');
    expect(stageFromStatus('contacted')).toBe('contacted');
  });

  it('collapses mid-pipeline stages to the legacy "contacted" status', () => {
    expect(statusFromStage('assessment')).toBe('contacted');
    expect(statusFromStage('authorization')).toBe('contacted');
    expect(statusFromStage('active')).toBe('contacted');
  });

  it('defaults unknown/legacy statuses to the "new" stage', () => {
    expect(stageFromStatus(undefined)).toBe('new');
    expect(stageFromStatus('')).toBe('new');
    expect(stageFromStatus('something-else')).toBe('new');
  });
});
