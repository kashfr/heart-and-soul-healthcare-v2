import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImpersonationProvider, useViewAs, useViewAsGuard } from './ImpersonationProvider';

function Probe({ onSave }: { onSave: () => void }) {
  const { startViewAs, stopViewAs } = useViewAs();
  const { isViewingAs, blockWrite } = useViewAsGuard();
  return (
    <div>
      <span>viewing:{String(isViewingAs)}</span>
      <button onClick={() => startViewAs({ uid: 'rose', displayName: 'Rosita Lee', credential: null, role: 'va' })}>start</button>
      <button onClick={() => stopViewAs()}>stop</button>
      <button onClick={() => { if (blockWrite()) return; onSave(); }}>Save</button>
    </div>
  );
}

beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });

it('lets a save through normally, and during View As shows the notice instead of saving', () => {
  const onSave = vi.fn();
  render(<ImpersonationProvider><Probe onSave={onSave} /></ImpersonationProvider>);
  fireEvent.click(screen.getByText('Save'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();

  fireEvent.click(screen.getByText('start'));
  expect(screen.getByText('viewing:true')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Save'));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(/Read-only preview of Rosita Lee: nothing was saved/);

  fireEvent.click(screen.getByText('stop'));
  fireEvent.click(screen.getByText('Save'));
  expect(onSave).toHaveBeenCalledTimes(2);
});

it('clears the notice after a few seconds', () => {
  vi.useFakeTimers();
  render(<ImpersonationProvider><Probe onSave={vi.fn()} /></ImpersonationProvider>);
  fireEvent.click(screen.getByText('start'));
  fireEvent.click(screen.getByText('Save'));
  expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(5500); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
