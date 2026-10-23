import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UploadTask } from 'firebase/storage';

vi.mock('./firebase', () => ({ db: {}, storage: {} }));
vi.mock('./authedFetch', () => ({ authedFetch: vi.fn() }));

import { awaitUpload, UPLOAD_STALL_MS } from './patientDocuments';

type Snap = { bytesTransferred: number; totalBytes: number };

/** A stand-in for the SDK's UploadTask that the test drives by hand. */
function fakeTask() {
  let next!: (s: Snap) => void;
  let fail!: (e: unknown) => void;
  let done!: () => void;
  const cancel = vi.fn(() => fail({ code: 'storage/canceled' }));
  const task = {
    on: (_: string, n: (s: Snap) => void, f: (e: unknown) => void, d: () => void) => { next = n; fail = f; done = d; },
    cancel,
  } as unknown as UploadTask;
  return { task, cancel, progress: (b: number) => next({ bytesTransferred: b, totalBytes: 1000 }), fail: (e: unknown) => fail(e), done: () => done() };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('awaitUpload', () => {
  it('resolves and reports percent progress on a normal upload', async () => {
    const t = fakeTask();
    const pct: number[] = [];
    const p = awaitUpload(t.task, (n) => pct.push(n));
    t.progress(0); t.progress(500); t.progress(1000); t.done();
    await expect(p).resolves.toBeUndefined();
    expect(pct).toEqual([0, 50, 100]);
    expect(t.cancel).not.toHaveBeenCalled();
  });

  it('cancels with a clear message when no bytes move (stuck at 0%)', async () => {
    const t = fakeTask();
    const p = awaitUpload(t.task);
    t.progress(0);
    vi.advanceTimersByTime(UPLOAD_STALL_MS);
    await expect(p).rejects.toThrow(/could not reach the file server/);
    expect(t.cancel).toHaveBeenCalledOnce();
  });

  it('keeps a slow upload alive while bytes are still moving', async () => {
    const t = fakeTask();
    const p = awaitUpload(t.task);
    for (let b = 100; b <= 1000; b += 100) {
      vi.advanceTimersByTime(UPLOAD_STALL_MS - 1000);
      t.progress(b);
    }
    t.done();
    await expect(p).resolves.toBeUndefined();
    expect(t.cancel).not.toHaveBeenCalled();
  });

  it('cancels when an upload stalls partway', async () => {
    const t = fakeTask();
    const p = awaitUpload(t.task);
    t.progress(400);
    vi.advanceTimersByTime(UPLOAD_STALL_MS - 1000);
    t.progress(400); // a repeat event with no new bytes doesn't count
    vi.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow(/could not reach the file server/);
  });

  it('translates the SDK retry limit and permission errors', async () => {
    const a = fakeTask();
    const pa = awaitUpload(a.task);
    a.fail({ code: 'storage/retry-limit-exceeded' });
    await expect(pa).rejects.toThrow(/could not reach the file server/);

    const b = fakeTask();
    const pb = awaitUpload(b.task);
    b.fail({ code: 'storage/unauthorized' });
    await expect(pb).rejects.toThrow(/permission/);
  });
});
