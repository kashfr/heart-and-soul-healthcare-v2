import { describe, it, expect } from 'vitest';
import {
  planFlagRecipients,
  flagActivityBellText,
  flagActivitySmsText,
  flagActivityEmailCopy,
  flagActivityThreadLine,
  type FlagActivityContext,
} from './flagActivity';
import {
  clarificationAwaitsReviewer,
  clarificationAwaitsNurse,
  type NoteClarification,
  type ClarificationMessage,
} from './clarificationShared';

function ctx(over: Partial<FlagActivityContext> = {}): FlagActivityContext {
  return {
    event: 'amended',
    kind: 'correction',
    blocking: true,
    nurseName: 'Bianca Bryant',
    clientName: 'Ann Torres',
    dateOfService: '09/03/2026',
    ...over,
  };
}

describe('planFlagRecipients', () => {
  it('notifies whoever raised the flag even when she is not the configured reviewer', () => {
    // The 2026-09 gap: a supervisor who flagged a note but was not the
    // configured reviewer heard nothing when the nurse amended it.
    const plan = planFlagRecipients({ flaggerUid: 'sup-lilian', reviewerUid: 'sup-other', adminUids: ['adm-1'] });
    expect(plan.map((p) => p.uid)).toEqual(['sup-lilian', 'sup-other', 'adm-1']);
    expect(plan[0]).toEqual({ uid: 'sup-lilian', reasons: ['flagger'], sms: true });
  });

  it('dedupes a flagger who is also the configured reviewer and keeps the text message', () => {
    const plan = planFlagRecipients({ flaggerUid: 'sup-lilian', reviewerUid: 'sup-lilian', adminUids: [] });
    expect(plan).toEqual([{ uid: 'sup-lilian', reasons: ['flagger', 'reviewer'], sms: true }]);
  });

  it('gives admins email and bell but no text unless they also flagged or review', () => {
    const plan = planFlagRecipients({ flaggerUid: 'adm-1', reviewerUid: '', adminUids: ['adm-1', 'adm-2'] });
    expect(plan).toEqual([
      { uid: 'adm-1', reasons: ['flagger', 'admin'], sms: true },
      { uid: 'adm-2', reasons: ['admin'], sms: false },
    ]);
  });

  it('never notifies the author about her own activity', () => {
    // An RN who flagged her own note (or is the configured reviewer) must not
    // be texted that she replied to herself.
    const plan = planFlagRecipients({ flaggerUid: 'rn-1', reviewerUid: 'rn-1', adminUids: ['rn-1', 'adm-1'], excludeUid: 'rn-1' });
    expect(plan.map((p) => p.uid)).toEqual(['adm-1']);
  });

  it('falls back to admins only when no reviewer is configured and the flag has no flagger (legacy)', () => {
    const plan = planFlagRecipients({ flaggerUid: '', reviewerUid: '', adminUids: ['adm-1'] });
    expect(plan).toEqual([{ uid: 'adm-1', reasons: ['admin'], sms: false }]);
  });
});

