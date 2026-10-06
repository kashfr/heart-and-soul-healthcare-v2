/**
 * Shared "take me to the problem" behaviour for every form and modal, the
 * standard the progress note set: each invalid field gets a red outline and
 * its own message directly under it, and submitting scrolls to and focuses
 * the first problem. Buttons stay enabled so the guard can explain itself;
 * a silently disabled button teaches nothing.
 */
import type { CSSProperties, ReactNode } from 'react';
import { createElement } from 'react';

// The `border` shorthand (not `borderColor`) matters: most base styles set
// `border: '1px solid ...'`, and when React drops a `borderColor` key it writes
// '' which leaves the border with no colour at all. Toggling the same shorthand
// key means React re-applies the base value when the error clears.
export const FIELD_ERROR_STYLE: CSSProperties = { border: '1px solid #b3261e', boxShadow: '0 0 0 3px rgba(179,38,30,0.15)' };

/** Style for a wrapper (a chip group, a canvas frame) rather than an input. */
export const FIELD_ERROR_WRAP_STYLE: CSSProperties = { ...FIELD_ERROR_STYLE, borderRadius: 8, padding: 8 };

export const FIELD_ERROR_TEXT_STYLE: CSSProperties = { fontSize: 12.5, color: '#b3261e', fontWeight: 600, marginTop: 4, lineHeight: 1.4 };

/** The message under a field. Renders nothing when there is no message. */
export function FieldError({ message, id }: { message?: string | null; id?: string }): ReactNode {
  if (!message) return null;
  return createElement('div', { id, role: 'alert', style: FIELD_ERROR_TEXT_STYLE }, message);
}

/** Scroll the field's container into view and focus its first input. Works
 *  inside scrolling modals as well as pages. When the target holds nothing
 *  focusable (a notice panel, a heading above a long checklist), the target
 *  itself takes focus, so keyboard and screen-reader users land where the
 *  page scrolled and a phone keyboard left open over the page closes. */
export function escortToField(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Center the target, unless it is taller than most of the screen (a long
  // notice panel on a small phone), where centering would cut off its first
  // lines. Those align to the top instead (scroll-padding still applies).
  const tall = el.getBoundingClientRect().height > window.innerHeight * 0.8;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: tall ? 'start' : 'center' });
  const focusable = el.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button, canvas');
  const target = focusable ?? el;
  if (!focusable && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  window.setTimeout(() => target.focus({ preventScroll: true }), 350);
}

/** The first error key in display order, so the escort lands on the topmost problem. */
export function firstErrorKey<K extends string>(order: readonly K[], errors: Partial<Record<K, string>>): K | null {
  for (const k of order) if (errors[k]) return k;
  const rest = Object.keys(errors) as K[];
  return rest.find((k) => !!errors[k]) ?? null;
}

/** Validate, store, and escort in one call. Returns true when the form is clean. */
export function applyFieldErrors<K extends string>(
  errors: Partial<Record<K, string>>,
  order: readonly K[],
  setErrors: (e: Partial<Record<K, string>>) => void,
  idFor: (k: K) => string,
): boolean {
  setErrors(errors);
  const first = firstErrorKey(order, errors);
  if (first) escortToField(idFor(first));
  return !first;
}
