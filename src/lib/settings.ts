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

/**
 * sessionStorage key the Submissions page uses to remember it has already
 * auto-applied the "Needs co-signature" view once this session (so an RN who
 * clears the filter isn't forced back to it on every navigation). The Settings
 * page clears this key on save so a freshly-changed setting takes effect on the
 * next Submissions visit — no new session/sign-in required.
 */
export const RN_COSIGN_SESSION_KEY = 'rn-cosign-default-applied';

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

/**
 * Clinical credentials that require an RN co-sign on every note. RN
 * itself can never appear here (RNs can't co-sign their own work, and
 * an RN co-signing another RN is clinically meaningless). Admin can
 * narrow or expand the list — common case is regulatory shifts or a
 * new credential type joining the staff (e.g. Medical Assistant).
 */
export type CosignableCredential = 'HHA' | 'CNA' | 'LPN';
export const ALL_COSIGNABLE_CREDENTIALS: readonly CosignableCredential[] = ['HHA', 'CNA', 'LPN'];

export interface CosignSettings {
  /** Which credentials require an RN co-sign on every submitted note. */
  requiredCredentials: CosignableCredential[];
}

export interface PatientSettings {
  /**
   * Whether nurses can type a free-form client name on the progress
   * note form, or must select an existing patient from the roster.
   * When false, the form blocks submission until patientId is set.
   * Keep true if you sometimes onboard new patients faster than admin
   * can add them to the roster.
   */
  allowFreeText: boolean;
}

/**
 * Age groups used by the vital-range editor. Mirrors the AgeGroup
 * union in vitalRanges.ts. Kept loose (plain strings) here so the
 * settings module stays dependency-free.
 */
export type VitalAgeGroupKey =
  | 'newborn'
  | 'infant'
  | 'toddler'
  | 'preschool'
  | 'schoolAge'
  | 'adolescent'
  | 'adult'
  | 'elderly';

export const ALL_VITAL_AGE_GROUPS: readonly VitalAgeGroupKey[] = [
  'newborn',
  'infant',
  'toddler',
  'preschool',
  'schoolAge',
  'adolescent',
  'adult',
  'elderly',
];

export type VitalRangeKey =
  | 'temperature'
  | 'systolic'
  | 'diastolic'
  | 'pulse'
  | 'respiration'
  | 'oxygenSaturation';

export const ALL_VITAL_RANGE_KEYS: readonly VitalRangeKey[] = [
  'temperature',
  'systolic',
  'diastolic',
  'pulse',
  'respiration',
  'oxygenSaturation',
];

/** A single { low, high } pair. */
export interface VitalRangePair {
  low: number;
  high: number;
}

/**
 * Per-age-group overrides for the hard-coded ranges in vitalRanges.ts.
 * Nested-partial on purpose: an admin might want to bump a single
 * threshold (e.g. preschool temperature floor) without redefining
 * every age group from scratch. Any leaf the override doesn't supply
 * falls back to the hard-coded value.
 */
export type VitalRangesOverride = {
  [G in VitalAgeGroupKey]?: {
    [V in VitalRangeKey]?: VitalRangePair;
  };
};

export interface VitalsSettings {
  /**
   * Sparse overrides for the default age-aware vital ranges. Empty
   * object means "use all hard-coded defaults." Used by every place
   * the app evaluates whether a vital is abnormal — dashboard pill,
   * form-time real-time alerts, detail view banner, PDF banner.
   */
  rangesByAgeGroup: VitalRangesOverride;
}

/**
 * Org-identity strings shown to users in the staff portal, on PDFs,
 * and as the human-readable part of outbound email From lines. The
 * actual from-email *address* stays in code/env (changing it requires
 * DNS/SPF/DKIM updates that a settings toggle can't perform), but the
 * display name and the other strings here are safe to make editable.
 *
 * Marketing-site Footer is intentionally NOT driven by this — the
 * marketing layout doesn't mount SettingsProvider, and these strings
 * are SEO-relevant where static is fine. If you ever need the public
 * site to match, do it as a code edit alongside the settings change.
 */
