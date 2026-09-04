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

// georgia.ts is pure data (no Firebase), so importing it preserves this
// module's unit-testability.
import { normalizeCounty, SERVICE_KEYS, type GappServiceKey } from './georgia';

/**
 * Heart & Soul's OWN intake profile: the counties and GAPP services the agency
 * itself accepts. Drives the per-referral fit indicator on the Referrals board
 * (good fit / possible fit / not a fit) — the first rung of the triage ladder
 * before partner smart-match and the Appendix P handoff. Editable in
 * /admin/settings; services are the same three GAPP lines partner agencies use.
 */
export interface IntakeSettings {
  counties: string[];
  services: GappServiceKey[];
}

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

/**
 * Editable copy for the family-facing "GAPP provider list" email — the last
 * rung of the refer-out ladder, sent when no partner agency can take a
 * referral. Admin-editable because it goes out under the org's name and the
 * wording is a judgement call, not a technical detail.
 *
 * Two placeholders are substituted at send time: `{{childName}}` (falls back to
 * "your child") and `{{phone}}` (the callback number below). Blank lines split
 * the long fields into separate paragraphs. Everything is HTML-escaped, so copy
 * can never inject markup.
 *
 * The greeting is deliberately NOT editable: it needs fallback logic
 * ("Hi <first name>," vs "Hello," when no contact name is on file) that a
 * free-text field can't carry.
 */
export interface ProviderListEmailSettings {
  subject: string;
  /** Callback number families are told to call; also fills `{{phone}}`. */
  phone: string;
  /** Opening paragraph(s), before the provider-list button. */
  intro: string;
  /** Paragraph(s) introducing the list, immediately above the button. */
  explainer: string;
  /** Text on the button that links the hosted Appendix P PDF. */
  ctaLabel: string;
  /** Paragraph(s) after the button. */
  closing: string;
  /** Sign-off line under the body. */
  signOff: string;
}

export interface EmailsSettings {
  subjects: EmailsSubjects;
  providerList: ProviderListEmailSettings;
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

export interface CorrectionsSettings {
  /**
   * Default for the "block new notes until amended" checkbox when a reviewer
   * flags a CORRECTION. The reviewer can uncheck per flag; this only sets the
   * starting position.
   */
  blockByDefault: boolean;
  /**
   * The corrections reviewer (normally the RN supervisor). uid drives the
   * server-side notifications when a nurse amends a blocked note; name and
   * phone are DENORMALIZED display copies shown to blocked nurses on the gate
   * ("Questions? Call …") — nurses can't read staff user docs, so the
   * contact info must live in settings, which every signed-in user can read.
   */
  reviewerUid: string;
  reviewerName: string;
  reviewerPhone: string;
}

export interface ShiftChangeAlertsSettings {
  /**
   * Who is alerted (email + bell, plus a PHI-free text when they have a phone
   * on file) when a nurse answers Yes to any "since your last shift" question
   * on a progress note: hospital admission, urgent care / ER visit, or a
   * medication started / changed / stopped. Staff uids. When EMPTY the alert
   * falls back to the corrections reviewer, so it works before anyone has
   * opened this section of Settings.
   */
  recipientUids: string[];
}

export interface AppSettings {
  submissions: SubmissionsSettings;
  cosign: CosignSettings;
  patient: PatientSettings;
  vitals: VitalsSettings;
  criticalVitals: CriticalVitalsSettings;
  corrections: CorrectionsSettings;
  shiftChangeAlerts: ShiftChangeAlertsSettings;
  branding: BrandingSettings;
  emails: EmailsSettings;
  intake: IntakeSettings;
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
  corrections: {
    blockByDefault: true,
    reviewerUid: '',
    reviewerName: '',
    reviewerPhone: '',
  },
  shiftChangeAlerts: {
    recipientUids: [],
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
    // The copy that shipped in PR #108, moved here verbatim so switching to
    // settings-driven copy changes nothing about what families receive. NOTE:
    // no em or en dashes in any of this — it goes out under the org's name, and
    // providerListContent.test.ts fails the build if one appears.
    providerList: {
      subject: 'A list of GAPP providers for your family',
      phone: '(470) 635-5774',
      intro:
        'Thank you for reaching out to Heart & Soul Healthcare about {{childName}}. After reviewing your referral, we are not able to take it on at this time.',
      explainer:
        "We do not want that to slow down your search for care. Georgia Medicaid publishes an official list of approved GAPP providers, with each provider's address and phone number. You can view and download it here:",
      ctaLabel: 'View the GAPP provider list (PDF)',
      closing:
        'Coverage areas change often, so we recommend calling a few providers directly to confirm they serve your county and are accepting new clients.\n\nIf your situation changes or you have any questions, reply to this email or call us at {{phone}}. We are sorry we could not help this time, and we wish your family the very best.',
      signOff: 'Heart & Soul Healthcare',
    },
  },
  intake: {
    // H&S's service area as of July 2026 — the same 20 counties the public
    // referral form advertises (primary + extended). Skilled nursing only for
    // now; more services get checked on in /admin/settings when offered.
    counties: [
      'Barrow', 'Bartow', 'Carroll', 'Cherokee', 'Clayton', 'Cobb', 'Coweta',
      'DeKalb', 'Douglas', 'Fayette', 'Forsyth', 'Fulton', 'Gilmer', 'Gwinnett',
      'Henry', 'Newton', 'Paulding', 'Pickens', 'Rockdale', 'Spalding',
    ],
    services: ['nursing'],
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
    corrections: mergeCorrections(p.corrections),
    shiftChangeAlerts: mergeShiftChangeAlerts(p.shiftChangeAlerts),
    branding: mergeBranding(p.branding),
    emails: mergeEmails(p.emails),
    intake: mergeIntake(p.intake),
  };
}

function mergeCorrections(input: unknown): CorrectionsSettings {
  const src = (input ?? {}) as Partial<CorrectionsSettings>;
  return {
    blockByDefault:
      typeof src.blockByDefault === 'boolean'
        ? src.blockByDefault
        : DEFAULT_SETTINGS.corrections.blockByDefault,
    reviewerUid: typeof src.reviewerUid === 'string' ? src.reviewerUid.trim() : '',
    reviewerName: typeof src.reviewerName === 'string' ? src.reviewerName.trim() : '',
    reviewerPhone: typeof src.reviewerPhone === 'string' ? src.reviewerPhone.trim() : '',
  };
}

function mergeShiftChangeAlerts(input: unknown): ShiftChangeAlertsSettings {
  const src = (input ?? {}) as Partial<ShiftChangeAlertsSettings>;
  const uids = Array.isArray(src.recipientUids)
    ? src.recipientUids.filter((u): u is string => typeof u === 'string').map((u) => u.trim()).filter(Boolean)
    : [];
  return { recipientUids: Array.from(new Set(uids)) };
}

function mergeIntake(input: unknown): IntakeSettings {
  const src = (input ?? {}) as Partial<IntakeSettings>;
  // An explicitly-saved empty array is respected (it means "nothing right
  // now"); a missing field falls back to the defaults. Entries are normalized
  // against the canonical lists so garbage can't reach the fit logic.
  const counties = Array.isArray(src.counties)
    ? [...new Set(src.counties.map((c) => normalizeCounty(c)).filter((c): c is string => c !== null))].sort()
    : [...DEFAULT_SETTINGS.intake.counties];
  const services = Array.isArray(src.services)
    ? SERVICE_KEYS.filter((k) => (src.services as string[]).includes(k))
    : [...DEFAULT_SETTINGS.intake.services];
  return { counties, services };
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
    providerList: mergeProviderListEmail(src.providerList),
  };
}

