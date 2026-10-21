/**
 * Return / Go never submits a multi-field form. Pressed in a single-line
 * text-like input it moves focus to the next control instead, the way the
 * "next" key on a phone keyboard reads, so a parent who taps Go to dismiss the
 * keyboard (or presses Return out of habit) never sends a referral early and
 * never trips the whole-form validation sweep. Only a deliberate click or tap
 * on the visible Submit button (or Enter / Space while it has focus) submits.
 *
 * Usage, on the <form>:
 *   onKeyDown={(e) => {
 *     if (!shouldAdvanceOnEnter(e.key, e.nativeEvent.isComposing, e.target)) return;
 *     e.preventDefault();
 *     nextFormControl(e.currentTarget, e.target)?.focus();
 *   }}
 */

/** Input types where Enter would otherwise trigger implicit submission.
 *  Textareas keep Enter as a newline; checkboxes, radios, selects and buttons
 *  keep their own Enter behaviour. */
const TEXT_LIKE_TYPES = new Set(['text', 'email', 'tel', 'number', 'date', 'search', 'url']);

const CONTROL_SELECTOR = 'input:not([type="hidden"]), select, textarea, button';

/** Mark a control Enter should never land on (a "Previous" button), so the
 *  last field advances to the primary action instead. */
export const ENTER_SKIP_ATTR = 'data-enter-skip';

export function isTextLikeInput(el: EventTarget | null): el is HTMLInputElement {
  return (
    typeof HTMLInputElement !== 'undefined' &&
    el instanceof HTMLInputElement &&
    TEXT_LIKE_TYPES.has(el.type)
  );
}

/** True when this keydown is Enter in a single-line text-like input and not
 *  part of an IME composition (confirming a Japanese or Chinese candidate
 *  also fires Enter, and must keep doing what the IME wants). */
export function shouldAdvanceOnEnter(
  key: string,
  isComposing: boolean,
  target: EventTarget | null,
): target is HTMLInputElement {
  return key === 'Enter' && !isComposing && isTextLikeInput(target);
}

function canTakeFocus(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.tabIndex < 0) return false;
  if (el.hasAttribute(ENTER_SKIP_ATTR)) return false;
  if (el.closest('[hidden], [inert], fieldset[disabled]')) return false;
  // Not rendered (display: none, or inside a collapsed section). Skipped where
  // the browser can tell; jsdom cannot, and treats everything as visible.
  if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) return false;
  return true;
}

/** The next focusable form control after `from` in DOM order (inputs,
 *  selects, textareas, checkboxes, radios, buttons), or null when `from` is
 *  the last one. Links are not form controls and are passed over. */
export function nextFormControl(form: ParentNode, from: Element): HTMLElement | null {
  const controls = Array.from(form.querySelectorAll<HTMLElement>(CONTROL_SELECTOR));
  const start = controls.indexOf(from as HTMLElement);
  if (start < 0) return null;
  for (let i = start + 1; i < controls.length; i += 1) {
    if (canTakeFocus(controls[i])) return controls[i];
  }
  return null;
}