export interface BrandingSettings {
  /** Used in the AppShell sidebar, PDF header, detail-view header, and email bodies. */
  orgName: string;
  /** Subtitle under orgName on PDFs + the Submissions detail header. */
  tagline: string;
  /**
   * Human-readable part of the From line on outgoing emails — the
   * text before `<notifications@…>`. Empty string is treated as
   * "fall back to orgName" so admin can leave this blank and rely on
   * the main name.
   */
  fromEmailDisplay: string;
}

/**
 * Subject lines for outbound transactional emails sent via Resend.
 * Password-reset emails are sent by Firebase Auth itself (configurable
 * in Firebase Console → Authentication → Templates) — those aren't
 * controlled here and shouldn't try to be.
 */
export interface EmailsSubjects {
  /** Initial staff invitation email when a new user is added. */
  staffInviteWelcome: string;
  /** "Send a fresh reset link" email for an existing staff user. */
  staffInviteResend: string;
  /** Security notice to the OLD email address when admin changes a staff email. */
  emailChanged: string;
}

export interface EmailsSettings {
  subjects: EmailsSubjects;
}

export interface CriticalVitalsSettings {
  /**
   * When true (default), submitting a note whose vitals cross a
   * provider-notification threshold prompts the nurse to document escalation
   * or acknowledge why none was needed. Admin safety valve to switch the prompt
   * off if it proves too noisy before the thresholds are tuned.
   */
  enabled: boolean;
}

export interface AppSettings {
  submissions: SubmissionsSettings;
  cosign: CosignSettings;
  patient: PatientSettings;
  vitals: VitalsSettings;
  criticalVitals: CriticalVitalsSettings;
  branding: BrandingSettings;
  emails: EmailsSettings;
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
  cosign: {
    requiredCredentials: ['HHA', 'CNA', 'LPN'],
  },
  patient: {
    allowFreeText: true,
  },
  vitals: {
    // Empty override map → use all hard-coded defaults in vitalRanges.ts.
    rangesByAgeGroup: {},
  },
  criticalVitals: {
    enabled: true,
  },
  branding: {
    orgName: 'Heart and Soul Healthcare',
    tagline: 'Compassionate Care, Professional Excellence',
    fromEmailDisplay: 'Heart and Soul Healthcare',
  },
  emails: {
    subjects: {
      staffInviteWelcome: 'Welcome to Heart and Soul Healthcare — set up your account',
      staffInviteResend: 'Your Heart and Soul Healthcare password reset link',
      emailChanged: 'Your Heart and Soul Healthcare account email was changed',
    },
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
  const cos = (p.cosign ?? {}) as Partial<CosignSettings>;
  const pat = (p.patient ?? {}) as Partial<PatientSettings>;
  const vit = (p.vitals ?? {}) as Partial<VitalsSettings>;
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
    cosign: {
      // Dedupe + filter to known credentials. An admin who somehow
      // sneaks RN in (e.g. via direct console edit) gets it stripped
      // rather than breaking the cosign logic.
      requiredCredentials: Array.isArray(cos.requiredCredentials)
        ? Array.from(
            new Set(
              cos.requiredCredentials.filter((c): c is CosignableCredential =>
                ALL_COSIGNABLE_CREDENTIALS.includes(c as CosignableCredential),
              ),
            ),
          )
        : [...DEFAULT_SETTINGS.cosign.requiredCredentials],
    },
    patient: {
      allowFreeText:
        typeof pat.allowFreeText === 'boolean'
          ? pat.allowFreeText
          : DEFAULT_SETTINGS.patient.allowFreeText,
    },
    vitals: {
      rangesByAgeGroup: sanitizeVitalOverrides(vit.rangesByAgeGroup),
    },
    criticalVitals: {
      enabled:
        typeof (p.criticalVitals as Partial<CriticalVitalsSettings> | undefined)?.enabled === 'boolean'
          ? (p.criticalVitals as CriticalVitalsSettings).enabled
          : DEFAULT_SETTINGS.criticalVitals.enabled,
    },
    branding: mergeBranding(p.branding),
    emails: mergeEmails(p.emails),
  };
}

function mergeBranding(input: unknown): BrandingSettings {
  const src = (input ?? {}) as Partial<BrandingSettings>;
  return {
    orgName:
      typeof src.orgName === 'string' && src.orgName.trim()
        ? src.orgName.trim()
        : DEFAULT_SETTINGS.branding.orgName,
    tagline:
      typeof src.tagline === 'string' ? src.tagline : DEFAULT_SETTINGS.branding.tagline,
    fromEmailDisplay:
      typeof src.fromEmailDisplay === 'string'
        ? src.fromEmailDisplay
        : DEFAULT_SETTINGS.branding.fromEmailDisplay,
  };
}

