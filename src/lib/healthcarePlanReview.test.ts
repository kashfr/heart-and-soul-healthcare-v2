import { describe, expect, it } from 'vitest';
import {
  buildHcpReviewMeta,
  hcpReviewLines,
  parseHcpReviewMeta,
  pendingPlans,
  readerProgress,
  reviewDateUS,
  unreviewedPlansOnNote,
  HEALTHCARE_PLAN_CATEGORY,
  type HealthcarePlanStatus,
} from './healthcarePlanReview';
import { isDocCategory } from './docCategories';

const plan = (over: Partial<HealthcarePlanStatus>): HealthcarePlanStatus => ({
  documentId: 'doc1',
  title: 'Healthcare Plan - Skin Integrity Management',
  docDate: '2026-11-19',
  version: 'v1',
  openedAt: '',
  reviewedAt: '',
  previousReviewedAt: '',
  ...over,
});

describe('healthcare plan review', () => {
  it('uses a real document category', () => {
    expect(isDocCategory(HEALTHCARE_PLAN_CATEGORY)).toBe(true);
  });

  it('treats a plan without an acknowledgment as pending, even when opened', () => {
    const plans = [plan({ openedAt: '2026-11-26T14:00:00.000Z' }), plan({ documentId: 'doc2', reviewedAt: '2026-11-26T14:05:00.000Z' })];
    expect(pendingPlans(plans).map((p) => p.documentId)).toEqual(['doc1']);
  });

  it('round-trips the note snapshot and stores nothing when there are no plans', () => {
    expect(buildHcpReviewMeta([])).toBe('');
    const raw = buildHcpReviewMeta([plan({ reviewedAt: '2026-11-26T14:05:00.000Z' })]);
    expect(parseHcpReviewMeta(raw)).toEqual([
      { documentId: 'doc1', title: 'Healthcare Plan - Skin Integrity Management', docDate: '2026-11-19', reviewedAt: '2026-11-26T14:05:00.000Z' },
    ]);
  });

  it('ignores a missing or corrupt snapshot instead of blocking the note', () => {
    expect(parseHcpReviewMeta(undefined)).toEqual([]);
    expect(parseHcpReviewMeta('{not json')).toEqual([]);
    expect(parseHcpReviewMeta('{"a":1}')).toEqual([]);
    expect(unreviewedPlansOnNote({})).toEqual([]);
  });

  it('gates the note on every plan the nurse has not reviewed', () => {
    const hcpReviewMeta = buildHcpReviewMeta([plan({}), plan({ documentId: 'doc2', title: 'Endocrine', reviewedAt: '2026-11-26T14:05:00.000Z' })]);
    expect(unreviewedPlansOnNote({ hcpReviewMeta }).map((p) => p.documentId)).toEqual(['doc1']);
  });

  it('formats review times in the agency time zone', () => {
    // 03:30 UTC on 11/27 is still 11/26 in Georgia.
    expect(reviewDateUS('2026-11-27T03:30:00.000Z')).toBe('11/26/2026');
    expect(reviewDateUS('')).toBe('');
    expect(reviewDateUS('nonsense')).toBe('');
  });

  it('prints one line per plan for the PDF and the admin view', () => {
    const hcpReviewMeta = buildHcpReviewMeta([plan({ reviewedAt: '2026-11-26T14:05:00.000Z' }), plan({ documentId: 'doc2', title: 'Endocrine', docDate: '' })]);
    expect(hcpReviewLines({ hcpReviewMeta })).toEqual([
      'Healthcare Plan - Skin Integrity Management (plan dated 11/19/2026): reviewed 11/26/2026',
      'Endocrine: not reviewed',
    ]);
  });

  it('counts a reader only against the current plans', () => {
    const reader = { uid: 'u1', name: 'Test Nurse', credential: 'LPN', onCareTeam: true, reviewed: { doc1: '2026-11-25T10:00:00.000Z', gone: '2026-11-26T10:00:00.000Z' } };
    expect(readerProgress(reader, ['doc1', 'doc2'])).toEqual({ done: 1, total: 2, lastReviewedAt: '2026-11-25T10:00:00.000Z' });
  });
});
