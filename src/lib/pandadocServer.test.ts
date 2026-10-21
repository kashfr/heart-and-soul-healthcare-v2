// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('server-only', () => ({}));
vi.mock('./firebaseAdmin', () => ({ adminDb: vi.fn(), adminBucket: vi.fn() }));
vi.mock('./settingsServer', () => ({ getServerSettings: vi.fn() }));
vi.mock('./notificationsServer', () => ({ createPortalNotification: vi.fn() }));

import { verifyPandadocSignature } from './pandadocServer';

const body = '[{"event":"document_state_changed","data":{"id":"abc"}}]';
const sign = (key: string, raw: string) => createHmac('sha256', key).update(raw, 'utf8').digest('hex');

describe('verifyPandadocSignature', () => {
  afterEach(() => {
    delete process.env.PANDADOC_WEBHOOK_KEY;
  });
  it('accepts PandaDoc’s hex HMAC of the raw body', () => {
    process.env.PANDADOC_WEBHOOK_KEY = 'shared-key';
    expect(verifyPandadocSignature(body, sign('shared-key', body))).toBe(true);
    expect(verifyPandadocSignature(body, sign('shared-key', body).toUpperCase())).toBe(true);
  });
  it('rejects a wrong key, a tampered body, or junk', () => {
    process.env.PANDADOC_WEBHOOK_KEY = 'shared-key';
    expect(verifyPandadocSignature(body, sign('other-key', body))).toBe(false);
    expect(verifyPandadocSignature(body + ' ', sign('shared-key', body))).toBe(false);
    expect(verifyPandadocSignature(body, 'not-hex')).toBe(false);
    expect(verifyPandadocSignature(body, '')).toBe(false);
  });
  it('refuses everything when no key is configured', () => {
    expect(verifyPandadocSignature(body, sign('', body))).toBe(false);
  });
});
