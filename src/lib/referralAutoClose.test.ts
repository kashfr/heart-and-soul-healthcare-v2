import { describe, it, expect } from 'vitest';
import { isStaleReferredOut } from './referralAutoClose';

const DAY = 86_400_000;
const NOW = 1_000_000_000_000;

describe('isStaleReferredOut', () => {
  it('never closes a card with no entry timestamp', () => {
    expect(isStaleReferredOut(null, NOW, 14)).toBe(false);
  });

  it('closes a card that entered exactly the threshold ago', () => {
    expect(isStaleReferredOut(NOW - 14 * DAY, NOW, 14)).toBe(true);
  });

  it('closes a card that entered well past the threshold', () => {
    expect(isStaleReferredOut(NOW - 30 * DAY, NOW, 14)).toBe(true);
  });

  it('keeps a card that has not yet reached the threshold', () => {
    expect(isStaleReferredOut(NOW - 13 * DAY, NOW, 14)).toBe(false);
  });

  it('keeps a card one millisecond shy of the threshold', () => {
    expect(isStaleReferredOut(NOW - 14 * DAY + 1, NOW, 14)).toBe(false);
  });

  it('respects a custom day count', () => {
    expect(isStaleReferredOut(NOW - 7 * DAY, NOW, 7)).toBe(true);
    expect(isStaleReferredOut(NOW - 6 * DAY, NOW, 7)).toBe(false);
  });
});