describe('flag activity copy', () => {
  it('mentions the block only when the correction actually blocks', () => {
    const blocking = flagActivityEmailCopy(ctx({ blocking: true }));
    const advisory = flagActivityEmailCopy(ctx({ blocking: false }));
    expect(blocking.body).toMatch(/STILL IN PLACE/);
    expect(advisory.body).not.toMatch(/block/i);
    expect(advisory.subject).toBe('Flagged note amended: Ann Torres (09/03/2026)');
    expect(flagActivityBellText(ctx({ blocking: true }))).toMatch(/block on new notes stays on/);
    expect(flagActivityBellText(ctx({ blocking: false, kind: 'clarification' }))).toMatch(/flagged for clarification/);
  });

  it('keeps every text message free of PHI', () => {
    for (const c of [ctx(), ctx({ blocking: false }), ctx({ event: 'replied', replyText: 'The date was 9/2, fixed.' })]) {
      const sms = flagActivitySmsText(c);
      expect(sms).not.toMatch(/Ann Torres|Bianca|09\/03|9\/2/);
      expect(sms).toMatch(/heartandsoulhc\.org\/login/);
      expect(sms).toMatch(/Reply STOP to opt out/);
    }
  });

  it('a reply carries the nurse\'s words to the bell and asks the reviewer to answer or resolve', () => {
    const c = ctx({ event: 'replied', kind: 'clarification', blocking: false, replyText: 'I re-checked: the visit was 09/02, corrected.' });
    expect(flagActivityBellText(c)).toBe(
      'Bianca Bryant replied to the clarification on Ann Torres\'s note (09/03/2026): "I re-checked: the visit was 09/02, corrected."',
    );
    const copy = flagActivityEmailCopy(c);
    expect(copy.subject).toBe('Reply on a flagged note: Ann Torres (09/03/2026)');
    expect(copy.body).toMatch(/mark the clarification resolved/);
    expect(copy.cta).toBe('Open the note');
  });

  it('truncates a long reply in the bell text', () => {
    const long = 'x'.repeat(400);
    const bell = flagActivityBellText(ctx({ event: 'replied', replyText: long }));
    expect(bell.length).toBeLessThan(260);
    expect(bell.endsWith('…"')).toBe(true);
  });

  it('never claims the recipient personally flagged the note (admins get the same email)', () => {
    for (const c of [ctx(), ctx({ blocking: false }), ctx({ event: 'replied', replyText: 'ok' })]) {
      const copy = flagActivityEmailCopy(c);
      expect(`${copy.intro} ${copy.body}`).not.toMatch(/you flagged/);
    }
  });

  it('thread line differs for blocking vs advisory amendments and is empty for replies', () => {
    expect(flagActivityThreadLine('amended', true)).toMatch(/Awaiting reviewer verification to lift the block/);
    expect(flagActivityThreadLine('amended', false)).not.toMatch(/block/);
    expect(flagActivityThreadLine('replied', true)).toBe('');
  });
});

describe('clarificationAwaitsReviewer', () => {
  const reviewerMsg: ClarificationMessage = { by: 'sup-lilian', byName: 'Lilian', byRole: 'supervisor', text: 'Fix the date.' };
  const authorMsg: ClarificationMessage = { by: 'nurse-1', byName: 'Bianca', byRole: 'nurse', text: 'Fixed.' };
  const base: NoteClarification = {
    status: 'open',
    kind: 'correction',
    message: 'Fix the date.',
    flaggedBy: 'sup-lilian',
    flaggedByName: 'Lilian',
    flaggedByRole: 'supervisor',
    thread: [reviewerMsg],
  };

  it('is false while the reviewer has the last word', () => {
    expect(clarificationAwaitsReviewer(base, 'nurse-1')).toBe(false);
    expect(clarificationAwaitsNurse(base)).toBe(true);
  });

  it('is true once the author replies or amends, and false again after a reviewer follow-up', () => {
    const replied = { ...base, thread: [reviewerMsg, authorMsg] };
    expect(clarificationAwaitsReviewer(replied, 'nurse-1')).toBe(true);
    expect(clarificationAwaitsNurse(replied)).toBe(false);
    const followedUp = { ...base, thread: [reviewerMsg, authorMsg, { ...reviewerMsg, text: 'Still wrong.' }] };
    expect(clarificationAwaitsReviewer(followedUp, 'nurse-1')).toBe(false);
  });

  it('uses the author uid, so an RN reviewer whose role is nurse is not mistaken for the author', () => {
    const rnReviewer: ClarificationMessage = { by: 'rn-2', byName: 'Nya', byRole: 'nurse', text: 'Please clarify the dose.' };
    const c = { ...base, flaggedBy: 'rn-2', thread: [rnReviewer] };
    expect(clarificationAwaitsReviewer(c, 'nurse-1')).toBe(false);
    expect(clarificationAwaitsReviewer({ ...c, thread: [rnReviewer, authorMsg] }, 'nurse-1')).toBe(true);
  });

  it('falls back to the role when a legacy message carries no uid', () => {
    const legacy: NoteClarification = { ...base, thread: undefined, response: 'Fixed.', respondedBy: '', respondedByRole: 'nurse' };
    expect(clarificationAwaitsReviewer(legacy, 'nurse-1')).toBe(true);
    expect(clarificationAwaitsReviewer(legacy)).toBe(true);
  });

  it('is false for resolved flags, empty threads, and missing flags', () => {
    expect(clarificationAwaitsReviewer({ ...base, status: 'resolved', thread: [reviewerMsg, authorMsg] }, 'nurse-1')).toBe(false);
    expect(clarificationAwaitsReviewer({ ...base, thread: [], message: '' }, 'nurse-1')).toBe(false);
    expect(clarificationAwaitsReviewer(undefined, 'nurse-1')).toBe(false);
  });
});
