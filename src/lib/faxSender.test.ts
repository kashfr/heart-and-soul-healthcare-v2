// @vitest-environment node
// Every outbound fax names Heart and Soul Healthcare beside the sender: the
// shared helper, the SRFax header on the wire, and the cover sheet's From line.
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { FAX_HEADER_MAX, FAX_ORG_NAME, faxHeaderLine, faxSenderLine } from './faxShared';
import { srfaxQueueFax } from './fax/srfax';
import FaxCoverPDF, { type FaxCoverPdfProps } from './pdf/FaxCoverPDF';

describe('faxSenderLine', () => {
  it('puts the organization after the name', () => {
    expect(faxSenderLine('Test Sender')).toBe('Test Sender, Heart and Soul Healthcare');
  });
  it('uses the organization alone when no name is known', () => {
    for (const n of ['', '   ', null, undefined]) expect(faxSenderLine(n)).toBe(FAX_ORG_NAME);
  });
  it('never doubles the organization', () => {
    expect(faxSenderLine('Heart and Soul Healthcare')).toBe(FAX_ORG_NAME);
    expect(faxSenderLine('Test Sender, Heart and Soul Healthcare')).toBe('Test Sender, Heart and Soul Healthcare');
  });
  it('tidies stray spacing and trailing commas', () => {
    expect(faxSenderLine('  Test   Sender , ')).toBe('Test Sender, Heart and Soul Healthcare');
  });
});

describe('faxHeaderLine', () => {
  it('carries the full sender line when it fits SRFax\'s limit', () => {
    expect(faxHeaderLine('Test Sender')).toBe('Test Sender, Heart and Soul Healthcare');
  });
  it('falls back to the organization rather than cutting it off', () => {
    const long = 'Alexandra Montgomery-Fitzwilliam';
    expect(faxSenderLine(long).length).toBeGreaterThan(FAX_HEADER_MAX);
    expect(faxHeaderLine(long)).toBe(FAX_ORG_NAME);
  });
});

describe('srfaxQueueFax', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
  async function sentBody(senderName: string) {
    process.env.SRFAX_ACCESS_ID = 'test'; process.env.SRFAX_ACCESS_PWD = 'test'; process.env.SRFAX_FAX_NUMBER = '4705550100';
    const fetch = vi.fn(async () => new Response(JSON.stringify({ Status: 'Success', Result: '123' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const r = await srfaxQueueFax({ toTenDigits: '4045550100', fileName: 'x.pdf', pdf: Buffer.from('%PDF-'), senderName });
    expect(r.ok).toBe(true);
    return JSON.parse(String((fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body)) as Record<string, string>;
  }
  it('always sends a header that names the organization beside the sender', async () => {
    expect((await sentBody('Test Sender')).sFaxFromHeader).toBe('Test Sender, Heart and Soul Healthcare');
  });
  it('sends the organization alone when there is no sender name', async () => {
    expect((await sentBody('')).sFaxFromHeader).toBe(FAX_ORG_NAME);
  });
});

describe('FaxCoverPDF From line', () => {
  type El = { props?: { label?: string; value?: string; children?: unknown } };
  function findFrom(node: unknown): string | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) { for (const n of node) { const v = findFrom(n); if (v !== undefined) return v; } return undefined; }
    const el = node as El;
    if (el.props?.label === 'From') return el.props.value;
    return findFrom(el.props?.children);
  }
  const base: FaxCoverPdfProps = { recipientName: 'Test Office', recipientOrg: '', toNumber: '4045550100', senderName: '', returnFax: '4705550100', totalPages: 2, sentDate: 'Nov 25, 2026', regarding: 'Test', note: '', reference: 'ABC' };
  it('names the organization beside the sender', () => {
    expect(findFrom(FaxCoverPDF({ ...base, senderName: 'Test Sender' }))).toBe('Test Sender, Heart and Soul Healthcare');
  });
  it('names the organization when the sender is unknown (automatic reminders)', () => {
    expect(findFrom(FaxCoverPDF(base))).toBe(FAX_ORG_NAME);
  });
});
