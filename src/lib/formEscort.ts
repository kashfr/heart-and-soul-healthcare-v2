/**
 * Shared "take me to the problem" behaviour for the standalone forms
 * (medication error, verbal order), matching what the progress note does:
 * every invalid field gets a red outline, the banner lists the problems as
 * links, and submitting scrolls to and focuses the first one.
 */
import type { CSSProperties } from 'react';

export const FIELD_ERROR_STYLE: CSSProperties = { borderColor: '#b3261e', boxShadow: '0 0 0 3px rgba(179,38,30,0.15)' };

/** Scroll the field's container into view and focus its first input. */
export function escortToField(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = el.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button, canvas');
  window.setTimeout(() => focusable?.focus({ preventScroll: true }), 350);
}

/** The first error key in display order, so the escort lands on the topmost problem. */
export function firstErrorKey<K extends string>(order: readonly K[], errors: Partial<Record<K, string>>): K | null {
  for (const k of order) if (errors[k]) return k;
  const rest = Object.keys(errors) as K[];
  return rest.find((k) => !!errors[k]) ?? null;
}
