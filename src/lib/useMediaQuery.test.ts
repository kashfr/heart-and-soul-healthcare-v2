// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

type Listener = () => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => mql) });
  return {
    flip(next: boolean) {
      mql.matches = next;
      listeners.forEach((l) => l());
    },
    listeners,
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    // jsdom has no matchMedia; put it back that way after each test.
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it('is false where matchMedia does not exist (jsdom, server)', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 760px)'));
    expect(result.current).toBe(false);
  });

  it('reports the current match and follows changes', () => {
    const mm = installMatchMedia(true);
    const { result, unmount } = renderHook(() => useMediaQuery('(max-width: 760px)'));
    expect(result.current).toBe(true);
    act(() => mm.flip(false));
    expect(result.current).toBe(false);
    unmount();
    expect(mm.listeners.size).toBe(0);
  });
});
