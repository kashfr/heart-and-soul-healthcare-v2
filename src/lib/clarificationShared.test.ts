import { describe, it, expect } from 'vitest';
import {
  clarificationTurn,
  clarificationTurnLabel,
  type NoteClarification,
  type ClarificationMessage,
} from './clarificationShared';

const AUTHOR = 'nurse-uid';
const REVIEWER = 'lilian-uid';

function msg(over: Partial<ClarificationMessage> = {}): ClarificationMessage {
  return { by: REVIEWER, byName: 'Lilian', byRole: 'supervisor', text: 'Please check the date.', ...over };
}

function flag(over: Partial<NoteClarification> = {}): NoteClarification {
  return {
    status: 'open',
    kind: 'correction',
    message: 'Please check the date.',
    flaggedBy: REVIEWER,
    flaggedByName: 'Lilian',
    flaggedByRole: 'supervisor',
    ...over,
  };
}

describe('clarificationTurn', () => {
  it('is null when there is no flag or the flag is resolved', () => {
    expect(clarificationTurn(null, AUTHOR)).toBeNull();
    expect(clarificationTurn(undefined, AUTHOR)).toBeNull();
    expect(clarificationTurn(flag({ status: 'resolved' }), AUTHOR)).toBeNull();
  });

  it('is the nurse\'s turn on a freshly raised flag with no reply', () => {
    expect(clarificationTurn(flag(), AUTHOR)).toBe('nurse');
    expect(clarificationTurn(flag({ thread: [msg()] }), AUTHOR)).toBe('nurse');
  });

  it('is the reviewer\'s turn once the author has the last word', () => {
    const replied = flag({
      thread: [msg(), msg({ by: AUTHOR, byName: 'Bianca', byRole: 'nurse', text: 'Fixed it.' })],
    });
    expect(clarificationTurn(replied, AUTHOR)).toBe('reviewer');
  });

  it('flips back to the nurse when a reviewer answers her reply', () => {
    const answered = flag({
      thread: [
        msg(),
        msg({ by: AUTHOR, byName: 'Bianca', byRole: 'nurse', text: 'Fixed it.' }),
        msg({ text: 'Still wrong, see the time.' }),
      ],
    });
    expect(clarificationTurn(answered, AUTHOR)).toBe('nurse');
  });

  it('treats an RN reviewer (role nurse) who is not the author as a reviewer message', () => {
    const rnReviewerLast = flag({
      thread: [msg(), msg({ by: 'rn-reviewer-uid', byName: 'Roneika', byRole: 'nurse', text: 'Please amend.' })],
    });
    expect(clarificationTurn(rnReviewerLast, AUTHOR)).toBe('nurse');
  });

  it('falls back to the role check for legacy single-field threads with no uid', () => {
    const legacy = flag({ response: 'Corrected.', respondedByName: 'Bianca', respondedByRole: 'nurse' });
    expect(clarificationTurn(legacy, AUTHOR)).toBe('reviewer');
    expect(clarificationTurn(legacy)).toBe('reviewer');
  });
});

describe('clarificationTurnLabel', () => {
  it('phrases the nurse\'s turn as an obligation for the author and a state for everyone else', () => {
    expect(clarificationTurnLabel('nurse', true)).toBe('Your reply needed');
    expect(clarificationTurnLabel('nurse', false)).toBe('Waiting on nurse');
  });

  it('phrases the reviewer\'s turn from each side', () => {
    expect(clarificationTurnLabel('reviewer', true)).toBe('Waiting on reviewer');
    expect(clarificationTurnLabel('reviewer', false)).toBe('Nurse replied');
  });

  it('is empty when nothing is open', () => {
    expect(clarificationTurnLabel(null, true)).toBe('');
    expect(clarificationTurnLabel(null, false)).toBe('');
  });
});
