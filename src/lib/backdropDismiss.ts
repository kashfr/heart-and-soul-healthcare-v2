import type { MouseEvent } from 'react';

/**
 * Props for a modal backdrop that closes the modal on a click outside it.
 *
 * A plain onClick on the backdrop also fires when someone presses the mouse
 * inside the modal (selecting text in a field) and releases it outside: the
 * browser dispatches that click to the nearest common ancestor, which is the
 * backdrop, so the modal closed mid-drag. This only dismisses when the press
 * and the release both land on the backdrop itself.
 *
 * Usage: <div style={backdrop} {...backdropDismiss(busy ? undefined : onClose)}>
 *
 * stopPropagation keeps the click from reaching a container behind the
 * backdrop, for a modal opened inside a drawer that would otherwise close too.
 */
export function backdropDismiss(
  onDismiss: (() => void) | undefined | false,
  opts: { stopPropagation?: boolean } = {},
) {
  return {
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      e.currentTarget.dataset.backdropPress = e.target === e.currentTarget ? 'down' : '';
    },
    onMouseUp: (e: MouseEvent<HTMLElement>) => {
      const el = e.currentTarget;
      el.dataset.backdropPress = el.dataset.backdropPress === 'down' && e.target === el ? 'up' : '';
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (opts.stopPropagation) e.stopPropagation();
      const el = e.currentTarget;
      const pressedHere = el.dataset.backdropPress === 'up';
      el.dataset.backdropPress = '';
      if (pressedHere && e.target === el && onDismiss) onDismiss();
    },
  };
}
