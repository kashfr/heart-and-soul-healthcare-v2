import { describe, it, expect } from 'vitest';
import { buildProviderListEmail } from './providerListContent';
import { PROVIDER_LIST_URL } from '../shareLink';

describe('buildProviderListEmail', () => {
  const content = buildProviderListEmail({ familyName: 'Monique Ivory', childName: 'Tru Phillips' });

  it('links to the hosted provider list (production origin)', () => {
    expect(content.html).toContain(PROVIDER_LIST_URL);
    expect(PROVIDER_LIST_URL).toMatch(/^https:\/\/www\.heartandsoulhc\.org\//);
  });

  it('greets by first name and names the child', () => {
    expect(content.html).toContain('Hi Monique,');
    expect(content.html).toContain('Tru Phillips');
  });

  it('keeps the subject PHI-free', () => {
    expect(content.subject).not.toContain('Tru');
    expect(content.subject).not.toContain('Monique');
  });

  it('contains NO em or en dashes anywhere (user writing-style rule)', () => {
    for (const text of [content.subject, content.html]) {
      expect(text).not.toMatch(/[—–]/);
    }
    // Also the blank-input variant.
    const bare = buildProviderListEmail({});
    expect(bare.html).not.toMatch(/[—–]/);
  });

  it('falls back gracefully with no names', () => {
    const bare = buildProviderListEmail({});
    expect(bare.html).toContain('Hello,');
    expect(bare.html).toContain('your child');
    expect(bare.html).not.toContain('undefined');
  });

  it('escapes HTML in names', () => {
    const evil = buildProviderListEmail({ familyName: '<script>x</script>' });
    expect(evil.html).not.toContain('<script>');
  });
});
