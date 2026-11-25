/**
 * On-page replacement for window.confirm().
 *
 * A native confirm() is drawn by the browser, outside the page: it freezes the
 * page until a person answers it, browser automation cannot click it, and some
 * embedded browsers answer Cancel on their own. confirmAsync() asks the same
 * question in a dialog that is part of the page (ConfirmHost, mounted once in
 * the root layout), so the confirmation step stays and anything that can click
 * a button can answer it.
 *
 * Where no ConfirmHost is mounted (unit tests of a single component), it falls
 * back to window.confirm so existing behavior and test doubles keep working.
 */
export interface PendingConfirm {
  id: number;
  message: string;
  resolve: (ok: boolean) => void;
}

type Host = (pending: PendingConfirm) => void;

let host: Host | null = null;
let nextId = 1;

/** Called by ConfirmHost. Returns the function that unregisters it. */
export function registerConfirmHost(fn: Host): () => void {
  host = fn;
  return () => {
    if (host === fn) host = null;
  };
}

/** Ask a yes/no question. Resolves true for OK, false for Cancel or Escape. */
export function confirmAsync(message: string): Promise<boolean> {
  if (!host) {
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(message) : false;
    return Promise.resolve(ok);
  }
  const ask = host;
  return new Promise<boolean>((resolve) => ask({ id: nextId++, message, resolve }));
}
