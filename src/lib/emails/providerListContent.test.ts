import { describe, it, expect } from 'vitest';
import { buildProviderListEmail, findDashFields } from './providerListContent';
import { PROVIDER_LIST_URL } from '../shareLink';
import {
  DEFAULT_SETTINGS,
  validateSettings,
  SettingsValidationError,
  mergeWithDefaults,
  type ProviderListEmailSettings,
} from '../settings';

/** The saved copy, with just the fields a case cares about overridden. */
function copy(over: Partial<ProviderListEmailSettings> = {}): ProviderListEmailSettings {
  return { ...DEFAULT_SETTINGS.emails.providerList, ...over };
}

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

  it('uses the default callback number from settings', () => {
    expect(content.html).toContain('(470) 635-5774');
  });
});

describe('buildProviderListEmail with admin-edited copy', () => {
  it('renders the saved copy, not the shipped default', () => {
    const out = buildProviderListEmail({}, copy({ intro: 'We cannot help right now.' }));
    expect(out.html).toContain('We cannot help right now.');
    expect(out.html).not.toContain('Thank you for reaching out');
  });

  it('substitutes {{childName}} and {{phone}} in the body', () => {
    const out = buildProviderListEmail(
      { childName: 'Amaya' },
      copy({ intro: 'About {{childName}}.', closing: 'Call {{phone}}.', phone: '(555) 000-1111' })
    );
    expect(out.html).toContain('About Amaya.');
    expect(out.html).toContain('Call (555) 000-1111.');
    expect(out.html).not.toContain('{{');
  });

  it('falls back to "your child" when no child name is on file', () => {
    const out = buildProviderListEmail({}, copy({ intro: 'About {{childName}}.' }));
    expect(out.html).toContain('About your child.');
  });

  it('splits blank-line-separated copy into separate paragraphs', () => {
    const out = buildProviderListEmail({}, copy({ closing: 'One.\n\nTwo.' }));
    expect(out.html).toContain('<p style="margin:0 0 12px;">One.</p>');
    expect(out.html).toContain('<p style="margin:0 0 12px;">Two.</p>');
  });

  it('turns a single newline into a line break, not a new paragraph', () => {
    const out = buildProviderListEmail({}, copy({ closing: 'One.\nTwo.' }));
    expect(out.html).toContain('One.<br />Two.');
  });

  it('neutralizes markup an admin pastes into the copy', () => {
    const out = buildProviderListEmail(
      {},
      copy({ intro: '<script>alert(1)</script><a href="http://evil.test">click</a>' })
    );
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('href="http://evil.test"');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('leaves the subject as plain text, unescaped', () => {
    const out = buildProviderListEmail({}, copy({ subject: "Your family's provider list" }));
    expect(out.subject).toBe("Your family's provider list");
    expect(out.subject).not.toContain('&#39;');
  });

  it('substitutes {{phone}} in the subject but never {{childName}}', () => {
    const out = buildProviderListEmail(
      { childName: 'Amaya' },
      copy({ subject: 'Call {{phone}} about {{childName}}', phone: '(555) 000-1111' })
    );
    expect(out.subject).toContain('(555) 000-1111');
    expect(out.subject).not.toContain('Amaya');
  });

  it('reports which fields contain a long dash', () => {
    expect(findDashFields(copy())).toEqual([]);
    expect(findDashFields(copy({ intro: 'a — b', closing: 'c – d' }))).toEqual(['intro', 'closing']);
  });
});

describe('provider-list copy settings', () => {
  it('rejects a client name in the subject (PHI in an unencrypted header)', () => {
    expect(() =>
      validateSettings({ emails: { providerList: { subject: 'About {{childName}}' } } })
    ).toThrow(SettingsValidationError);
  });

  it('rejects an empty field rather than sending a blank paragraph', () => {
    expect(() => validateSettings({ emails: { providerList: { intro: '   ' } } })).toThrow(
      SettingsValidationError
    );
  });

  it('rejects copy past the length cap', () => {
    expect(() =>
      validateSettings({ emails: { providerList: { ctaLabel: 'x'.repeat(81) } } })
    ).toThrow(SettingsValidationError);
  });

  it('accepts a normal edit and keeps the other fields', () => {
    const out = validateSettings({
      emails: { providerList: { intro: 'Short and kind.' } },
    });
    expect(out.emails.providerList.intro).toBe('Short and kind.');
    expect(out.emails.providerList.ctaLabel).toBe(
      DEFAULT_SETTINGS.emails.providerList.ctaLabel
    );
  });

  it('falls back field-by-field so a partial doc cannot blank the email', () => {
    const merged = mergeWithDefaults({ emails: { providerList: { subject: 'Kept' } } });
    expect(merged.emails.providerList.subject).toBe('Kept');
    expect(merged.emails.providerList.intro).toBe(
      DEFAULT_SETTINGS.emails.providerList.intro
    );
  });

  it('default copy is free of em and en dashes', () => {
    expect(findDashFields(DEFAULT_SETTINGS.emails.providerList)).toEqual([]);
  });
});
