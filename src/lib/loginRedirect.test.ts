import { describe, it, expect, beforeEach } from 'vitest';
import { buildLoginRedirect } from './loginRedirect';

/** Point jsdom's window.location at a URL so the helper can read it. */
function setLocation(url: string) {
  window.history.replaceState({}, '', url);
}

describe('buildLoginRedirect', () => {
  beforeEach(() => {
    setLocation('/');
  });

  it('returns the bare path when there is no query or hash', () => {
    setLocation('/admin/clients/abc123');
    expect(buildLoginRedirect('/admin/clients/abc123')).toBe(
      '/admin/clients/abc123'
    );
  });

  it('keeps the query string usePathname() drops', () => {
    setLocation('/admin/clients/abc123?qn=note789');
    expect(buildLoginRedirect('/admin/clients/abc123')).toBe(
      '/admin/clients/abc123?qn=note789'
    );
  });

  it('keeps multiple params', () => {
    setLocation('/admin/clients/abc123?tab=schedule&cosign=1');
    expect(buildLoginRedirect('/admin/clients/abc123')).toBe(
      '/admin/clients/abc123?tab=schedule&cosign=1'
    );
  });

  it('keeps the hash', () => {
    setLocation('/admin/records?resume=1#vitals');
    expect(buildLoginRedirect('/admin/records')).toBe(
      '/admin/records?resume=1#vitals'
    );
  });

  it('falls back to / when pathname is null', () => {
    setLocation('/?edit=abc123');
    expect(buildLoginRedirect(null)).toBe('/?edit=abc123');
  });

  // The contract that actually matters: AuthGuard encodes this value into the
  // ?redirect= param and /login pulls it back out with searchParams.get().
  it('survives the URLSearchParams round trip to /login', () => {
    setLocation('/admin/clients/abc123?qn=note789');
    const value = buildLoginRedirect('/admin/clients/abc123');

    const encoded = new URLSearchParams({ redirect: value }).toString();
    const decoded = new URLSearchParams(encoded).get('redirect');

    expect(decoded).toBe('/admin/clients/abc123?qn=note789');
  });
});
