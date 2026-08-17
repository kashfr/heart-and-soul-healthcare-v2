import { describe, it, expect, beforeEach } from 'vitest';
import { buildLoginRedirect, safeLoginRedirect } from './loginRedirect';

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

describe('safeLoginRedirect', () => {
  it('passes through ordinary in-app paths', () => {
    expect(safeLoginRedirect('/admin/clients/abc123?qn=note789')).toBe(
      '/admin/clients/abc123?qn=note789'
    );
    expect(safeLoginRedirect('/admin/records?resume=1#vitals')).toBe(
      '/admin/records?resume=1#vitals'
    );
  });

  it('falls back when the param is missing or empty', () => {
    expect(safeLoginRedirect(null)).toBe('/admin');
    expect(safeLoginRedirect('')).toBe('/admin');
  });

  it('honors a caller-supplied fallback', () => {
    expect(safeLoginRedirect(null, '/')).toBe('/');
  });

  it('rejects absolute URLs to other origins', () => {
    expect(safeLoginRedirect('https://evil.com')).toBe('/admin');
    expect(safeLoginRedirect('http://evil.com/admin')).toBe('/admin');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeLoginRedirect('//evil.com')).toBe('/admin');
    expect(safeLoginRedirect('//evil.com/admin/clients')).toBe('/admin');
  });

  it('rejects the backslash form browsers normalize to protocol-relative', () => {
    expect(safeLoginRedirect('/\\evil.com')).toBe('/admin');
    expect(safeLoginRedirect('/\\/evil.com')).toBe('/admin');
  });

  it('rejects control characters smuggled in to fake a relative path', () => {
    // Browsers strip the tab before resolving, turning this into "//evil.com".
    expect(safeLoginRedirect('/\t/evil.com')).toBe('/admin');
    expect(safeLoginRedirect('/\n/evil.com')).toBe('/admin');
    expect(safeLoginRedirect('/\r/evil.com')).toBe('/admin');
  });

  it('rejects non-http schemes', () => {
    expect(safeLoginRedirect('javascript:alert(1)')).toBe('/admin');
    expect(safeLoginRedirect('data:text/html,<script>')).toBe('/admin');
  });

  it('rejects values that only look relative after whitespace', () => {
    expect(safeLoginRedirect('  //evil.com')).toBe('/admin');
    expect(safeLoginRedirect('  https://evil.com')).toBe('/admin');
  });

  it('leaves percent-encoded slashes alone (they stay on our origin)', () => {
    expect(safeLoginRedirect('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
  });
});
