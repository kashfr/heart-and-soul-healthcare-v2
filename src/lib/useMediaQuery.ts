import { useMemo, useSyncExternalStore } from 'react';

/** The breakpoint below which list pages switch from a table to cards. */
export const PHONE_QUERY = '(max-width: 760px)';

const canMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * True while the viewport matches `query`. False on the server, during
 * hydration, and anywhere matchMedia is missing (jsdom), so a page renders
 * its desktop layout unless the browser says otherwise. Use this where a
 * phone needs different MARKUP (a card list instead of a table); plain CSS
 * media queries still cover anything that is only a style change.
 */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(
    () => ({
      subscribe: (onChange: () => void) => {
        if (!canMatch()) return () => {};
        const m = window.matchMedia(query);
        m.addEventListener('change', onChange);
        return () => m.removeEventListener('change', onChange);
      },
      getSnapshot: () => (canMatch() ? window.matchMedia(query).matches : false),
      getServerSnapshot: () => false,
    }),
    [query],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
