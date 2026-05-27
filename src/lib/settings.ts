/**
 * Org-wide settings stored in a single Firestore document at
 * `settings/global`. Edited via /admin/settings (admin-only) and read
 * everywhere via the SettingsProvider context (one fetch per session).
 *
 * Design intent: a single doc keeps reads cheap, writes atomic, and
 * the schema scannable. New tunable values get added here + to the
 * admin form + (where needed) wired into the consumer page. The
 * pattern is the architecture; the current fields are just the first
 * batch — more come as needs surface.
 *
 * Important: this module has NO Firebase imports so it stays unit-
 * testable. The actual Firestore read/write lives in server routes
 * and client hooks that import these types + defaults.
 */

export type SubmissionsSortKey =
  | 'submittedAt'
  | 'dateOfService'
  | 'clientName'
  | 'nurseName';
export type SubmissionsSortDir = 'asc' | 'desc';
export type SubmissionsScope = 'active' | 'archived' | 'all' | 'team';

export interface SubmissionsSettings {
  /** Sort column the Submissions list lands on with no URL params. */
  defaultSort: SubmissionsSortKey;
  /** Sort direction the Submissions list lands on with no URL params. */
  defaultDir: SubmissionsSortDir;
  /** Scope tab the Submissions list lands on with no URL params. */
  defaultScope: SubmissionsScope;
  /** Rows per page in the Submissions list. Clamped to [5, 100]. */
  pageSize: number;
  /**
   * When an RN signs in and lands on /admin/submissions with no
   * filters, auto-apply the Needs co-signature filter. Set to false
   * to let RNs see the full Active list by default.
   */
  rnDefaultsToNeedsCosign: boolean;
}

export interface AppSettings {
  submissions: SubmissionsSettings;
}

/**
 * Hard-coded fallbacks used whenever the Firestore doc is missing
 * (fresh install, first load) or a field is absent from it. Match the
 * values we used to hardcode at the call sites before this module
 * existed, so adopting the settings system is a behavior-preserving
 * refactor for anyone who hasn't customized.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  submissions: {
    defaultSort: 'dateOfService',
    defaultDir: 'desc',
    defaultScope: 'active',
    pageSize: 25,
    rnDefaultsToNeedsCosign: true,
  },
};

/**
 * Merge a partial settings doc (whatever's in Firestore) with the
 * hard-coded defaults. Per-leaf merge so a doc that omits a single
 * field doesn't blow away its default. Used by both the GET API and
 * the client hook.
 */
export function mergeWithDefaults(partial: unknown): AppSettings {
  const p = (partial ?? {}) as Partial<AppSettings>;
  const sub = (p.submissions ?? {}) as Partial<SubmissionsSettings>;
  return {
    submissions: {
      defaultSort: sub.defaultSort ?? DEFAULT_SETTINGS.submissions.defaultSort,
      defaultDir: sub.defaultDir ?? DEFAULT_SETTINGS.submissions.defaultDir,
      defaultScope: sub.defaultScope ?? DEFAULT_SETTINGS.submissions.defaultScope,
      pageSize: clampPageSize(sub.pageSize ?? DEFAULT_SETTINGS.submissions.pageSize),
      rnDefaultsToNeedsCosign:
        typeof sub.rnDefaultsToNeedsCosign === 'boolean'
          ? sub.rnDefaultsToNeedsCosign
          : DEFAULT_SETTINGS.submissions.rnDefaultsToNeedsCosign,
    },
  };
}

const VALID_SORT_KEYS: readonly SubmissionsSortKey[] = [
  'submittedAt',
  'dateOfService',
  'clientName',
  'nurseName',
];
const VALID_SORT_DIRS: readonly SubmissionsSortDir[] = ['asc', 'desc'];
const VALID_SCOPES: readonly SubmissionsScope[] = ['active', 'archived', 'all', 'team'];

/**
 * Validate a settings payload coming from the admin form / API body.
 * Returns the cleaned-and-merged shape or throws a SettingsValidationError
 * with the first offending field. Server-side guard so a malformed PUT
 * can't corrupt the doc.
 */
export class SettingsValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export function validateSettings(payload: unknown): AppSettings {
  const p = (payload ?? {}) as Partial<AppSettings>;
  const sub = (p.submissions ?? {}) as Partial<SubmissionsSettings>;

  if (sub.defaultSort !== undefined && !VALID_SORT_KEYS.includes(sub.defaultSort)) {
    throw new SettingsValidationError('submissions.defaultSort', 'Invalid sort key.');
  }
  if (sub.defaultDir !== undefined && !VALID_SORT_DIRS.includes(sub.defaultDir)) {
    throw new SettingsValidationError('submissions.defaultDir', 'Invalid sort direction.');
  }
  if (sub.defaultScope !== undefined && !VALID_SCOPES.includes(sub.defaultScope)) {
    throw new SettingsValidationError('submissions.defaultScope', 'Invalid scope.');
  }
  if (sub.pageSize !== undefined && (typeof sub.pageSize !== 'number' || !Number.isFinite(sub.pageSize))) {
    throw new SettingsValidationError('submissions.pageSize', 'pageSize must be a number.');
  }
  if (
    sub.rnDefaultsToNeedsCosign !== undefined &&
    typeof sub.rnDefaultsToNeedsCosign !== 'boolean'
  ) {
    throw new SettingsValidationError(
      'submissions.rnDefaultsToNeedsCosign',
      'rnDefaultsToNeedsCosign must be true or false.',
    );
  }

  return mergeWithDefaults(p);
}

function clampPageSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.submissions.pageSize;
  return Math.max(5, Math.min(100, Math.round(n)));
}
