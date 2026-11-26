/**
 * Healthcare plan review: pure helpers shared by the progress-note form, its
 * submit gate, the PDF renderer, the admin note view and the API routes.
 * NO Firebase imports: ProgressNotePDF is server-rendered and imports this.
 *
 * A client's healthcare plans are the documents filed under the
 * "Healthcare Plan" category. A nurse reviews each plan once: she opens it,
 * then acknowledges it, and the server stores a read receipt tied to that
 * exact file. Replacing the file makes a new version, so her receipt no
 * longer covers it and she is asked to review that plan again.
 *
 * What a note stores (inside the flat form-values map):
 *   hcpReviewMeta   JSON snapshot of the client's current plans and when THIS
 *                   nurse reviewed each one. Written by the form for new
 *                   notes; never refreshed when a submitted note is edited,
 *                   so it stays the record of what was true at charting time.
 */

/** Must match the name in docCategories.ts. */
export const HEALTHCARE_PLAN_CATEGORY = 'Healthcare Plan';

/** The safety-checklist value the review backs. Stored on notes; never recase. */
export const CARE_PLAN_REVIEWED_VALUE = 'Care plan reviewed at start of shift';

/** One current plan with the calling nurse's receipt state. */
export interface HealthcarePlanStatus {
  documentId: string;
  title: string;
  /** Date on the plan, YYYY-MM-DD. */
  docDate: string;
  /** Identifies the file behind the document; changes when it is replaced. */
  version: string;
  /** ISO time the nurse opened this version, or ''. */
  openedAt: string;
  /** ISO time the nurse acknowledged this version, or ''. */
  reviewedAt: string;
  /** ISO time she acknowledged an EARLIER version, or ''. Set only while the
   *  current version is unreviewed, to explain why it is being asked again. */
  previousReviewedAt: string;
}

/** One row of the supervisor's read-status table. */
export interface HealthcarePlanReader {
  uid: string;
  name: string;
  credential: string;
  /** On the client's care team (assignedNurseIds). */
  onCareTeam: boolean;
  /** documentId -> ISO time she acknowledged the CURRENT version. */
  reviewed: Record<string, string>;
}

export interface HcpReviewMetaEntry {
  documentId: string;
  title: string;
  docDate: string;
  /** ISO time, or '' when the nurse had not reviewed the plan. */
  reviewedAt: string;
}

export function pendingPlans<T extends { reviewedAt: string }>(plans: T[]): T[] {
  return plans.filter((p) => !p.reviewedAt);
}

/** Serialize the snapshot for storage on the note ('' when no plans). */
export function buildHcpReviewMeta(plans: HealthcarePlanStatus[]): string {
  if (plans.length === 0) return '';
  const entries: HcpReviewMetaEntry[] = plans.map((p) => ({
    documentId: p.documentId,
    title: p.title,
    docDate: p.docDate,
    reviewedAt: p.reviewedAt,
  }));
  return JSON.stringify(entries);
}

/** Parse a stored hcpReviewMeta value. Returns [] for missing/corrupt data. */
export function parseHcpReviewMeta(raw: unknown): HcpReviewMetaEntry[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => typeof e.documentId === 'string' && e.documentId.length > 0 && typeof e.title === 'string')
      .map((e) => ({
        documentId: e.documentId as string,
        title: e.title as string,
        docDate: typeof e.docDate === 'string' ? e.docDate : '',
        reviewedAt: typeof e.reviewedAt === 'string' ? e.reviewedAt : '',
      }));
  } catch {
    return [];
  }
}

/** Plans in a note's snapshot the nurse has not reviewed (the submit gate). */
export function unreviewedPlansOnNote(data: Record<string, unknown>): HcpReviewMetaEntry[] {
  return pendingPlans(parseHcpReviewMeta(data['hcpReviewMeta']));
}

/** MM/DD/YYYY in the agency's time zone for an ISO instant; '' when invalid. */
export function reviewDateUS(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
}

function planDateUS(docDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(docDate);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

/**
 * The lines printed on the note PDF and the admin note view, one per plan:
 * "Skin Integrity (plan dated 11/19/2026): reviewed 11/26/2026".
 */
export function hcpReviewLines(data: Record<string, unknown>): string[] {
  return parseHcpReviewMeta(data['hcpReviewMeta']).map((e) => {
    const dated = planDateUS(e.docDate);
    const reviewed = reviewDateUS(e.reviewedAt);
    return `${e.title}${dated ? ` (plan dated ${dated})` : ''}: ${reviewed ? `reviewed ${reviewed}` : 'not reviewed'}`;
  });
}

/** "9 of 9" style progress for one reader against the current plans. */
export function readerProgress(reader: HealthcarePlanReader, planIds: string[]): { done: number; total: number; lastReviewedAt: string } {
  const times = planIds.map((id) => reader.reviewed[id] || '').filter(Boolean);
  return { done: times.length, total: planIds.length, lastReviewedAt: times.sort().at(-1) || '' };
}
