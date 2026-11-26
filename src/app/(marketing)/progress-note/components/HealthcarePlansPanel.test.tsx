import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { HealthcarePlanStatus } from '@/lib/healthcarePlanReview';
import { parseHcpReviewMeta } from '@/lib/healthcarePlanReview';

const fetchMock = vi.fn();
const openMock = vi.fn(async () => {});
const ackMock = vi.fn(async () => '2026-11-26T15:00:00.000Z');
vi.mock('@/lib/healthcarePlans', () => ({
  fetchHealthcarePlans: (...a: unknown[]) => fetchMock(...a),
  openHealthcarePlan: (...a: unknown[]) => openMock(...(a as [])),
  acknowledgeHealthcarePlan: (...a: unknown[]) => ackMock(...(a as [])),
}));

import HealthcarePlansPanel from './HealthcarePlansPanel';

const plan = (over: Partial<HealthcarePlanStatus>): HealthcarePlanStatus => ({
  documentId: 'doc1', title: 'Skin Integrity', docDate: '2026-11-19', version: 'v1', openedAt: '', reviewedAt: '', previousReviewedAt: '', ...over,
});

function mount() {
  const setValue = vi.fn();
  render(<HealthcarePlansPanel patientId="p1" setValue={setValue as never} />);
  const lastMeta = () => parseHcpReviewMeta(setValue.mock.calls.filter((c) => c[0] === 'hcpReviewMeta').at(-1)?.[1]);
  return { setValue, lastMeta };
}

describe('HealthcarePlansPanel', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    openMock.mockClear();
    ackMock.mockClear();
  });

  it('renders nothing and stores no snapshot when the client has no plans', async () => {
    fetchMock.mockResolvedValue({ plans: [] });
    const { setValue } = mount();
    await waitFor(() => expect(setValue).toHaveBeenCalledWith('hcpReviewMeta', ''));
    expect(screen.queryByText('Healthcare Plans')).toBeNull();
  });

  it('keeps "I Have Read This Plan" disabled until the plan has been opened, then records the review', async () => {
    fetchMock.mockResolvedValue({ plans: [plan({}), plan({ documentId: 'doc2', title: 'Endocrine', reviewedAt: '2026-11-20T15:00:00.000Z' })] });
    const { lastMeta } = mount();
    const ack = await screen.findByRole('button', { name: 'I Have Read This Plan' });
    expect(ack).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toMatch(/1 of 2 healthcare plans still needs your review/);
    expect(lastMeta().map((e) => !!e.reviewedAt)).toEqual([false, true]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Open Plan' })[0]);
    await waitFor(() => expect(ack).toHaveProperty('disabled', false));
    expect(openMock).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc1' }));

    fireEvent.click(ack);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/reviewed all 2/));
    expect(ackMock).toHaveBeenCalledWith('doc1');
    expect(lastMeta().every((e) => !!e.reviewedAt)).toBe(true);
    expect(screen.queryByRole('button', { name: 'I Have Read This Plan' })).toBeNull();
  });

  it('says when a plan was updated after an earlier review', async () => {
    fetchMock.mockResolvedValue({ plans: [plan({ previousReviewedAt: '2026-11-20T15:00:00.000Z' })] });
    mount();
    expect(await screen.findByText('Updated since your review on 11/20/2026')).toBeTruthy();
  });

  it('shows the error on the plan row when opening or saving fails', async () => {
    fetchMock.mockResolvedValue({ plans: [plan({ openedAt: '2026-11-26T14:00:00.000Z' })] });
    ackMock.mockRejectedValueOnce(new Error('Open the plan and read it before marking it as read.'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'I Have Read This Plan' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Open the plan and read it/);
  });

  it('does not hold the note up when the list cannot be loaded, and offers a retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Could not load the healthcare plans.'));
    const { setValue } = mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load/);
    expect(setValue).toHaveBeenLastCalledWith('hcpReviewMeta', '');
    fetchMock.mockResolvedValue({ plans: [plan({})] });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByRole('button', { name: 'Open Plan' })).toBeTruthy();
  });
});
