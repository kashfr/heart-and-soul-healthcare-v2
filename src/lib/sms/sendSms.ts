import 'server-only';
import { phoneDigits } from '../phone';

/**
 * Transactional SMS via the Quo (formerly OpenPhone) REST API, called with plain
 * `fetch` so there is no SDK dependency to install. Best-effort and self-gating:
 * if Quo isn't configured (env vars absent) or the number isn't a usable US
 * number, it no-ops with `skipped: true`, so callers can fire it unconditionally.
 *
 * Configure with QUO_API_KEY (Quo > Settings > API) and QUO_FROM_NUMBER (one of
 * your workspace's Quo numbers, given in any US format; sent as E.164). That Quo
 * number must be A2P 10DLC-registered in Quo before carrier delivery is reliable.
 *
 * IMPORTANT: SMS is unencrypted and is NOT a covered service under Quo's BAA.
 * NEVER pass PHI (client names, clinical detail) in `body` — keep it to a generic
 * "a note needs your attention" + a link.
 */
const QUO_BASE = 'https://api.quo.com/v1';

export interface SendSmsResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** US phone in any format to E.164 (+1XXXXXXXXXX), or null if not a valid US number. */
export function toE164US(raw: string): string | null {
  const d = phoneDigits(raw || '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

export async function sendSms(toRaw: string, body: string): Promise<SendSmsResult> {
  const apiKey = process.env.QUO_API_KEY;
  const fromRaw = process.env.QUO_FROM_NUMBER;

  if (!apiKey || !fromRaw) {
    return { ok: false, skipped: true, error: 'Quo SMS is not configured.' };
  }
  const from = toE164US(fromRaw);
  if (!from) {
    return { ok: false, skipped: true, error: 'QUO_FROM_NUMBER is not a valid US number.' };
  }
  const to = toE164US(toRaw);
  if (!to) {
    return { ok: false, skipped: true, error: 'No valid US number on file.' };
  }

  try {
    const res = await fetch(`${QUO_BASE}/messages`, {
      method: 'POST',
      headers: {
        // Quo expects the raw API key with NO "Bearer " prefix.
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], content: body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Quo SMS send failed:', res.status, detail);
      return { ok: false, error: `Quo responded ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown SMS send failure.';
    console.error('Quo SMS send threw:', err);
    return { ok: false, error: message };
  }
}
