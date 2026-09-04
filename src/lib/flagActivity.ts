/**
 * Pure helpers for "the author did something on a flagged note" notifications:
 * who to tell, and what each channel says. No Firebase and no Resend, so the
 * fan-out rules are unit-tested and clarificationServer.ts stays thin.
 *
 * Two events reach reviewers:
 *   'amended' — the author saved an amendment to a note with an OPEN flag
 *               (correction or clarification, blocking or not).
 *   'replied' — the author posted a reply in the flag's thread.
 *
 * Before this module, only a BLOCKING correction's amendment notified anyone,
 * and only the configured corrections reviewer plus admins — never the person
 * who actually raised the flag. The RN supervisor learned about replies and
 * advisory-correction fixes only by being in the portal (2026-09).
 */
export type FlagActivityEvent = 'amended' | 'replied';
export type FlagKind = 'clarification' | 'correction';

export interface FlagRecipientPlan {
  uid: string;
  /** Why this person is on the list; one uid can hold several reasons. */
  reasons: Array<'flagger' | 'reviewer' | 'admin'>;
  /**
   * Also send the PHI-free text message. Reserved for the people expected to
   * act promptly (the flagger and the configured reviewer); admins get email
   * and bell without the text-message noise.
   */
  sms: boolean;
}

/**
 * Who gets told, in priority order: whoever raised the flag, the configured
 * corrections reviewer, then every active admin — deduped, with the author
 * herself excluded (she is the one who acted). A uid appearing under several
 * reasons keeps the strongest channel set.
 */
export function planFlagRecipients(input: {
  flaggerUid?: string;
  reviewerUid?: string;
  adminUids: string[];
  /** The note's author — never notified about her own activity. */
  excludeUid?: string;
}): FlagRecipientPlan[] {
  const out = new Map<string, FlagRecipientPlan>();
  const add = (uid: string | undefined, reason: FlagRecipientPlan['reasons'][number], sms: boolean) => {
    if (!uid || uid === input.excludeUid) return;
    const cur = out.get(uid);
    if (cur) {
      if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
      cur.sms = cur.sms || sms;
      return;
    }
    out.set(uid, { uid, reasons: [reason], sms });
  };
  add(input.flaggerUid, 'flagger', true);
  add(input.reviewerUid, 'reviewer', true);
  for (const a of input.adminUids) add(a, 'admin', false);
  return [...out.values()];
}

export interface FlagActivityContext {
  event: FlagActivityEvent;
  kind: FlagKind;
  /** The open correction still blocks the author from new notes. */
  blocking: boolean;
  nurseName: string;
  clientName: string;
  /** Already formatted for display (MM/DD/YYYY). */
  dateOfService: string;
  /** The author's reply text, for 'replied'. */
  replyText?: string;
}

const BELL_EXCERPT_MAX = 140;

function excerpt(s: string | undefined, max: number): string {
  const t = (s || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** The line appended to the thread when the author amends the note. */
export function flagActivityThreadLine(event: FlagActivityEvent, blocking: boolean): string {
  if (event !== 'amended') return '';
  return blocking
    ? 'Amended the note. The changes are listed in the amendment history below. Awaiting reviewer verification to lift the block.'
    : 'Amended the note. The changes are listed in the amendment history below.';
}

/**
 * Portal bell text. Lives behind the login, so it may name the client — this
 * is the channel that carries the detail the PHI-free SMS omits.
 */
export function flagActivityBellText(ctx: FlagActivityContext): string {
  const who = ctx.nurseName || 'A nurse';
  const note = `${ctx.clientName}'s note (${ctx.dateOfService})`;
  if (ctx.event === 'replied') {
    const q = excerpt(ctx.replyText, BELL_EXCERPT_MAX);
    return `${who} replied to the ${ctx.kind} on ${note}${q ? `: "${q}"` : '.'}`;
  }
  if (ctx.blocking) {
    return `${who} amended ${note}, flagged for correction. The block on new notes stays on until you verify the fix and remove it.`;
  }
  return `${who} amended ${note}, flagged for ${ctx.kind}. Review the amendment and resolve the flag if it addresses it.`;
}

/**
 * Text message body. SMS is unencrypted and outside the BAA, so this NEVER
 * carries PHI — no client name, no clinical detail, no nurse name. Generic
 * nudge plus the login link, with the STOP footer the A2P registration needs.
 */
export function flagActivitySmsText(ctx: FlagActivityContext): string {
  const tail = 'https://www.heartandsoulhc.org/login Reply STOP to opt out.';
  if (ctx.event === 'replied') {
    return `Heart and Soul: a nurse replied on a note you flagged. Please review it in the portal: ${tail}`;
  }
  if (ctx.blocking) {
    return `Heart and Soul: a nurse amended a note flagged for correction. The block stays on until you verify the fix and remove it in the portal: ${tail}`;
  }
  return `Heart and Soul: a nurse amended a note you flagged. Please review it in the portal: ${tail}`;
}

export interface FlagActivityEmailCopy {
  subject: string;
  headline: string;
  /** Sentence before the client/date box. */
  intro: string;
  /** Paragraph after the box (and after the quoted reply, for 'replied'). */
  body: string;
  /** Button label. */
  cta: string;
}

/**
 * Email copy per event. Email carries client name and date only (existing
 * convention); the sender renders the reply text itself for 'replied'.
 * Phrased for any recipient — the flagger, the configured reviewer, or an
 * admin — so it never claims "you flagged" this note.
 */
export function flagActivityEmailCopy(ctx: FlagActivityContext): FlagActivityEmailCopy {
  const who = ctx.nurseName || 'A nurse';
  const where = `${ctx.clientName} (${ctx.dateOfService})`;
  if (ctx.event === 'replied') {
    return {
      subject: `Reply on a flagged note: ${where}`,
      headline: `The nurse replied to a ${ctx.kind}`,
      intro: `${who} replied on a progress note flagged for ${ctx.kind}:`,
      body: `Reply in the note's clarification panel if you need more, or mark the ${ctx.kind} resolved if this settles it.`,
      cta: 'Open the note',
    };
  }
  if (ctx.blocking) {
    return {
      subject: `Flagged note corrected: ${where}`,
      headline: 'A flagged note was corrected',
      intro: `${who} amended a progress note flagged for correction:`,
      body:
        'The block on new documentation is STILL IN PLACE. Please review the amendment (every change is listed in the note\'s amendment history). If it fixes what was flagged, remove the block or mark the correction resolved; both let the nurse document again. If it does not, add a follow-up saying exactly what still needs to change.',
      cta: 'Review the amendment',
    };
  }
  return {
    subject: `Flagged note amended: ${where}`,
    headline: 'A flagged note was amended',
    intro: `${who} amended a progress note flagged for ${ctx.kind}:`,
    body:
      'Please review the amendment (every change is listed in the note\'s amendment history). If it addresses what was flagged, mark the flag resolved. If it does not, add a follow-up saying exactly what still needs to change.',
    cta: 'Review the amendment',
  };
}
