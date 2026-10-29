import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { backdropDismiss } from './backdropDismiss';

function Harness({ onClose, outer, stop }: { onClose?: () => void; outer?: () => void; stop?: boolean }) {
  return (
    <div onClick={outer}>
      <div data-testid="backdrop" {...backdropDismiss(onClose, { stopPropagation: stop })}>
        <div data-testid="modal"><input aria-label="Title" /></div>
      </div>
    </div>
  );
}

/** A real click: press, release, then the click the browser dispatches to the
 *  nearest common ancestor of the press and release targets. */
function press(down: Element, up: Element, clickTarget: Element) {
  fireEvent.mouseDown(down);
  fireEvent.mouseUp(up);
  fireEvent.click(clickTarget);
}

describe('backdropDismiss', () => {
  it('closes on a click that starts and ends on the backdrop', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');
    press(backdrop, backdrop, backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open when a text selection drags from a field out onto the backdrop', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const field = screen.getByLabelText('Title');
    const backdrop = screen.getByTestId('backdrop');
    press(field, backdrop, backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a press on the backdrop is released inside the modal', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');
    press(backdrop, screen.getByTestId('modal'), backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores clicks inside the modal', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const modal = screen.getByTestId('modal');
    press(modal, modal, modal);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not let one aborted drag arm the next click', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const backdrop = screen.getByTestId('backdrop');
    press(screen.getByLabelText('Title'), backdrop, backdrop);
    fireEvent.click(backdrop); // a click with no press on record (e.g. synthetic)
    expect(onClose).not.toHaveBeenCalled();
    press(backdrop, backdrop, backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does nothing while dismissal is disabled (a save in progress)', () => {
    render(<Harness onClose={undefined} />);
    const backdrop = screen.getByTestId('backdrop');
    expect(() => press(backdrop, backdrop, backdrop)).not.toThrow();
  });

  it('can keep the click from reaching a drawer behind it', () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    render(<Harness onClose={onClose} outer={outer} stop />);
    const backdrop = screen.getByTestId('backdrop');
    press(screen.getByLabelText('Title'), backdrop, backdrop);
    expect(outer).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
