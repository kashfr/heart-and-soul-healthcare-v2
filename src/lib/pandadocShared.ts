/**
 * PandaDoc document tracking (webhook only): pure helpers shared by the
 * webhook route, the E-signatures page, and vitest. No Firebase imports.
 *
 * On the current PandaDoc plan (Business, sandbox API only) the portal cannot
 * create, send, or download documents. Packets are still sent from PandaDoc
 * by hand; a PandaDoc webhook tells the portal each time one changes state,
 * and the portal shows where every tracked packet stands. Which documents are
 * tracked is decided by name (Settings > E-signature tracking), so start of
 * care packets (client information, no BAA yet) are left out.
 */

/** Recipients at this domain sign for the agency (the countersignature). */
export const INTERNAL_EMAIL_DOMAIN = 'heartandsoulhc.org';

export interface PandadocRecipient {
  email: string; // lowercased
  name: string;
  role: string;
  completed: boolean;
  internal: boolean;
}

export interface PandadocDocEvent {
  event: string; // 'document_state_changed' | 'recipient_completed' | 'document_deleted' | ...
  id: string;
  name: string;
  templateName: string;
  /** PandaDoc status, e.g. 'document.sent', 'document.completed'. */
  status: string;
  /** ISO date PandaDoc last modified the document ('' when absent). */
  modifiedAt: string;
  createdAt: string;
  sentByName: string;
  recipients: PandadocRecipient[];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function personName(p: Record<string, unknown> | undefined): string {
  if (!p) return '';
  return [str(p.first_name), str(p.last_name)].filter(Boolean).join(' ').trim() || str(p.email);
}

/**
 * Normalize a webhook body. PandaDoc posts a JSON array of
 * `{ event, data }` objects (one delivery can batch several); anything
 * unrecognizable is skipped rather than failing the whole delivery.
 */
export function parsePandadocWebhook(body: unknown): PandadocDocEvent[] {
  const items = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
  const out: PandadocDocEvent[] = [];
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>;
    const data = (item.data || {}) as Record<string, unknown>;
    const id = str(data.id);
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
    const template = (data.template || {}) as Record<string, unknown>;
    const recipients = Array.isArray(data.recipients) ? (data.recipients as Record<string, unknown>[]) : [];
    out.push({
      event: str(item.event),
      id,
      name: str(data.name).slice(0, 200),
      templateName: str(template.name).slice(0, 200),
      status: str(data.status),
      modifiedAt: str(data.date_modified),
      createdAt: str(data.date_created),
      sentByName: personName((data.sent_by || data.created_by) as Record<string, unknown> | undefined),
      recipients: recipients
        .map((r) => {
          const email = str(r.email).trim().toLowerCase();
          return {
            email,
            name: personName(r),
            role: str(r.role),
            completed: r.has_completed === true,
            internal: email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`),
          };
        })
        .filter((r) => r.email),
    });
  }
  return out;
}

/** Is this document one the settings say to track (by document or template name)? */
export function isTrackedDocument(doc: { name: string; templateName: string }, keywords: string[]): boolean {
  const hay = `${doc.name} ${doc.templateName}`.toLowerCase();
  return keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).some((k) => hay.includes(k));
}

export type PacketStage = 'draft' | 'with-recipient' | 'awaiting-countersign' | 'completed' | 'declined' | 'voided' | 'expired' | 'other';

/**
 * Where the packet stands, in office terms. "Awaiting countersign" is the one
 * to act on: every outside signer is done and a Heart and Soul signer is not.
 */
export function packetStage(status: string, recipients: PandadocRecipient[]): PacketStage {
  const s = status.replace(/^document\./, '');
  if (s === 'completed' || s === 'paid') return 'completed';
  if (s === 'declined' || s === 'rejected') return 'declined';
  if (s === 'voided') return 'voided';
  if (s === 'expired') return 'expired';
  if (s === 'draft' || s === 'uploaded') return 'draft';
  if (s === 'sent' || s === 'viewed' || s === 'waiting_approval' || s === 'approved' || s === 'waiting_pay' || s === 'external_review') {
    const outside = recipients.filter((r) => !r.internal);
    const inside = recipients.filter((r) => r.internal);
    if (outside.length > 0 && outside.every((r) => r.completed) && inside.some((r) => !r.completed)) return 'awaiting-countersign';
    return 'with-recipient';
  }
  return 'other';
}

export const PACKET_STAGE_LABEL: Record<PacketStage, string> = {
  draft: 'Draft (not sent)',
  'with-recipient': 'Waiting on the recipient',
  'awaiting-countersign': 'Waiting on Heart and Soul',
  completed: 'Completed',
  declined: 'Declined',
  voided: 'Voided',
  expired: 'Expired',
  other: 'In progress',
};

/**
 * Should an incoming event replace what we have? PandaDoc can deliver out of
 * order and retries, so an older modification never overwrites a newer one.
 * Missing dates are accepted (better a possibly stale update than none).
 */
export function isNewer(incoming: string, stored: string): boolean {
  if (!incoming || !stored) return true;
  const a = Date.parse(incoming);
  const b = Date.parse(stored);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a >= b;
}

/** The person the packet is about: the first outside recipient. */
export function packetSubject(recipients: PandadocRecipient[]): PandadocRecipient | null {
  return recipients.find((r) => !r.internal) ?? null;
}