function mergeEmails(input: unknown): EmailsSettings {
  const src = (input ?? {}) as Partial<EmailsSettings>;
  const subs = (src.subjects ?? {}) as Partial<EmailsSubjects>;
  return {
    subjects: {
      staffInviteWelcome:
        typeof subs.staffInviteWelcome === 'string' && subs.staffInviteWelcome.trim()
          ? subs.staffInviteWelcome.trim()
          : DEFAULT_SETTINGS.emails.subjects.staffInviteWelcome,
      staffInviteResend:
        typeof subs.staffInviteResend === 'string' && subs.staffInviteResend.trim()
          ? subs.staffInviteResend.trim()
          : DEFAULT_SETTINGS.emails.subjects.staffInviteResend,
      emailChanged:
        typeof subs.emailChanged === 'string' && subs.emailChanged.trim()
          ? subs.emailChanged.trim()
          : DEFAULT_SETTINGS.emails.subjects.emailChanged,
    },
  };
}

/**
 * Sanitize the vital-range overrides coming out of Firestore. Drops
 * unknown age groups, unknown vital keys, and any pair where low/high
 * isn't a finite number or low > high. Defensive — we'd rather use
 * the hard-coded default than feed garbage into the form's real-time
 * alerts.
 */
function sanitizeVitalOverrides(input: unknown): VitalRangesOverride {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: VitalRangesOverride = {};
  for (const group of ALL_VITAL_AGE_GROUPS) {
    const groupSrc = src[group];
    if (!groupSrc || typeof groupSrc !== 'object') continue;
    const groupMap = groupSrc as Record<string, unknown>;
    const cleanedGroup: { [V in VitalRangeKey]?: VitalRangePair } = {};
    let hasAny = false;
    for (const vital of ALL_VITAL_RANGE_KEYS) {
      const pair = groupMap[vital];
      if (!pair || typeof pair !== 'object') continue;
      const p = pair as { low?: unknown; high?: unknown };
      if (
        typeof p.low === 'number' &&
        typeof p.high === 'number' &&
        Number.isFinite(p.low) &&
        Number.isFinite(p.high) &&
        p.low <= p.high
      ) {
        cleanedGroup[vital] = { low: p.low, high: p.high };
        hasAny = true;
      }
    }
    if (hasAny) out[group] = cleanedGroup;
  }
  return out;
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
  const cos = (p.cosign ?? {}) as Partial<CosignSettings>;
  const pat = (p.patient ?? {}) as Partial<PatientSettings>;
  const vit = (p.vitals ?? {}) as Partial<VitalsSettings>;

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

  if (cos.requiredCredentials !== undefined) {
    if (!Array.isArray(cos.requiredCredentials)) {
      throw new SettingsValidationError(
        'cosign.requiredCredentials',
        'requiredCredentials must be an array.',
      );
    }
    for (const c of cos.requiredCredentials) {
      if (!ALL_COSIGNABLE_CREDENTIALS.includes(c as CosignableCredential)) {
        throw new SettingsValidationError(
          'cosign.requiredCredentials',
          `Invalid credential "${String(c)}". Allowed: ${ALL_COSIGNABLE_CREDENTIALS.join(', ')}.`,
        );
      }
    }
  }

  if (pat.allowFreeText !== undefined && typeof pat.allowFreeText !== 'boolean') {
    throw new SettingsValidationError(
      'patient.allowFreeText',
      'allowFreeText must be true or false.',
    );
  }

  if (vit.rangesByAgeGroup !== undefined) {
    if (typeof vit.rangesByAgeGroup !== 'object' || vit.rangesByAgeGroup === null) {
      throw new SettingsValidationError(
        'vitals.rangesByAgeGroup',
        'rangesByAgeGroup must be an object.',
      );
    }
    // Per-leaf checks: every supplied low/high must be a finite number
    // with low ≤ high. sanitizeVitalOverrides will silently drop bad
    // pairs from Firestore data, but explicit PUTs should fail loudly
    // so the admin notices their typo.
    for (const [groupKey, groupVal] of Object.entries(vit.rangesByAgeGroup)) {
      if (!ALL_VITAL_AGE_GROUPS.includes(groupKey as VitalAgeGroupKey)) {
        throw new SettingsValidationError(
          `vitals.rangesByAgeGroup.${groupKey}`,
          `Unknown age group "${groupKey}".`,
        );
      }
      if (!groupVal || typeof groupVal !== 'object') {
        throw new SettingsValidationError(
          `vitals.rangesByAgeGroup.${groupKey}`,
          'Age group entry must be an object.',
        );
      }
      for (const [vitalKey, pair] of Object.entries(groupVal as Record<string, unknown>)) {
        if (!ALL_VITAL_RANGE_KEYS.includes(vitalKey as VitalRangeKey)) {
          throw new SettingsValidationError(
            `vitals.rangesByAgeGroup.${groupKey}.${vitalKey}`,
            `Unknown vital "${vitalKey}".`,
          );
        }
        if (!pair || typeof pair !== 'object') {
          throw new SettingsValidationError(
            `vitals.rangesByAgeGroup.${groupKey}.${vitalKey}`,
            'Range must be { low, high }.',
          );
        }
        const p = pair as { low?: unknown; high?: unknown };
        if (
          typeof p.low !== 'number' ||
          typeof p.high !== 'number' ||
          !Number.isFinite(p.low) ||
          !Number.isFinite(p.high)
        ) {
          throw new SettingsValidationError(
            `vitals.rangesByAgeGroup.${groupKey}.${vitalKey}`,
            'low and high must both be finite numbers.',
          );
        }
        if (p.low > p.high) {
          throw new SettingsValidationError(
            `vitals.rangesByAgeGroup.${groupKey}.${vitalKey}`,
            `low (${p.low}) cannot exceed high (${p.high}).`,
          );
        }
      }
    }
  }

  if (p.branding !== undefined) {
    const b = p.branding as Partial<BrandingSettings>;
    if (b.orgName !== undefined) {
      if (typeof b.orgName !== 'string') {
        throw new SettingsValidationError('branding.orgName', 'orgName must be a string.');
      }
      if (b.orgName.trim() === '') {
        throw new SettingsValidationError('branding.orgName', 'orgName cannot be empty.');
      }
      if (b.orgName.length > 80) {
        throw new SettingsValidationError('branding.orgName', 'orgName is too long (max 80 chars).');
      }
    }
    if (b.tagline !== undefined && typeof b.tagline !== 'string') {
      throw new SettingsValidationError('branding.tagline', 'tagline must be a string.');
    }
    if (b.tagline !== undefined && b.tagline.length > 120) {
      throw new SettingsValidationError('branding.tagline', 'tagline is too long (max 120 chars).');
    }
    if (b.fromEmailDisplay !== undefined && typeof b.fromEmailDisplay !== 'string') {
      throw new SettingsValidationError(
        'branding.fromEmailDisplay',
        'fromEmailDisplay must be a string.',
      );
    }
    if (b.fromEmailDisplay !== undefined && b.fromEmailDisplay.length > 80) {
      throw new SettingsValidationError(
        'branding.fromEmailDisplay',
        'fromEmailDisplay is too long (max 80 chars).',
      );
    }
  }

  if (p.emails !== undefined) {
    const e = p.emails as Partial<EmailsSettings>;
    if (e.subjects !== undefined) {
      const subs = e.subjects as Partial<EmailsSubjects>;
      for (const key of ['staffInviteWelcome', 'staffInviteResend', 'emailChanged'] as const) {
        const v = subs[key];
        if (v !== undefined) {
          if (typeof v !== 'string') {
            throw new SettingsValidationError(`emails.subjects.${key}`, `${key} must be a string.`);
          }
          if (v.trim() === '') {
            throw new SettingsValidationError(`emails.subjects.${key}`, `${key} cannot be empty.`);
          }
          if (v.length > 200) {
            throw new SettingsValidationError(
              `emails.subjects.${key}`,
              `${key} is too long (max 200 chars).`,
            );
          }
        }
      }
    }
  }

  return mergeWithDefaults(p);
}

function clampPageSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.submissions.pageSize;
  return Math.max(5, Math.min(100, Math.round(n)));
}
