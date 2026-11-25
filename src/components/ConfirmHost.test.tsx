import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ConfirmHost from './ConfirmHost';
import { confirmAsync } from '@/lib/confirmDialog';

afterEach(() => vi.restoreAllMocks());

it('asks on the page and resolves true for OK, without a browser pop-up', async () => {
  const native = vi.spyOn(window, 'confirm');
  render(<ConfirmHost />);
  let answer: Promise<boolean>;
  act(() => { answer = confirmAsync('Send 1 PDF attachment(s) to the office?\n1. letter.pdf'); });
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('Send 1 PDF attachment(s) to the office?');
  expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await expect(answer!).resolves.toBe(true);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(native).not.toHaveBeenCalled();
});

it('resolves false for Cancel and for Escape', async () => {
  render(<ConfirmHost />);
  let first: Promise<boolean>;
  act(() => { first = confirmAsync('Dismiss this fax?'); });
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  await expect(first!).resolves.toBe(false);
  let second: Promise<boolean>;
  act(() => { second = confirmAsync('Resend this fax?'); });
  await screen.findByRole('alertdialog');
  fireEvent.keyDown(document, { key: 'Escape' });
  await expect(second!).resolves.toBe(false);
});

it('asks queued questions one at a time, in order', async () => {
  render(<ConfirmHost />);
  let a: Promise<boolean>; let b: Promise<boolean>;
  act(() => { a = confirmAsync('First question?'); b = confirmAsync('Second question?'); });
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('First question?');
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await expect(a!).resolves.toBe(true);
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('Second question?');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await expect(b!).resolves.toBe(false);
});

it('falls back to window.confirm when no host is mounted', async () => {
  const native = vi.spyOn(window, 'confirm').mockReturnValue(true);
  await expect(confirmAsync('Still asked?')).resolves.toBe(true);
  expect(native).toHaveBeenCalledWith('Still asked?');
});