/** Field-by-field fallback so a partially-saved doc can't blank out the email. */
function mergeProviderListEmail(input: unknown): ProviderListEmailSettings {
  const src = (input ?? {}) as Partial<ProviderListEmailSettings>;
  const def = DEFAULT_SETTINGS.emails.providerList;
  const pick = (key: keyof ProviderListEmailSettings): string => {
    const v = src[key];
    return typeof v === 'string' && v.trim() ? v : def[key];
  };
  return {
    subject: pick('subject'),
    phone: pick('phone'),
    intro: pick('intro'),
    explainer: pick('explainer'),
    ctaLabel: pick('ctaLabel'),
    closing: pick('closing'),
    signOff: pick('signOff'),
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
  const sca = (p.shiftChangeAlerts ?? {}) as Partial<ShiftChangeAlertsSettings>;

  if (
    sca.recipientUids !== undefined &&
    (!Array.isArray(sca.recipientUids) || sca.recipientUids.some((u) => typeof u !== 'string'))
  ) {
    throw new SettingsValidationError(
      'shiftChangeAlerts.recipientUids',
      'recipientUids must be an array of staff uids.',
    );
  }

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

  if (p.intake !== undefined) {
    const i = p.intake as Partial<IntakeSettings>;
    if (i.counties !== undefined) {
      if (!Array.isArray(i.counties)) {
        throw new SettingsValidationError('intake.counties', 'counties must be an array.');
      }
      for (const c of i.counties) {
        if (typeof c !== 'string' || normalizeCounty(c) === null) {
          throw new SettingsValidationError(
            'intake.counties',
            `"${String(c)}" is not a Georgia county.`,
          );
        }
      }
    }
    if (i.services !== undefined) {
      if (!Array.isArray(i.services)) {
        throw new SettingsValidationError('intake.services', 'services must be an array.');
      }
      for (const s of i.services) {
        if (!SERVICE_KEYS.includes(s as GappServiceKey)) {
          throw new SettingsValidationError(
            'intake.services',
            `Invalid service "${String(s)}". Allowed: ${SERVICE_KEYS.join(', ')}.`,
          );
        }
      }
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
    if (e.providerList !== undefined) {
      const pl = e.providerList as Partial<ProviderListEmailSettings>;
      // Generous caps: this is prose an admin writes, and the only real risk is
      // an accidental paste of something enormous.
      const LIMITS: Record<keyof ProviderListEmailSettings, number> = {
        subject: 200, phone: 40, ctaLabel: 80, signOff: 120,
        intro: 2000, explainer: 2000, closing: 2000,
      };
      for (const key of Object.keys(LIMITS) as (keyof ProviderListEmailSettings)[]) {
        const v = pl[key];
        if (v === undefined) continue;
        if (typeof v !== 'string') {
          throw new SettingsValidationError(`emails.providerList.${key}`, `${key} must be a string.`);
        }
        if (v.trim() === '') {
          throw new SettingsValidationError(`emails.providerList.${key}`, `${key} cannot be empty.`);
        }
        if (v.length > LIMITS[key]) {
          throw new SettingsValidationError(
            `emails.providerList.${key}`,
            `${key} is too long (max ${LIMITS[key]} chars).`,
          );
        }
      }
      // Subject lines travel unencrypted through mail servers and show up in
      // notification previews, so the child's name must never go there.
      if (typeof pl.subject === 'string' && /\{\{\s*childName\s*\}\}/.test(pl.subject)) {
        throw new SettingsValidationError(
          'emails.providerList.subject',
          'The subject cannot include {{childName}} — subject lines must stay free of client names.',
        );
      }
    }
  }

  return mergeWithDefaults(p);
}

function clampPageSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.submissions.pageSize;
  return Math.max(5, Math.min(100, Math.round(n)));
}
